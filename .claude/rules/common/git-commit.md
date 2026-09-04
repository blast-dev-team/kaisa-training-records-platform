---
description: "Git 커밋 컨벤션"
---

# Git Commit Convention

## 포맷

```
type(scope): description
```

## Type

| type | 용도 |
|------|------|
| `feat` | 새로운 기능 |
| `fix` | 버그 수정 |
| `refactor` | 코드 리팩토링 (기능 변경 없음) |
| `docs` | 문서 변경 |
| `test` | 테스트 추가/수정 |
| `style` | 포맷팅, 세미콜론 등 (기능 변경 없음) |
| `perf` | 성능 개선 |
| `chore` | 빌드, 툴링, 설정 변경 |

## 예시

```
feat(auth): JWT 인증 훅 추가
fix(auth): SSR localStorage 에러 수정
docs(readme): 설치 방법 업데이트
chore(ci): 배포 워크플로우 추가
```

## 커밋 전 체크리스트

1. 타입 체크 / 빌드 성공 확인
2. 필요한 경우 문서 업데이트
3. Conventional Commits 형식 준수
