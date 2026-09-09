# 백엔드 배포 — 실행 계획

> 작성일: 2026-09-08
> 기준: gongcar-apps 스테이징 패턴(EC2 + docker compose + nginx + Secrets Manager + 태그 배포) 복제
> 이 문서에는 **시크릿을 적지 않는다.** 값의 위치만 가리킨다.

---

## 1. gongcar-apps 배포 방식 요약

### 백엔드 — 환경별로 구조가 다르다

| | 스테이징 | 프로덕션 |
|---|---|---|
| 실행 | **EC2 + docker compose** (api + postgres + nginx) | **ECS Fargate** (2 task, ALB) |
| 트리거 | 태그 `be-staging-v*` push | 태그 `be-prod-v*` push |
| 동작 | SSH → 태그 checkout → `compose up -d --build` → **alembic 자동** → 이미지 prune | ECR build/push → `force-new-deployment` → 안정화 대기 |
| 마이그레이션 | ✅ 자동 | ⚠️ **수동** — 배포 후 별도 실행. 늦으면 신규 컬럼 참조 API 500 |
| 시크릿 | Secrets Manager `crm-staging` (인스턴스 롤, `.env` 없음). `DB_PASSWORD`만 배포 스크립트가 셸 export | task-def env 11개 + Secrets Manager `prod` 13개. 앱 부팅 시 `AWS_SECRETS_NAME` 보고 로드 |
| HTTPS | nginx 컨테이너 + Let's Encrypt (`/etc/letsencrypt` 마운트) | ALB |

핵심 파일(gongcar-apps):
- `.github/workflows/deploy.yml` — 배포 워크플로우 (Slack 시작/성공/실패 알림 포함)
- `.github/workflows/ci.yml` — **alembic single-head 검사**. head가 갈라지면 배포 시 `Multiple head revisions` 실패 → PR 단계에서 방어
- `backend/api/Dockerfile` — python 3.13-slim, `TZ=Asia/Seoul`, uv layer 캐시, uvicorn
- `backend/api/nginx/nginx.conf` — 80/443, `client_max_body_size 20M`, `/health` → `api:8000/api/health` 프록시
- `docs/infra-handover.md` — 배포 인수인계 전문 (참고용)

### 프론트엔드 — AWS Amplify

- Amplify 앱이 저장소 `dev` 브랜치 직접 감시 → **`dev` 머지 즉시 자동 배포**. 태그·승인 없음
- 빌드 설정 `amplify.yml` — 콘솔에도 사본. 수정은 콘솔에서만 가능
- 본 문서 범위 외. 백엔드 먼저.

### 스테이징/운영 분리를 하는 이유 (요약)

- 스테이징은 "사용자가 없는 운영" — 지울 수 있고, 망가뜨려도 되고, **운영 DB를 미러링해 실데이터로 버그 재현** 가능 (`mirror-prod-to-staging.sh`)
- 마이그레이션 리허설: 깨진 마이그레이션을 운영 전에 잡음
- 배포 2단계 릴리즈: `be-staging-v1` 확인 → `be-prod-v1`
- 귀찮은 건 분리가 아니라 **구조 비대칭**(EC2 vs ECS). gongcar은 역사적 사정(스테이징 먼저 싸게 → 운영 나중에 ECS 업그레이드)
- **kaisa는 스테이징 EC2 1대로 시작, 프로덕션도 운영 확정.** 실사용자 투입 전 별도 프로덕션 EC2를 **같은 구조(compose)로** 추가 — gongcar의 EC2/ECS 비대칭은 물려받지 않는다. 스테이징 = 지워도 되는 검증 환경, 프로덕션 = 훈련기록 등 지우면 안 되는 데이터.

---

## 2. kaisa 현재 상태 (2026-09-08 확인)

**있음:**
- `backend/api/Dockerfile` — gongcar 계열, `TZ=Asia/Seoul`, uv layer 캐시
- `backend/api/docker-compose.yml` — db + api (nginx 없음, api가 8000 직접 노출)
- `backend/api/app/core/config.py` — **Secrets Manager 로더 이미 이식됨** (`_load_aws_secrets_into_env`, boto3 lazy import)
- `backend/api/.dockerignore`
- 헬스체크 라우터 `/api/health` (nginx 프록시 경로와 일치)

**없음 (블로커 포함):**
- ❌ **`uv.lock` 없음** — Dockerfile이 `COPY pyproject.toml uv.lock` + `uv sync --frozen` → 빌드 실패
- ❌ **boto3 의존성 없음** — 서버에서 `AWS_SECRETS_NAME` 세팅 시 loader가 import → 부팅 죽음
- ❌ `.github/workflows/` — CI·배포 없음
- ❌ `nginx/` 디렉터리·nginx 서비스 없음
- alembic은 스캐폴드만 있고 versions 비어 있음 (첫 도메인 모델 만들 때 초기 마이그레이션 생성)

---

## 3. 실행 계획

### Phase A — 레포 작업 (로컬, 의존 순서대로)

#### A1. boto3 추가 + uv.lock 생성 ← 빌드 블로커, 제일 먼저

```bash
cd backend/api
uv add boto3        # pyproject + uv.lock 동시 생성
```

verify: `uv.lock` 생성 + `uv run python -c "import boto3"` 성공

#### A2. 로컬 docker 검증

```bash
cd backend/api
DB_PASSWORD=kaisa docker compose up --build -d
curl localhost:8000/api/health   # 200
docker compose down
```

#### A3. nginx 추가 + compose 수정

- `backend/api/nginx/nginx.conf` 신규 — gongcar 것 복사 후 `server_name`만 kaisa 도메인으로
- compose 수정:
  - `nginx` 서비스 추가 (80/443, conf·letsencrypt 읽기 마운트)
  - `api`의 `ports: "8000:8000"` **제거** (nginx 통해서만 노출)
  - `api` environment에 `AWS_SECRETS_NAME: ${AWS_SECRETS_NAME:-kaisa-staging}`, `AWS_REGION` 추가

verify: `docker compose config` 유효 + 재기동해 `/api/health` 200

#### A4. `.github/workflows/deploy.yml` 작성

gongcar 것 복사 후 수정 3곳:
- EC2 경로 `/home/ec2-user/gongcar-api` → `/home/ec2-user/kaisa-api`
- 시크릿 이름 `crm-staging` → `kaisa-staging`
- Slack 단계는 처음엔 제외 (Secrets 없으면 워크플로우 실패) → 도입 후 추가
- `be-prod-v*` job은 유지 (Phase E — 시크릿 등록 전까지 태그 미발행하면 무해)

`alembic upgrade head` 자동 포함 — versions 비어 있으면 no-op라 안전.

#### A5. `.github/workflows/ci.yml` 작성

gongcar 것 그대로 이식 — alembic single-head 검사.

#### A6. (선택) Makefile에 `deploy-staging`, `secret-staging` 타깃

### Phase B — AWS 인프라 (콘솔/CLI)

#### B1. 도메인 결정

백엔드 서브도메인 (예: `api-dev.<도메인>`). Let's Encrypt 발급 대상. DNS A레코드 1건.

#### B2. EC2 생성

- Amazon Linux 2023, `t3.small` (postgres+api+nginx 동시 구동 — micro는 빠듯)
- 키페어 생성 → 개인키 보관 (이후 GitHub Secret)
- 보안그룹: 22(내 IP만), 80, 443

#### B3. IAM 인스턴스 롤

정적 키 없이 인스턴스 메타데이터로 자격증명:
- 정책: `secretsmanager:GetSecretValue`, Resource를 시크릿 `kaisa-staging` ARN으로 한정
- 롤을 EC2에 부착

#### B4. Secrets Manager 시크릿 `kaisa-staging` 생성

JSON 평면 구조 (loader 호환):

```json
{
  "DB_PASSWORD": "<강한 비밀번호>",
  "ENVIRONMENT": "staging",
  "FRONTEND_URL": "https://<프론트도메인>"
}
```

`DATABASE_URL`은 compose가 `DB_PASSWORD`로 조립하므로 시크릿에 불필요. `PORTONE_*`(본인인증·결제) 키는 해당 Phase 구현 시 추가.

#### B5. EC2 초기화 (SSH 1회)

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user  # 재로그인
git clone <kaisa-repo> ~/kaisa-api
sudo dnf install -y certbot
sudo certbot certonly --standalone -d <백엔드도메인>   # DNS A레코드 붙은 뒤
sudo chmod -R 755 /etc/letsencrypt                      # nginx 컨테이너 읽기용
```

#### B6. 서버 수동 첫 기동 (자동화 전 1회)

```bash
cd ~/kaisa-api/backend/api
export AWS_REGION=ap-northeast-2 AWS_SECRETS_NAME=kaisa-staging
export DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id kaisa-staging \
  --region ap-northeast-2 --query SecretString --output text \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['DB_PASSWORD'])")
docker compose up -d --build
docker compose exec -T api alembic upgrade head
```

verify: `curl https://<도메인>/health` 200

### Phase C — GitHub Secrets 등록

| Secret | 값 |
|---|---|
| `EC2_SSH_KEY` | EC2 키페어 개인키 전문 |
| `STAGING_EC2_HOST` | EC2 IP |

verify: `ssh -i <키> ec2-user@<ip>` 수동 접속 성공

### Phase D — 자동 배포 검증

```bash
git tag be-staging-v0.1.0 && git push origin be-staging-v0.1.0
```

- [ ] Actions 성공 (SSH → 태그 checkout → compose up → alembic)
- [ ] `curl https://<도메인>/health` 200
- [ ] 재태그(`be-staging-v0.1.1`) → 재배포 성공
- [ ] EC2에서 `docker compose ps` 전부 healthy

### Phase E — 프로덕션 (실사용자 투입 시점)

스테이징 Phase B~D와 동일 레시피, 값만 교체:

- EC2 신규(t3.small 이상) · 보안그룹 22/80/443 동일
- Secrets Manager `kaisa-prod` — 스키마 동일, `ENVIRONMENT=production`
- 도메인: 프로덕션 서브도메인(예: `api.<도메인>`) + Let's Encrypt
- GitHub Secrets: `PROD_EC2_HOST` (SSH 키는 `EC2_SSH_KEY` 재사용)
- 태그 `be-prod-v*` push → 배포. deploy.yml에 prod job을 미리 포함해 둔다(시크릿 등록 전에는 태그를 밀지 않으면 무해)
- 마이그레이션은 배포와 틈 없이 자동 — 스테이징에서 리허설된 것만 프로덕션에

프론트(Amplify)도 프로덕션 브랜치 필요 — 본 문서 범위 외.

---

## 4. 순서 요약

```
A1 → A2   레포 블로커 제거 (즉시 가능)
A3 ~ A6   레포 배포 파일 (즉시 가능)
B1 ~ B6   AWS — 도메인·계정 권한 필요, 일정 변수
C         GitHub 세팅 (5분)
D         검증
E         프로덕션 — 실사용자 투입 시점 (스테이징 레시피 재사용)
```

## 5. 배포 후 운영 규칙 (gongcar 교훈 이식)

- **마이그레이션은 autogenerate 금지** — `uv run alembic check`로 차이 보고 필요한 것만 수기 작성. autogenerate는 의도하지 않은 DROP을 뿜는다
- **운영(향후) 마이그레이션은 배포와 틈 없이** — 컬럼 추가는 먼저 돌려도 안전(구버전 코드에 영향 없음), 늦으면 신규 컬럼 참조 API 500
- 시크릿 변경: Secrets Manager 수정 후 **재배포** (부팅 시 로드)
- 배포 알림(Slack)은 Phase D 통과 후 추가
