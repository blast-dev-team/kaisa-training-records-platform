# Backend 문서

`backend/api` (FastAPI) 관련 문서 모음.

| 문서 | 내용 |
|------|------|
| [federated-dancing-rivest.md](federated-dancing-rivest.md) | 백엔드 1차 구축 계획 (Phase 0~7) + 구현 검증 결과 |
| [backend-deployment.md](backend-deployment.md) | 배포 실행 계획 — EC2 + docker compose + nginx + Secrets Manager, 태그 배포 |
| [db-schema.md](db-schema.md) | 전체 테이블 정의서 (컬럼·타입·설명) |
| [dbdiagram.io](dbdiagram.io) | DBML v1.1 (ER 다이어그램 원본) |
| [dbdiagram-v1.1-changes.md](dbdiagram-v1.1-changes.md) | v1.0 → v1.1 스키마 변경 내역 |

코드 레벨 가이드(구조·테스트·보안)는 [backend/api/README.md](../../backend/api/README.md).

## API 문서 (FE용)

프론트엔드 개발자는 앱별 문서를 본다:

- [../web/api.md](../web/api.md) — 회원 포털 (`frontend/apps/web`) 엔드포인트 + entities API 작성 가이드
- [../admin/api.md](../admin/api.md) — 어드민 (`frontend/apps/admin`) 엔드포인트 + entities API 작성 가이드
