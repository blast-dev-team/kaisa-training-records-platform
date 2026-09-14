# 인프라 인벤토리 — 스테이징·프로덕션

> 작성일: 2026-09-14
> 기준: [backend-deployment.md](backend-deployment.md) Phase A~D 완료 시점의 실제 인프라 상태
> 이 문서에는 **시크릿 값을 적지 않는다.** 값은 Secrets Manager와 AWS 콘솔에서 확인.
> Terraform 미도입 — 현재는 AWS CLI로 직접 관리. 리소스를 추가·변경하면 **이 문서를 함께 갱신**한다.

---

## 1. 두 환경 구조

| | 스테이징 (dev) | 프로덕션 |
|---|---|---|
| 도메인 | `api-dev.kaisa.or.kr` | `api-edu.kaisa.or.kr` |
| EC2 | `kaisa-be-staging` (i-0a94a9f80b844ba8a) | `kaisa-be-prod` (i-067589872bf1d568d) |
| 인스턴스 | Ubuntu 26.04, 기존 인스턴스 | Ubuntu 26.04, t3.small, 20GB gp3 |
| EIP | 43.200.57.168 | 54.116.172.212 |
| 보안그룹 | `launch-wizard-1` (22/80/443 open) | `kaisa-prod-api-sg` (sg-0457ea64f5e0439a6, 22/80/443 open) |
| VPC / 서브넷 | vpc-0e548e1390746b04c / subnet-0ec421c9697fb411d (공용) | 동일 |
| IAM 롤 | `kaisa-staging-ec2-role` | `kaisa-prod-ec2-role` |
| 시크릿 | Secrets Manager `kaisa-staging` | Secrets Manager `kaisa-prod` |
| S3 백업 | `kaisa-staging-backups` | `kaisa-prod-backups` |
| S3 파일 | `kaisa-staging-files` | `kaisa-prod-files` |
| 배포 태그 | `be-staging-v*` | `be-prod-v*` |
| nginx SERVER_NAME | api-dev.kaisa.or.kr | api-edu.kaisa.or.kr |

- 둘 다 **EC2 + docker compose** (db + api + nginx) 구조. 프로덕션도 ECS가 아니라 같은 레시피 — gongcar의 EC2/ECS 비대칭을 물려받지 않는다 ([backend-deployment.md](backend-deployment.md) §1).
- 로드밸런서 없음 — 인스턴스 1대 + nginx 컨테이너가 TLS·프록시 담당. Multi-AZ·무중단 배포가 필요해지면 그때 ALB 도입.
- IMDS: `HttpTokens=required`, `HttpPutResponseHopLimit=2` (컨테이너 안에서 롤 자격증명 접근용).

## 2. Secrets Manager 스키마

`kaisa-staging` / `kaisa-prod` 공통 키 (JSON 평면 — `app/core/config.py` 로더 호환):

| 키 | staging 값 | prod 값 |
|---|---|---|
| `DB_PASSWORD` | (주입됨) | (주입됨) |
| `CRYPTO_KEY` | Fernet 키 | Fernet 키 (staging과 다른 개별 키) |
| `ENVIRONMENT` | `staging` | `production` |
| `S3_BUCKET_NAME` | `kaisa-staging-files` | `kaisa-prod-files` |
| `FRONTEND_URL` | `https://dev-edu.kaisa.or.kr` | `https://edu.kaisa.or.kr` |
| `CORS_ORIGINS` | `secret manager` | `secret manager` |

- `DATABASE_URL`은 시크릿에 없음 — compose가 `DB_PASSWORD`로 조립.
- 값 변경: `aws secretsmanager put-secret-value`로 기존 JSON **병합** 후 재배포 (부팅 시 로드).
- 정적 access key 미사용 — EC2는 인스턴스 롤(IMDS), 로컬은 `.env` 명시 키. gongcar `.env`의 `AWS_ACCESS_KEY_ID` 방식을 일부러 안 따랐다.

## 3. IAM 권한 설계

| 롤 | 정책 | 내용 |
|---|---|---|
| `kaisa-staging-ec2-role` | staging-secrets-read | `kaisa-staging` 시크릿만 GetSecretValue |
| | staging-backup-s3 | `kaisa-staging-backups`만 R/W |
| | staging-files-s3 | `kaisa-staging-files`만 R/W |
| `kaisa-prod-ec2-role` | prod-secrets-read / prod-backup-s3 / prod-files-s3 | 동일 구조, prod 리소스만 |

롤은 **자기 환경 리소스만** 접근한다. staging 롤로 prod 시크릿·버킷에 접근 불가.

## 4. S3 버킷

| 버킷 | 용도 | 공통 설정 |
|---|---|---|
| `kaisa-{staging,prod}-backups` | DB 덤프 (`postgres/` prefix) | versioning · SSE-S3 · 퍼블릭 전면 차단 · TLS 강제 · **30일 lifecycle** |
| `kaisa-{staging,prod}-files` | 앱 파일 저장 (업로드 기능용, 아직 미사용) | versioning · SSE-S3 · 퍼블릭 차단 · TLS 강제 |

- files 버킷의 CORS/presigned URL은 프론트 직접 업로드 기능 구현 시 추가.
- 백업 보존 30일 — 더 길게 잡을 근거 생기면 lifecycle만 수정.

## 5. 배포 흐름 (GitHub Actions)

```
git tag be-staging-v0.1.X && git push origin be-staging-v0.1.X
  → .github/workflows/deploy.yml (appleboy/ssh-action)
  → EC2: git fetch --tags → 태그 checkout
  → DB_PASSWORD를 Secrets Manager에서 export (compose interpolation용)
  → docker compose up -d --build
  → docker compose exec api alembic upgrade head   ← 마이그레이션 자동
  → 이미지·빌더 캐시 prune
```

- GitHub Secrets: `EC2_SSH_KEY`(공용 pem), `STAGING_EC2_HOST`, `PROD_EC2_HOST`
- prod job(`be-prod-v*`)도 같은 파일에 존재 — 시크릿만 교체 구조.
- CI: `.github/workflows/ci.yml`이 alembic single-head 검사 (마이그레이션 head 갈라짐을 배포 전에 잡음).

## 6. 운영 룬북

### 6.1 DB 백업 — 자동

- 양쪽 EC2: `/usr/local/sbin/kaisa-db-backup <prod|staging>` — 컨테이너 안 `pg_dump` → gzip → S3 → 크기 검증(<100B면 실패).
- root cron `47 20 * * *` (UTC = KST 새벽 5:47) · 로그 `/var/log/kaisa-db-backup.log`
- 수동 실행: `ssh ubuntu@<host> 'sudo /usr/local/sbin/kaisa-db-backup prod'`

### 6.2 DB 복원

```bash
aws s3 cp s3://kaisa-prod-backups/postgres/<STAMP>.sql.gz - | gunzip | \
  docker compose exec -T db psql -U kaisa -d kaisa
```

- 검증 이력: 2026-09-14 양쪽 수동 백업 → 다운로드 → gzip 무결성 + 22 tables + pg_dump 종료 마커 확인.

### 6.3 TLS 인증서 갱신 — 자동

- 양쪽 EC2: `/usr/local/sbin/kaisa-cert-renew` — `certbot renew --standalone`, **갱신 시도가 있을 때만** nginx stop→start (갱신일 하루 수초 다운타임).
- root cron `17 4,16 * * *` (UTC) · 로그 `/var/log/kaisa-cert-renew.log`
- 실패 시 수동: `ssh ubuntu@<host> 'sudo /usr/local/sbin/kaisa-cert-renew'`

### 6.4 시크릿 변경

```bash
aws secretsmanager get-secret-value --secret-id kaisa-prod --query SecretString --output text > /tmp/sec.json
# /tmp/sec.json 편집 (키 추가/값 변경) 후:
aws secretsmanager put-secret-value --secret-id kaisa-prod --secret-string file:///tmp/sec.json
# 그다음 재배포 (부팅 시 로드되므로)
```

### 6.5 로컬 개발 S3 키

- IAM 사용자 `kaisa-local-dev` — `kaisa-staging-files`에만 R/W (prod 접근 불가).
- `.env`에 `S3_BUCKET_NAME=kaisa-staging-files` + `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` 넣어 사용.
- 키 유출 시: `aws iam delete-access-key` 후 `create-access-key`로 재발급.

## 7. 알려진 미해결 (TODO)

| 항목 | 내용 | 우선순위 |
|---|---|---|
| SSH 22 전면 개방 | staging·prod 모두 0.0.0.0/0. GitHub Actions 배포가 22를 쓰므로 닫으면 배포 깨짐 → **배포를 SSM send-command로 전환할 때 함께 잠금** (사용자 결정: 당분간 유지) | 중 |
| prod→staging DB 미러 | gongcar `mirror-prod-to-staging.sh` 대응물. 백업이 S3에 있어 만들 준비 완료 | 중 |
| `kaisa-prod` 시크릿 recovery window 0 | 즉시 삭제 가능 상태. 30일로 올리면 CRYPTO_KEY 유실 방어 | 중 |
| files 버킷 CORS/presigned | 프론트 직접 업로드 기능 구현 시 추가 | 낮음 |
| Slack 배포 알림 | gongcar deploy.yml에는 있음. 팀 문서 Phase D 통과 후 추가 예정 | 낮음 |
| S3 백업 성공 알림 | 현재 조용히 실패할 수 있음(cron 로그만 봄). 실패 시 Slack/이메일 알림 고려 | 낮음 |
| Terraform 코드화 | CLI로 만든 리소스를 import로 코드화. 이 문서가 인벤토리 기준 | 낮음 |

## 8. 이력

| 날짜 | 작업 |
|---|---|
| 2026-09-14 | staging 최초 배포 (`be-staging-v0.1.0`, 도메인 api-staging) |
| 2026-09-14 | 도메인 분리 — staging→`api-dev`, prod `api-edu` 신규 EC2 구축 (`be-prod-v0.1.0`) |
| 2026-09-14 | 인증서 갱신 cron, S3 백업(버킷·스크립트·cron) 구축 + 무결성 검증 |
| 2026-09-14 | S3 파일 버킷 + 시크릿 `S3_BUCKET_NAME`·`FRONTEND_URL` 주입 + 재배포 (`be-staging-v0.1.2`·`be-prod-v0.1.1`) |
| 2026-09-14 | 로컬 개발용 IAM 사용자 `kaisa-local-dev` 발급 |
| 2026-09-14 | 시크릿 `CORS_ORIGINS` 추가 (FE 도메인 분리 — dev-admin/admin) + api 컨테이너 force-recreate로 반영. Amplify(`kaisa-edu` da0pjubdzn206·`kaisa-admin` d2kv9rc28llymz, ap-northeast-2) 브랜치 환경변수 `VITE_API_URL` 주입. **주의: `docker compose up -d` 는 이미지 동일 시 재생성 안 함 — 시크릿 변경 시 `--force-recreate api` 필요** |
