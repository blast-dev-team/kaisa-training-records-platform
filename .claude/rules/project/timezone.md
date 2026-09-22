# 시간대 — KST 고정, naive datetime 금지

이 서비스의 **'지금'과 '오늘'은 KST(UTC+9)** 다. 한국 전용이라 그렇게 못박았다.

> 다른 나라로 넓힐 때 바꿔야 할 것은 [docs/infra-handover.md §6](../../../docs/infra-handover.md) 참고.
> 출발점은 [`app/core/kst.py`](../../../backend/api/app/core/kst.py) 한 파일이다.

---

## 왜 이 규칙이 있나 — 실제로 터진 것들

DB 저장은 원래 옳았다(`timestamptz` = 절대시각을 UTC 로 보관). **문제는 전부 입구**에서 났다.

| 증상 | 원인 |
|---|---|
| 문의 접수 시각이 9시간 미래로 저장 | 브라우저가 오프셋 없이 보낸 로컬 시각을 naive 로 파싱 → 컨테이너 OS(UTC)로 해석 |
| 매일 KST 00~09시에 '오늘'이 하루 전 | `date.today()` 가 OS 타임존을 따름. 월렌트료 조정 경계·이탈 종료일·수납일이 이 값을 씀 |
| 자정 넘긴 탭에서 오늘 날짜가 안 눌림 | `useMemo(..., [])` 로 '오늘'을 마운트 시 1회만 계산 |
| 아침 일찍 등록하면 날짜 기본값이 어제 | `new Date().toISOString().slice(0,10)` 은 **UTC 기준** |
| 출고 인도일시가 9시간 어긋날 뻔 | 로컬 날짜 + UTC 시각을 오프셋 없이 조립 (컨테이너가 UTC 라 우연히 맞고 있었음) |

마지막 항목이 이 규칙의 핵심을 보여준다 — **환경이 우연히 맞춰주고 있으면 배포 환경 하나
바뀔 때 터진다.** 값 자체에 시간대를 박아야 한다.

---

## 백엔드

### 하지 말 것

```python
datetime.now()      # OS 타임존을 따른다
date.today()        # 〃 — UTC 컨테이너에서 KST 새벽에 하루 전
datetime(2026, 8, 5)          # naive
datetime.strptime(s, "%Y-%m-%d")   # naive (`.date()` 로 끝나면 date.fromisoformat 을 쓴다)
```

`ruff` **`DTZ` 룰이 CI 없이도 로컬에서 잡는다.** 예외 목록(`per-file-ignores`)은 두지 않는다 —
현재 위반 0건이고, 하나 허용하면 다시 새기 시작한다.

### 쓸 것 — [`app/core/kst.py`](../../../backend/api/app/core/kst.py)

```python
from app.core.kst import now_kst, today_kst, ensure_kst, kst_range_start, kst_range_end

now_kst()                  # 지금 (aware)
today_kst()                # 오늘 (KST 기준 date)
ensure_kst(parsed)         # naive 면 KST 로 못박기, 이미 aware 면 그대로
kst_range_start(d) / kst_range_end(d)   # 조회 경계 (반열림 [start, end))
```

### 문자열을 datetime 으로 파싱하면 반드시 `ensure_kst`

브라우저는 `'2026-08-10 15:15'` 처럼 **오프셋 없이** 보낸다. 그대로 두면 naive 라
컨테이너 타임존으로 해석돼 9시간 어긋난다.

```python
# ✅
return ensure_kst(datetime.fromisoformat(value))

# ❌
return datetime.fromisoformat(value)
```

현재 파서 5곳이 이 방어를 하고 있다 — `delivery`(2), `invoice`, `operation`, `contract`.
**새 파서를 만들면 여기 목록에 추가하고 `ensure_kst` 를 붙인다.**

### 날짜로 조회를 거를 때

`timestamptz` 컬럼에 문자열이나 naive 를 비교하면 안 된다. 문자열은
`timestamptz >= varchar` 연산자가 없어 **500 크래시**가 난다.

```python
# ✅
q.where(Inquiry.created_at >= kst_range_start(date_from))
q.where(Inquiry.created_at <  kst_range_end(date_to))

# ❌
q.where(Inquiry.created_at >= "2026-08-05")
```

---

## 프론트엔드

브라우저는 로컬(KST)이라 `new Date()` 자체는 문제없다. **`toISOString()` 이 함정**이다 —
그건 UTC 라 KST 00~09시에 어제가 나온다.

### 하지 말 것

```ts
new Date().toISOString().slice(0, 10)     // UTC 날짜 — 아침에 어제가 된다
`${date}T${new Date().toISOString().slice(11, 19)}`   // 로컬 날짜 + UTC 시각
useMemo(() => startOfDay(new Date()), [])  // 자정 넘기면 어제로 굳는다
```

### 쓸 것 — [`shared/utils/format.ts`](../../../frontend/apps/crm-fe/src/shared/utils/format.ts)

```ts
todayYMD()             // 오늘 'YYYY-MM-DD' (로컬 기준)
nowHM()                // 지금 'HH:mm'
localISOAt(dateYMD)    // 'YYYY-MM-DDTHH:mm:ss+09:00' — 오프셋 포함
toYMD(serverISO)       // 서버 ISO → 로컬(KST) 날짜 'YYYY-MM-DD'
```

### 서버로 일시를 보낼 때는 오프셋을 붙인다

```ts
// ✅ 서버 타임존과 무관하게 같은 순간
localISOAt(date)

// ⚠️ 오프셋 없음 — 서버의 ensure_kst 에 의존하게 된다
`${date} ${time}`
```

오프셋 없이 보내는 곳이 아직 4곳 남아 있다(사고대차 배차·회수 계열). BE 파서가
막고 있어 결과는 정확하지만, **새로 만드는 곳은 `localISOAt` 을 쓴다.**

### 서버에서 받은 일시를 표시할 때는 `toYMD` 를 쓴다

**보낼 때만 조심하면 되는 게 아니다.** 서버는 `timestamptz` 를 **UTC 오프셋**으로
직렬화한다(`2026-07-21T15:00:00+00:00`). 이걸 `slice(0, 10)` 으로 자르면 UTC 날짜라
**KST 자정에 저장된 값이 하루 앞으로 보인다.**

```ts
// ❌ UTC 날짜 — 회수일 2026-07-22 가 화면에 07-21 로 나온다
delivery.returned_at.slice(0, 10)

// ✅ 로컬(KST) 날짜
toYMD(delivery.returned_at)
```

실제로 출고현황·운영관리에서 **회수일 7건이 하루 앞으로 표시**되고 있었다. 운영팀이
입력한 날짜는 맞는데 화면만 틀렸던 것이라, 데이터를 고치는 대응이 반복됐다
(TK-17441·17442).

`toYMD` 는 **시각이 없는 값은 그대로 통과**시킨다 — `date` 컬럼(`return_planned_date`),
`'YYYY-MM'`(출고 예정월), 레거시 자유 텍스트(`'6월30일'`)가 같은 자리에 섞여 들어오기
때문이다. 그래서 `slice(0, 10)` 자리에 그대로 바꿔 끼울 수 있다.

> **왜 프론트에서 고치나** — 서버가 UTC 절대시각을 주는 건 표준이 맞다. 타임존 변환은
> 받는 쪽 책임이다. 서버가 KST 로 내려주게 하면 "서버는 KST 를 준다"는 암묵 규칙이
> 생겨, 그걸 모르는 다른 소비자에서 같은 버그가 또 난다.

### '오늘'을 컴포넌트에 캐싱하지 않는다

CRM 은 탭을 하루 종일 열어두는 업무 도구다. 자정을 넘기면 굳은 값이 어제가 된다.

```ts
// ✅ 날짜가 바뀌면 갱신되고 참조는 유지된다
const todayKey = new Date().toDateString()
const today = useMemo(() => startOfDay(new Date()), [todayKey])
```

---

## 테스트

시간 관련 로직은 **KST 새벽을 고정**해서 검증한다. 그 시간대에만 로컬 기준과 UTC 기준의
날짜가 갈리므로, 잘못 구현하면 바로 걸린다.

```ts
vi.setSystemTime(new Date('2026-08-10T17:00:00Z'))  // = KST 8/11 02:00
expect(todayYMD()).toBe('2026-08-11')   // UTC 로 계산하면 '2026-08-10'
```

FE 테스트 타임존은 `vitest.config.ts` 에서 `Asia/Seoul` 로 고정돼 있다(실행 환경에
흔들리지 않게). BE 는 `ensure_kst` 반환값의 `tzinfo` 를 직접 확인한다 — 함수 이름이
아니라 **실제 값**을 봐야 배선 누락이 잡힌다.

---

## 체크리스트 — 시간을 다루는 코드를 쓸 때

- [ ] `datetime.now()` / `date.today()` / `toISOString().slice(0,10)` 을 쓰지 않았나
- [ ] 서버에서 받은 `timestamptz` 를 `slice(0, 10)` 으로 자르지 않고 `toYMD` 를 썼나
- [ ] 문자열 → datetime 파싱에 `ensure_kst` 를 붙였나
- [ ] 서버로 보내는 일시에 오프셋이 있나
- [ ] '오늘'을 마운트 시 1회만 계산하고 있지 않나
- [ ] 조회 경계에 `kst_range_*` 를 썼나
- [ ] KST 새벽(00~09시)을 고정한 테스트가 있나
