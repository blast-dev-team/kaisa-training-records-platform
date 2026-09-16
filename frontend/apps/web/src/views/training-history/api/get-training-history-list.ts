/**
 * 교육이력 목록 조회 API — 실제 백엔드 연동.
 *
 * USE_MOCK=true 여도 교육이력 조회·다운로드는 실제 API로 동작한다 (스위치 예외 —
 * staging DB 시드 데모 이력을 로그인 회원에게 보여 주기 위함).
 * 백엔드 GET /api/me/training-records — 본인 이력 + 공용 데모 이력(is_demo)을
 * PagedResponse로 반환한다.
 */

export type PeriodFilter = "recent3y" | "recent1y" | "all";

/** 확인서 발급 상태 */
export type CertificateStatus =
  | "issuable" // 발급 신청 가능
  | "reissuable" // 재발급 가능 (기한 내)
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
  /** 재발급 기한 표기 — reissuable일 때만 (예: 2026.05.14 14:22까지) */
  reissueDeadline?: string;
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
  /** 발급 가능 건수 (issuable + reissuable) — 요약 표기용 */
  issuableCount: number;
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
  /** 7일 무료 재발급 기한 — 기한 지나면 유료 재발급 */
  reissue_free_until?: string | null;
}

/** 무료 재발급 기한 표기 (예: 2026.09.23 14:22) */
function formatDeadline(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    reissueDeadline:
      dto.reissue_free_until != null
        ? formatDeadline(dto.reissue_free_until)
        : undefined,
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
  };
}
