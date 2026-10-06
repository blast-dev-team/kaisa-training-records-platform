/**
 * 교육이력 목록 조회 API — 실제 백엔드 연동.
 *
 * USE_MOCK=true 여도 교육이력 조회·다운로드는 실제 API로 동작한다 (스위치 예외 —
 * staging DB 시드 데모 이력을 로그인 회원에게 보여 주기 위함).
 * 백엔드 GET /api/me/training-records — 본인 이력 + 공용 데모 이력(is_demo)을
 * PagedResponse로 반환한다.
 */

export type PeriodFilter = "recent3y" | "recent1y" | "all";

/** 확인서 발급 상태 — 재발급 개념 없음(기발급도 issuable, 매번 결제) */
export type CertificateStatus =
  | "issuable" // 발급 신청 가능
  | "unavailable"; // 발급 불가 (3년 초과 등)

export interface TrainingHistoryItem {
  id: string;
  /** 수강 시작일 (YYYY-MM-DD) */
  startedOn: string;
  /** 수강 종료일 (YYYY-MM-DD) */
  endedOn: string;
  /** 교육명 */
  courseName: string;
  /** 교육기관 */
  organizer: string;
  /** 교육 이수시간 (시간 단위) */
  hours: number;
  certificateStatus: CertificateStatus;
  /** 직전 발급일시 (ISO) — 기발급 표기용 */
  lastIssuedAt?: string;
  /** 수료증 발급 자격 — 내부 기관 + 수료 완료 + 본인 이력(데모 제외). 결제 없이 무료 */
  completionCertIssuable: boolean;
}

export interface TrainingHistoryListParams {
  page: number;
  limit: number;
  period: PeriodFilter;
  /** 조회 기간 시작 (YYYY-MM-DD) — 직접 지정 시 period 칩 필터를 대체 */
  from?: string;
  /** 조회 기간 종료 (YYYY-MM-DD) */
  to?: string;
  /** 교육명 검색어 */
  search: string;
}

export interface TrainingHistoryListResult {
  items: TrainingHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** 발급 가능 건수 — 요약 표기용 */
  issuableCount: number;
  /** 현재 필터(기간·검색) 전체의 이수시간 합계 — 현재 페이지 합이 아님 */
  totalHoursSum: number;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** 백엔드 응답 — snake_case 그대로 */
interface TrainingRecordDto {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  course_name: string;
  institution_name: string;
  total_hours: string | number;
  /** 회원별 발급 상태 — 데모 이력 공유 대응으로 서버가 certificates 에서 산출 */
  certificate_status?: CertificateStatus | null;
  last_issued_at?: string | null;
  institution_type?: string | null; // internal | external | null(미선택)
  completion_status?: string | null; // in_progress | completed | canceled
  /** 공용 데모 이력 — 여러 회원이 공유하므로 수료증 대상 제외 */
  is_demo?: boolean;
}

function toItem(dto: TrainingRecordDto): TrainingHistoryItem {
  const startedOn = dto.started_at ?? "";
  const endedOn = dto.ended_at ?? startedOn;
  return {
    id: dto.id,
    startedOn,
    endedOn,
    courseName: dto.course_name,
    organizer: dto.institution_name,
    hours: Number(dto.total_hours),
    // 발급 게이트(3년·수료·기발급)는 서버가 최종 판단 — 회원별 상태를 그대로 쓴다
    certificateStatus: dto.certificate_status ?? "unavailable",
    lastIssuedAt: dto.last_issued_at ?? undefined,
    // 수료증 게이트(내부 기관 + 수료)는 서버가 최종 판단 — 여기선 버튼 활성 표기용
    completionCertIssuable:
      dto.is_demo !== true &&
      dto.institution_type === "internal" &&
      dto.completion_status === "completed",
  };
}

export async function getTrainingHistoryList(
  params: TrainingHistoryListParams,
): Promise<TrainingHistoryListResult> {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.from) {
    search.set("from", params.from);
  }
  if (params.to) {
    search.set("to", params.to);
  }
  if (params.search.trim() !== "") {
    search.set("search", params.search.trim());
  }

  const response = await fetch(
    `${API_BASE}/api/me/training-records?${search.toString()}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }

  const data = await response.json();
  const items: TrainingHistoryItem[] = (data.items ?? []).map(toItem);
  return {
    items,
    total: data.total ?? items.length,
    page: data.page ?? params.page,
    limit: data.limit ?? params.limit,
    totalPages: data.total_pages ?? Math.max(1, Math.ceil((data.total ?? 0) / params.limit)),
    issuableCount: items.filter(
      (item) => item.certificateStatus !== "unavailable",
    ).length,
    totalHoursSum: Number(data.total_hours_sum ?? 0),
  };
}
