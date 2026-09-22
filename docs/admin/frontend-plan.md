# kaisa 어드민·웹 프론트엔드 구축 계획 (1차)

> 작성일: 2026-09-09 · 상태: 검토 대기
> 대상: `frontend/apps/admin` (본체) + `frontend/apps/web` (모노레포 정합성 관점)
> 기준: 백엔드 1차 구축 계획 `docs/backend/federated-dancing-rivest.md` (Phase 0~7) · DBML v1.1 `docs/backend/dbdiagram.io`
> 디자인 레퍼런스: `gongcar-apps/frontend/apps/crm-fe` (FSD + Tailwind v4 토큰)

---

## 1. 배경

- 백엔드는 Phase 0~7 계획대로 진행 중 (스캐폴드 → 인증 → 어드민 마스터 → me 포털 → PASS 인증 → 확인서/결제).
- 어드민 앱은 FSD 스캐폴드만 있음 (`src/app|entities|features|shared|views|widget` 전부 빈 폴더 + home 한 페이지).
- 미팅(2026-09-09)에서 어드민 화면 범위가 확정됨 → 이 문서는 그 범위를 화면·단계로 옮긴 것.

## 2. 미팅 요구사항 → 화면·스키마 매핑

| 미팅 내용 | 대응 | 비고 |
|---|---|---|
| 관리자 계정 따로 필요 | `admin_users` + `admin_allowed_emails` (DBML v1.1 확정) | BE Phase 2. 어드민 앱 = 이 계정으로 로그인 |
| 선택된 회원들은 1800원 | `certificate_pricing_rules` (등급×발급유형 단가) | 어드민 가격 규칙 화면에서 설정. **어떤 등급이 1800원인지 미결 — §9 참고** |
| 회원등급: 일반 / 평생 / 연간 | `membership_grades` 3종 시드 | 어드민 등급 관리 화면 |
| 성명·전화번호·생년월일로 매칭 | `identity_reviews` 심사 (BE Phase 5) | CI 보유분은 자동 매칭. 수동 심사는 성명 검색 + 전화(마스킹) 대조 — **생년월일 컬럼은 추가하지 않기로 확정 (§3)** |
| 감리 교육 목록 | `training_records` 어드민 목록 | |
| 감리 교육 등록 (모달) | `training_records` 등록/수정 모달 | 필드: 과정명·일정·교육시간·기간·주제 |
| 확인서 발급 내역 화면 | `certificates` 목록 | |
| 결제 시도 내역 화면 | `payment_orders` + `payment_attempts` 목록 | |
| 외부 수료 관리 목록 화면 | `training_records.source='external'` 뷰 | v1.1에서 external_completions 제거·통합됨 |
| 외부 기관명, 시간명 | `training_institutions.name` + 이력 시간 필드 | "시간명"은 **범위 제외 확정** |

## 3. 스키마 결정 사항 (2026-09-09 확정)

미팅 요구 ↔ DBML 대조에서 발견된 3건의 처리 결정. `docs/backend/dbdiagram.io`·`docs/backend/dbdiagram-v1.1-changes.md` 반영 완료.

| # | 항목 | 결정 |
|---|---|---|
| G1 | trainees 생년월일 컬럼 | **추가 안 함** — CI 보유 이관분은 `users.ci_hash`로 자동 매칭. 수동 심사는 성명 검색 + 전화(마스킹) 대조로 충분하며 동명이인 구분은 전화번호로 |
| G2 | 감리 교육 "주제" | **과정·이력 양쪽 대응** — `training_courses.topic`(과정 기본 주제) + `training_records.topic`(이력 스냅샷, NULL이면 과정 것 상속). FE: 등록 모달에서 과정 선택 시 주제 자동 채움, 수정 가능(이력 스냅샷) |
| G3 | 외부 수료 "시간명" | **범위 제외** |

추가 제약(갭은 아니지만 화면 설계에 영향):
- 전화번호는 **암호화 저장 → 검색 불가** (BE 계획 명시). 매칭 UX는 "이름(+생년월일) 검색 → 목록에서 마스킹된 전화번호를 눈으로 대조"로 간다. 전화번호 검색창을 만들지 않는다.

## 4. 어드민 화면 설계 (IA)

라우트는 `/` 아래 사이드바 레이아웃. BE 단계 의존성 순으로 번호.

### A. 인증 (BE Phase 2 의존)

| 화면 | 라우트 | 내용 |
|---|---|---|
| 로그인 | `/login` | 이메일+비밀번호. `kaisa_session` 쿠키 |
| 최초 회원가입 | `/register` | 초대(화이트리스트)된 이메일만. 이메일+비밀번호 10자+ 영숫자 |

공통: 401 → 로그인 리다이렉트, 403 ACCOUNT_DISABLED → 안내 문구.

### B. 대시보드 (포함 확정)

`/` — KPI 카드(신규 교육생, 대기 심사, 발급 건수, 결제 금액) + 최근 활동. BE stats 엔드포인트가 1차 범위 밖이라 **기존 목록 API의 total(page=1)을 조합**해 구성. 부족하면 그때 BE에 경량 summary 엔드포인트 요청.

### C. 교육생 관리 (BE Phase 3)

| 화면 | 라우트 | 내용 |
|---|---|---|
| 교육생 목록 | `/trainees` | 페이지네이션 20, 검색(name/trainee_no), 등급·review_status 필터 |
| 교육생 상세 | `/trainees/:id` | 기본정보(전화 마스킹), 등급 + 변경 이력(`trainee_grade_histories`), 교육이력 목록, 확인서 내역 |

등급 변경: 상세에서 모달 → 사유 입력 → `PATCH /api/trainees/:id` → 이력/감사로그는 BE가 기록.

### D. 감리 교육 관리 (BE Phase 3) — 미팅 핵심

| 화면 | 라우트 | 내용 |
|---|---|---|
| 교육 목록 | `/training-records` | 과정명·일정(started~ended)·교육시간(total_hours)·기간·주제 컬럼. source 필터(internal/external), 기간 필터(from/to URL) |
| 교육 등록/수정 | 목록 상단 "등록" → **모달** | 교육생 선택(search), 과정 선택(기관 하위), 과정명·기관명 스냅샷 자동, 일정·시간·주제 입력(주제는 과정 선택 시 자동 채움, 회차별 수정 가능). 삭제는 소프트딜리트 확인 모달 |
| 외부 수료 관리 | `/training-records/external` | 같은 테이블 `source='external'` 고정 뷰. 외부 기관명·시간 강조 컬럼. 등록 모달은 external 전용 폼(기관·과정을 즉석 등록 포함) |

### E. 본인인증 심사 (BE Phase 5)

| 화면 | 라우트 | 내용 |
|---|---|---|
| 심사 목록 | `/identity-reviews` | status 탭(pending/manual_review/processed), 인증 시각·이름 |
| 심사 상세/모달 | 목록 행 클릭 | 인증 정보 + **성명으로 기존 교육생 검색 → 전화(마스킹) 대조** → 매칭 후보 목록 → 승인(trainee 연결+등급 확정) 또는 거절(사유) |

매칭 검색은 `GET /api/trainees?search=` 재사용. phone 검색 불가 — §3 제약.

### F. 확인서·결제 (BE Phase 6)

| 화면 | 라우트 | 내용 |
|---|---|---|
| 확인서 발급 내역 | `/certificates` | certificate_no·이름·과정·발급일·상태(issued/revoked/superseded). 철회 액션(사유 모달, super) |
| 결제 시도 내역 | `/payments` | 주문 단위 목록(order_no·금액·상태) → 확장 시 **시도(attempt) 이력**: 시도별 상태·수단·실패사유·영수증 URL |
| 환불 | 결제 상세에서 | 금액·사유 → `POST /{id}/refunds` |
| 가격 규칙 | `/pricing-rules` | 등급×발급유형(original/reissue) 단가 목록 + 등록/수정 모달. valid_from/valid_to 기간 관리. 1800원은 여기서 설정 |

### G. 마스터·운영 (BE Phase 2·3)

| 화면 | 라우트 | 내용 |
|---|---|---|
| 기관/과정 관리 | `/institutions` | 기관 목록 + 하위 과정. is_active 토글 (삭제 없음) |
| 회원등급 관리 | `/membership-grades` | 일반/평생/연간. 코드·이름·정렬·활성 |
| 관리자 계정 (super) | `/admin-users` | 계정 목록 + status on/off. **화이트리스트(초대 이메일) 등록/삭제** — 입장권 관리. 차단은 status로만 |
| 감사 로그 | `/audit-logs` | entity_type/actor/기간 필터, before/after diff 뷰 |

## 5. FSD 구조 (어드민)

```
src/
├── app/
│   ├── router.tsx              # lazy 라우트 + 라우트 가드
│   ├── layouts/admin-layout.tsx# 사이드바 + 헤더 셸 (min-w 1024)
│   └── providers.tsx           # QueryClient + Toast + Router
├── entities/                   # 도메인별 api/model (BE 도메인 1:1)
│   ├── auth/  trainee/  training-record/  institution/
│   ├── identity-review/  certificate/  payment/  audit/
│   └── admin-user/
│       └── api/{dto, mapper, query, get-*, *-queries.ts} + model/
├── features/                   # 재사용 비즈니스 액션 (필요 시)
│   └── 예: training-record-form (등록·수정 모달 공유)
├── views/                      # 화면 단위 (§4 라우트 1:1)
│   ├── login/  trainees/  training-records/  identity-reviews/
│   ├── certificates/  payments/  pricing-rules/
│   └── institutions/  membership-grades/  admin-users/  audit-logs/
├── widget/                     # 사이드바, 페이지 헤드 등 독립 블록
└── shared/
    ├── api/instance.ts         # axios, baseURL /api, 401 처리
    └── ui/                     # crm-fe 패턴 이식 (§6)
```

규칙: `front/` 공통 룰 전부 적용 — URL 상태(`url-state.md`), 서버 페이지네이션 20(`pagination.md`), queryOptions 패턴, 데스크톱 최소 폭 1024(`responsive.md`).

## 6. 디자인 — crm-fe 모방

**HTML/CSS 복제 금지, 토큰·패턴만 이식** (design-reference.md 원칙과 동일하게 적용).

이식 대상 (crm-fe → admin `shared/ui`):
- 토큰: `globals.css` 색(--color-accent/ok/warn/danger/ink/line/bg/panel)·radius·shadow 값 참고해 admin globals.css 작성
- 컴포넌트: `app-table`(또는 data-table)·`pagination`·`page-head`·`page-container`·`button`·`input`·`select`·`dialog`(모달)·`pill/badge`(상태)·`date-range-picker`·`filter-bar`·`kpi-card`(대시보드 채택 시)·`toast-provider`
- 패턴: 리스트 = PageHead(제목+등록 버튼) + FilterBar + 테이블 + Pagination. 등록/수정은 모달. 상태는 soft badge.
- 사이드바: crm-fe 3-depth rail+panel까지는 불필요 — **평면 1-depth** (메뉴 10개 내외). 그룹핑만: 회원(교육생·심사·등급) / 교육(이력·외부수료·기관) / 발급(확인서·결제·가격) / 운영(관리자·감사)

`@repo/ui` 패키지가 이미 있으나 1차는 **admin 앱 내 shared/ui**로 간다. web과 중복이 확인되면 그때 올린다 (§8).

## 7. 단계 계획

BE 단계 완료를 기다리지 않고 화면은 먼저 만들되, 실연동은 대응 BE phase 완료 후. BE 완료 전엔 시드 데이터로 수동 확인.

| FE 단계 | 내용 | 의존 BE | 검증 |
|---|---|---|---|
| FE-0 | 셸(레이아웃·사이드바·라우터 가드), 토큰, shared/ui 최소세트(버튼·인풋·테이블·모달·페이지네이션), axios 인스턴스 | Phase 0 (부팅) | `/login` 렌더, `/api/health` 프록시 |
| FE-1 | 로그인·회원가입, 관리자 계정·화이트리스트, 감사 로그 | Phase 2 | 시드 마스터 계정 로그인 → 초대 → 가입 → disabled 403 |
| FE-2 | 교육생 목록/상세/등급, 감리 교육 목록·등록 모달, 외부 수료 뷰, 기관/과정, 회원등급 | Phase 3 | CRUD + 등급 변경 이력 확인 |
| FE-3 | 본인인증 심사 (매칭 검색 포함) | Phase 5 | 시드 manual_review 케이스 승인 |
| FE-4 | 확인서 내역·철회, 결제/시도/환불, 가격 규칙 | Phase 6 | 시드 주문 목록 + 환불(테스트 채널) |
| FE-5 | 대시보드(KPI + 최근 활동), 감사 로그 diff 뷰 보강 | 목록 API 조합 | KPI 수치·최근 활동 표시 |

각 단계 DoD 공통: 타입체크 통과, 페이지네이션 20 동작, URL 필터 상태 유지, 401/403 처리.

## 8. web 앱 참고 사항 (모노레포 정합성)

web은 개인회원용(별도 계획 문서로 확장 예정). 어드민 계획이 web에 미치는 제약만 정리:

1. **세션 쿠키 공유 주의** — admin·web이 같은 API 호스트를 쓰면 `kaisa_session` 하나를 두 앱이 공유. **BE 구현(2026-09-09 확정)은 쿠키 이름 분리를 하지 않는다**: 싱글 `kaisa_session` + 토큰 접두사 `adm_`로 저장소만 분기(개인회원=DB, 관리자=in-memory, `core/session.py`). 대신 같은 브라우저에서 admin·web **동시 로그인은 불가** — 나중에 로그인한 쪽이 쿠키를 덮어씀. 관리자가 일반 회원 계정을 같은 브라우저에서 써야 하는 일이 생기면 그때 쿠키 분리 재검토(BE 변경 필요)
2. **배포 도메인** — 현재 구조상 web(Amplify)과 BE(EC2, `api-dev.<도메인>`)이 다른 origin. `SameSite=Lax`는 cross-**site** 요청에만 쿠키를 차단하므로 **서브도메인 통일**(`www`·`admin`·`api`를 같은 registrable domain 아래)이면 same-site로 간주돼 Lax 유지 + CORS만 설정하면 됨(BE `CORS_ORIGINS` 이미 존재). Amplify 기본 도메인(`*.amplifyapp.com`)을 그대로 쓰면 BE와 다른 site가 되어 `SameSite=None` + CSRF 대책 추가가 강제됨 → **커스텀 도메인 서브도메인 통일 권장**, admin은 Amplify 앱 추가로 `admin.<도메인>` 배포 (amplify.yml appRoot 분리)
3. **공유 후보** — `@repo/api`(DTO·에러코드 매핑), `@repo/ui`(토큰·기저 컴포넌트). 단 auth 흐름은 완전히 다름(admin: 이메일/비밀번호, web: PASS 리다이렉트) → **auth는 앱별로 두고**, 도메인 DTO(교육이력·확인서)만 공유 검토
4. web 화면 범위(BE 기준): PASS 로그인 → 내 교육이력 → 확인서 신청(가격 확인) → 결제 스테퍼 → 발급 내역/재발급. 공개 진위확인 페이지(비인증, IP rate limit)
5. web `dist/`에 이전 프로토타입 빌드 산출물이 커밋돼 있음 — gitignore 대상인지 정리 필요

## 9. 미결 사항 (확정 필요)

1. **1800원 적용 등급** — 미정 (2026-09-09). 가격 규칙 관리 화면이 커버하므로 FE 블로커 아님.
2. **admin/web 도메인 전략** — §8-2. 서브도메인 통일 권장. 쿠키 이름 분리는 BE가 불필요하다고 확정(§8-1, 토큰 접두사 분기) — 동시 로그인 불가만 알려진 제약.
3. **감리 교육 "일정" 필드 해석** — 제안: 기간(started_at~ended_at)과 동일한 의미로 봐 추가 필드 불필요. 별개 세부 시간표가 필요해지면 추후 스키마 논의.

> 2026-09-09 해소: 생년월일 컬럼(추가 안 함), 주제(과정+이력 양쪽), 시간명(범위 제외) — §3 · 대시보드 포함 확정 — §4B
