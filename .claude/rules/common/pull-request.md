# Pull Request Guidelines

## PR 제목

커밋 컨벤션과 동일한 형식 사용. 모노레포라면 layer prefix 포함.

```
type(layer/scope): description

feat(be/inquiry): 페이지네이션 + summary 엔드포인트 추가
fix(fe/lead): 차량 매칭 모달 버튼 노출 문제 수정
refactor(be): 에러 응답 형식 {code, message} 통일
```

- 제목은 **70자 이내**
- 마침표 없음
- 현재형으로 작성 ("추가했다" X → "추가" O)

## PR 본문 템플릿

```markdown
## 변경 요약
- 변경한 내용을 bullet로 간결하게

## 변경 이유
왜 이 변경이 필요했는지 (배경, 문제, 요구사항)

## 테스트 방법
- [ ] 로컬에서 확인한 방법
- [ ] 엣지 케이스 확인 여부

## 스크린샷 (UI 변경 시)
Before / After 스크린샷 첨부
```

## 브랜치 전략

```
main          ← 항상 배포 가능한 상태 유지
└── feat/...  ← 기능 개발
└── fix/...   ← 버그 수정
└── refactor/ ← 리팩토링
└── chore/... ← 빌드, 설정 변경
```

- 브랜치명은 `type/짧은-설명` 형태 (kebab-case)
- `feat/error-response-format`, `fix/cors-staging` 등

## 머지 전 체크리스트

- [ ] 로컬 빌드/타입 체크 통과
- [ ] 불필요한 `console.log`, 디버그 코드 제거
- [ ] 새 환경변수 추가 시 `.env.example` 업데이트
- [ ] DB 스키마 변경 시 Alembic 마이그레이션 파일 포함
- [ ] **PR 본문에 마이그레이션 유무를 명시** (없어도 '불필요' 라고 적는다)
- [ ] BE·FE 동시 변경이면 **배포 순서**(BE 태그 먼저) 명시

> 이 두 가지는 `crm-ship` 스킬의 `check.sh` 가 자동으로 판별해 알려준다.

## 리뷰 원칙

- PR은 **하나의 목적**만 담는다 — 리뷰어가 맥락을 잃지 않게
- 변경 파일이 20개 넘어가면 분리를 검토
- 리뷰어는 최소 1명 지정
- 승인 없이 본인 PR 머지 금지 (긴급 hotfix 예외)

## 머지 방법

- **Squash and Merge** — feature 브랜치는 커밋을 하나로 합쳐 main에 반영
- **Merge Commit** — 여러 커밋을 그대로 보존해야 할 때 (릴리즈 등)
- Rebase Merge는 사용하지 않음 (히스토리 복잡도 증가)
