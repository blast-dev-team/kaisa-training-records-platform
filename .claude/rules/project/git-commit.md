# Git 커밋 컨벤션 (프로젝트 오버라이드)

> 커밋·PR 을 **올리는 순서**(검증 → 레이어 판단 → 마이그레이션·배포 순서 명시)는
> **`crm-ship` 스킬**에 있다. 여기는 포맷만 정의한다.

이 프로젝트는 **모노레포** (FE + BE 동일 레포)이므로
`common/git-commit.md`의 기본 포맷에 **layer prefix**를 추가한다.

## 포맷

```
type(layer/scope): description
```

## Layer

| layer | 대상 |
|-------|------|
| `be` | 백엔드 (FastAPI) |
| `fe` | 프론트엔드 (React) |
| `ci` | GitHub Actions, CI/CD |
| `infra` | Docker, nginx, EC2 등 인프라 |

> 모노레포가 아닌 단일 레포였다면 layer 없이 `type(scope): ...` 로 충분하다.

## 예시

```
feat(be/inquiry): 페이지네이션 + summary 엔드포인트 추가
feat(fe/inquiry): 서버 페이지네이션 연동 및 탭 카운트 개선
fix(be/auth): 세션 쿠키 SameSite=None 적용
fix(fe/inquiry): 담당자명 저장 누락 수정
chore(ci): 태그 기반 배포 워크플로우 추가
chore(infra): nginx SSL 설정 및 HTTPS 리다이렉트
refactor(be/inquiry): PagedResponse 공통 래퍼 적용
feat(be/slack): 문의 접수 시 Slack 알림 추가
```

## FE/BE 동시 변경

커밋을 분리하는 것이 원칙. 불가피하면 주된 변경 레이어를 사용한다.

```
# 권장: 커밋 분리
feat(be/inquiry): summary 엔드포인트 추가
feat(fe/inquiry): summary API 연동

# 불가피한 경우: 주된 레이어 사용
feat(be/inquiry): summary 엔드포인트 추가 및 FE 연동
```
