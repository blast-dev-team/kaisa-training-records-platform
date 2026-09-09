# Kaisa Backend — Vibe Coding Guide

FastAPI + SQLAlchemy(async) + Alembic + uv. 처음 만지는 사람도, AI한테 시키는 사람도 이 문서만 읽으면 시작할 수 있게 작성.

## 1. 작업 전에 반드시 알고 가야 할 것

### 폴더 구조 — Domain-driven, 계층이 정해져 있음

```
backend/api/
├── app/
│   ├── main.py              # FastAPI 앱, lifespan, CORS, 전역 예외 핸들러, 라우터 등록
│   ├── seed.py              # 개발용 시드 (make seed)
│   ├── core/                # 인프라 공통
│   │   ├── config.py        # pydantic-settings 환경변수 (settings 싱글턴, Secrets Manager 로더)
│   │   ├── database.py      # async engine, async_session, Base, get_db
│   │   ├── dependencies.py  # 인증 의존성 (require_admin / require_super / get_current_trainee)
│   │   ├── security.py      # 비밀번호 해싱
│   │   ├── session.py       # DB 세션 테이블 + 쿠키 파라미터
│   │   ├── crypto.py        # CI/DI/IP 해시(sha256) + Fernet 필드 암호화 + 전화 마스킹
│   │   ├── kst.py           # now_kst / today_kst / ensure_kst (타임존 KST 고정)
│   │   ├── audit.py         # record_audit — 감사 로그 공통 기록
│   │   ├── rate_limit.py    # 로그인·진위확인 시도 제한
│   │   ├── error_codes.py   # 공통 에러 코드 + 한국어 메시지 매핑 (api_error)
│   │   └── response.py      # PagedResponse 공통 래퍼
│   ├── domain/              # 도메인별 모듈
│   │   └── (도메인)/
│   │       ├── model/       # SQLAlchemy 모델 + enums.py
│   │       ├── schema/      # Pydantic 입출력 스키마
│   │       ├── repository/  # DB 쿼리 (얇게)
│   │       ├── service/     # 비즈니스 로직
│   │       └── router.py    # APIRouter — 라우터는 얇게
│   └── integrations/
│       └── portone.py       # PortOne 클라이언트 (본인인증·결제)
├── alembic/versions/        # 마이그레이션
└── tests/
    ├── unit/                # 무DB 단위테스트
    └── integration/         # DB 통합테스트 (kaisa_test)
```

도메인 목록:

| 도메인 | 담당 |
|---|---|
| `auth` | 관리자 가입(화이트리스트)·로그인·세션·계정·화이트리스트 관리 |
| `identity` | PASS 본인인증 — CI 해시 매칭 + 수동 심사 |
| `me` | 회원 포털 (내 이력·확인서·주문·가격) |
| `trainee` | 교육생·회원등급 마스터 (어드민) |
| `institution` | 교육기관·과정 마스터 (어드민) |
| `training_record` | 교육이력 (어드민) |
| `certificate` | 확인서 발급·가격규칙·공개 진위확인 |
| `payment` | 결제 주문·confirm·웹훅·환불 |
| `audit` | 감사 로그 조회 |
| `health` | 헬스체크 |

새 도메인 추가 체크리스트:

- [ ] `app/domain/<name>/` 에 `model/`, `schema/`, `repository/`, `service/`, `router.py` 작성
- [ ] 모델을 `app/domain/__init__.py` 또는 alembic env가 보는 위치에 import — **빠뜨리면 alembic이 모델을 못 봄**
- [ ] `app/main.py` 에 `include_router(<name>_router, prefix="/api")` 추가
- [ ] 마이그레이션 생성 (§2 참고)
- [ ] 계층 규칙은 `.claude/rules/back/fastapi.md` 참고

### 계층 분리 — Router → Service → Repository

- **router**: HTTP 입출력, `response_model`, status code. 비즈니스 로직 금지
- **service**: 비즈니스 로직·검증·`api_error` raise. Repository 호출
- **repository**: SQLAlchemy 쿼리만. `HTTPException` 절대 금지 — None 반환하고 service에서 404 처리

### ORM은 모두 비동기

- `async def` + `AsyncSession` + `Depends(get_db)` 패턴 강제
- `await db.execute(select(...))` 사용 — 동기 `session.query(...)` 금지
- I/O 호출은 항상 `await`. 빠뜨리면 코루틴 객체가 그대로 흘러나감

### 에러 — `api_error(code)` 로 raise

```python
from app.core.error_codes import api_error

raise api_error("CERTIFICATE_ALREADY_ISSUED")        # 코드표의 status·문구 자동
raise api_error("NOT_FOUND", message="확인서를 찾을 수 없어요")  # 문구 재정의
```

- 에러 코드·한국어 문구는 `app/core/error_codes.py` 한 곳에서 관리. 새 코드는 여기에 추가
- `main.py` 전역 핸들러가 `{code, message}` 형태로 언래핑 → `back/api-design.md` 응답 형태 준수
- 검증 에러(422)도 필드별 `errors` 배열로 통일. 스택 트레이스·DB 에러·내부 경로 응답 노출 금지

### 인증 의존성 — 3종 (`app/core/dependencies.py`)

| 의존성 | 통과 조건 | 용도 |
|---|---|---|
| `require_admin` | 관리자 세션 (role 무관) | 어드민 API 공통 |
| `require_super` | role == super | 관리자 계정 관리 등 |
| `get_current_trainee` | 회원 세션 + 교육생 연결 | `/me/*`, 발급·결제. **타인 리소스는 404** |

세션은 DB 세션 테이블 + httponly 쿠키(`kaisa_session`). 토큰은 opaque 랜덤이라 서명키 없음.

### URL & 응답 컨벤션 (`back/api-design.md`)

- 모든 API 는 `/api` 프리픽스. 리소스는 복수형 명사, URL에 동사 금지
- 생성 `201` + 리소스, 수정 `200`, 삭제 `204`, 비동기 액션 `200 {ok: true}`
- 목록은 `PagedResponse` (`{items, total, page, limit, total_pages}`, 기본 20) 또는 단순 배열(마스터성)
- 정적 경로(`/trainees/summary` 등)는 `/{id}` 라우트보다 **위에** 선언

### 패키지 매니저는 uv

```bash
uv add <패키지>             # 의존성 추가
uv add --dev <패키지>       # 개발 의존성 추가
uv sync                     # lock에 맞춰 환경 동기화
uv run <명령어>             # 가상환경에서 실행
```

`pip install` 혼용 금지. `uv.lock`은 반드시 커밋.

### 진짜 스키마 소스는 모델 + 마이그레이션

로컬·스테이징·프로덕션 모두 PostgreSQL. 스키마 변경은 항상 alembic을 거친다.

- 모델 바꿨으면 **항상 마이그레이션을 만들고 적용**. DB만 들여다보면 누락을 못 알아챔
- 문서(`docs/backend/db-schema.md`·`dbdiagram.io`)도 함께 갱신 — `.claude/rules/project/db-planning.md` 참고. 스키마 변경은 승인 게이트 대상

---

## 2. 마이그레이션 (Alembic)

### 모델 변경 후 마이그레이션 생성

```bash
cd backend/api
make migration name="add trainee memo"        # alembic revision --autogenerate
```

생성된 파일은 `alembic/versions/` 에. **반드시 열어보고 확인**:

- autogenerate가 의도와 다르게 컬럼을 drop/rename으로 잡는 경우 있음 — 배포 계획 문서의 교훈: **autogenerate는 의도하지 않은 DROP을 뿜는다**
- 데이터 마이그레이션이 필요하면 `op.execute(...)` 로 수동 작성

### 적용 / 롤백

```bash
make migrate                          # alembic upgrade head (최신까지)
uv run alembic upgrade +1             # 한 단계만
uv run alembic downgrade -1           # 한 단계 롤백
uv run alembic current                # 현재 적용 리비전
uv run alembic history                # 히스토리
```

### autogenerate 가 변경을 못 잡을 때

1. 모델 import 누락 → 도메인 `model/__init__.py` 확인
2. alembic이 다른 `DATABASE_URL`을 봄 → `.env` 확인 (alembic은 `settings` 를 사용)

### CI 방어

`.github/workflows/ci.yml` 이 **alembic single-head 검사**를 한다. 두 PR 이 같은 부모에서 분기해 head 가 갈라지면 배포 시 `Multiple head revisions` 실패 → merge migration 으로 합칠 것.

### 절대 하지 말 것

- 이미 머지된 마이그레이션 파일 수정 — 항상 새 리비전 추가
- 로컬 DB에 `psql`로 직접 ALTER TABLE
- 프로덕션에서 `--autogenerate` — 항상 로컬에서 생성/검토 후 PR
- **운영 DB를 임의로 일괄 재계산/수정하는 마이그레이션** — 데이터 정합성 작업은 계획 문서로 별도 승인

---

## 3. 설정 / 환경변수

### `.env` 파일

`backend/api/.env` 에 위치 (`cp .env.example .env`). 주요 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENVIRONMENT` | `local` | `local` \| `staging` \| `production`. 쿠키 secure 분기 등 |
| `DATABASE_URL` | `postgresql+asyncpg://kaisa:kaisa@localhost:5432/kaisa` | 비동기 드라이버 `+asyncpg` 필수 |
| `DB_PASSWORD` | — | docker-compose DB 컨테이너 공유 (로컬 Docker 시) |
| `AWS_SECRETS_NAME` | (빈) | 설정 시 부팅 때 Secrets Manager → os.environ 주입. 로컬은 비움 |
| `CRYPTO_KEY` | — | **필수** Fernet 키 (`openssl rand -base64 32`). 없으면 부팅 실패 |
| `IP_HASH_SALT` | (빈) | 진위확인 IP 해시 솔트. 비면 CRYPTO_KEY 사용 |
| `FRONTEND_URL` / `CORS_ORIGINS` | `http://localhost:3000` | CORS 허용 오리진 (추가는 쉼표 구분) |
| `PORTONE_*` 6종 | — | 본인인증·결제. store id·api secret·channel key 2종·webhook secret |
| `RATE_LIMIT_*` | 5/300s, 10/60s | 로그인·공개 진위확인 시도 제한 |
| `CERTIFICATE_VALID_DAYS` | `0` | 확인서 유효기간(일). 0 = 무기한 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | `make seed` 마스터 계정 |
| `SENTRY_DSN` / `RELEASE` | (빈) | 비우면 Sentry 비활성화 |

### Secrets Manager 로더 (`config.py`)

- `AWS_SECRETS_NAME` 설정 시 부팅에서 시크릿(JSON 평면 구조)을 `os.environ.setdefault` 로 주입
- 미설정/빈값이면 **no-op** — 로컬은 `.env` 만으로 부팅
- 이미 설정된 환경변수는 덮어쓰지 않음 → 배포 compose `environment` 로 개별 override 가능

### 새 환경변수 추가

1. `app/core/config.py` 의 `Settings` 에 필드 추가
2. `.env.example` 에 키 + 주석 (값 비움)
3. 서버 값은 Secrets Manager 시크릿에 추가 후 **재배포** (부팅 시 로드)
4. 시크릿 절대 git 커밋 금지

### 주요 설정 위치 요약

| 무엇 | 어디 |
|------|------|
| 환경변수 | `app/core/config.py` + `.env` |
| DB 엔진/세션 | `app/core/database.py` |
| 인증 의존성 | `app/core/dependencies.py` |
| 세션·쿠키 | `app/core/session.py` + `config.SESSION_*` |
| CORS | `app/main.py` (settings.cors_origins) |
| 에러 코드 | `app/core/error_codes.py` |
| Alembic | `alembic.ini`, `alembic/env.py` |
| 의존성 | `pyproject.toml`, lock은 `uv.lock` |

---

## 4. 로컬 실행

전제: PostgreSQL 이 떠 있고 `kaisa` role + `kaisa` DB 가 있어야 한다.

```bash
createuser kaisa --createdb --pwprompt   # 비밀번호: kaisa
createdb kaisa -O kaisa

cd backend/api
cp .env.example .env      # CRYPTO_KEY 필수 생성
make install              # uv sync
make migrate              # alembic upgrade head
make seed                 # 등급 3종 + 마스터 admin + 교육생 시드 (선택)
make dev                  # http://localhost:8000 (TZ=UTC 고정 — 프로덕션과 동일)
```

- API 문서(Scalar): http://localhost:8000/scalar
- OpenAPI JSON: http://localhost:8000/openapi.json
- 헬스체크: http://localhost:8000/api/health

DB를 초기화하고 싶으면 `make reset` (DROP + CREATE + 마이그레이션 재적용).

코드 스타일:

```bash
make lint && make fmt      # ruff check + format
```

---

## 5. 테스트

```bash
make test                 # 전체 (단위 + 통합)
uv run pytest tests/unit -q         # 무DB 단위만
uv run pytest tests/integration -q  # DB 통합만
```

- 통합 테스트는 **별도 DB `kaisa_test`** — `tests/conftest.py` 가 app import 전에 `DATABASE_URL` 을 강제 주입하므로 개발 DB를 건드리지 않는다. 최초 1회:

```bash
psql -h localhost -U kaisa -d postgres -c "CREATE DATABASE kaisa_test OWNER kaisa;"
```

- 마이그레이션은 테스트 세션마다 `alembic upgrade head` 로 적용(운영과 동일 경로), 각 테스트는 TRUNCATE 로 격리
- 시간 관련 로직은 **KST 새벽(00~09시)을 고정**해 검증 (`vi.setSystemTime` 등) — `.claude/rules/project/timezone.md`

---

## 6. Docker (로컬 풀스택)

```bash
cp .env.example .env      # DB_PASSWORD·CRYPTO_KEY 설정
make up                   # db + api + nginx 기동
make logs                 # api 로그 추적
make db-shell             # psql 진입
make down
```

- `api`는 8000을 `expose` 로만 열고 **nginx(80/443) 통해서만 외부 노출**
- 로컬 443은 Tailscale 이 점유할 수 있다 — 그럴 땐 `docker-compose.override.yml`(gitignore) 로 8443 + 자체서명 인증서(`.local-certs/`) 사용. ports 는 union 병합되므로 `ports: !override` 태그 필요
- nginx conf 는 `nginx/templates/default.conf.template` (envsubst — `${SERVER_NAME}` 로 도메인 주입)

---

## 7. 배포

### 환경

| 환경 | 구조 | 트리거 |
|------|------|--------|
| staging | EC2 + docker compose (api + postgres + nginx) | 태그 `be-staging-v*` push |
| production | EC2 + docker compose (동일 구조, 별도 EC2·시크릿) | 태그 `be-prod-v*` push |

```bash
git tag be-staging-v0.1.0
git push origin be-staging-v0.1.0
```

GitHub Actions(`.github/workflows/deploy.yml`)이 EC2로 SSH → 태그 checkout → `compose up -d --build` → **alembic 자동** → 이미지 prune.

- 시크릿은 **Secrets Manager**(`kaisa-staging` / `kaisa-prod`)에서 인스턴스 롤로 로드 — 서버에 `.env` 없음. `DB_PASSWORD` 만 배포 스크립트가 compose interpolation 용으로 export
- 마이그레이션은 배포와 틈 없이 자동 — 스테이징에서 리허설된 것만 프로덕션에
- 시크릿 변경은 Secrets Manager 수정 후 **재배포** (부팅 시 로드)
- AWS 수동 설정(도메인·EC2·IAM 롤·certbot) 절차: [docs/backend/backend-deployment.md](../../docs/backend/backend-deployment.md) Phase B~D

---

## 8. 보안 원칙 — 이 프로젝트 특화

금융·개인정보(주민등록 CI/DI)를 다루므로 아래는 예외 없음:

- **CI/DI/IP 원문 저장 금지** — 수신 즉시 sha256 해시(`app/core/crypto.py`). 로그에 PII 미노출(요청 바디 로깅 금지)
- **전화번호** — Fernet 암호화 저장, 응답은 항상 마스킹(`010-****-5678`). 전화 검색 API 없음
- **공개 진위확인 로그** — IP 는 해시로만 보관, rate limit 적용
- **회원 스코프** — `get_current_trainee` 로 본인 리소스만. 타인 것은 404 (존재 여부 누출 방지)
- **500 응답** — `INTERNAL_ERROR` + 고정 문구. 상세는 서버 로그에만
- **시간대는 KST 고정** (`app/core/kst.py`) — `datetime.now()` / `date.today()` 금지 (ruff DTZ 가 잡음)

---

## 더 깊은 컨벤션은

- API 디자인·에러·페이지네이션: [.claude/rules/back/api-design.md](../../.claude/rules/back/api-design.md)
- FastAPI 계층 패턴: [.claude/rules/back/fastapi.md](../../.claude/rules/back/fastapi.md)
- 보안: [.claude/rules/common/security.md](../../.claude/rules/common/security.md) · 위 §8
- 에러 처리: [.claude/rules/common/error-handling.md](../../.claude/rules/common/error-handling.md)
- 커밋 컨벤션: [.claude/rules/project/git-commit.md](../../.claude/rules/project/git-commit.md)
- 프론트 연동 가이드: [docs/web/api.md](../../docs/web/api.md) · [docs/admin/api.md](../../docs/admin/api.md)
