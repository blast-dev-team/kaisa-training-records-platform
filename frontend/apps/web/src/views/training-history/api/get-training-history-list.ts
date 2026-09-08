/**
 * 교육이력 목록 조회 API.
 *
 * 백엔드가 아직 없어 VITE_API_URL 미설정 시 Figma 노드(25:2428)의 목업 데이터를
 * 반환한다. 백엔드 스펙 확정 후 경로·응답 매핑을 조정한다.
 */

export type PeriodFilter = "recent3y" | "all";

/** 확인서 발급 상태 */
export type CertificateStatus =
  | "issuable" // 발급 신청 가능
  | "reissuable" // 재발급 가능 (기한 내)
  | "unavailable"; // 발급 불가 (3년 초과 등)

export interface TrainingHistoryItem {
  id: string;
  /** 교육일자 (YYYY-MM-DD) */
  trainedOn: string;
  /** 교육명 */
  courseName: string;
  /** 주최기관 */
  organizer: string;
  /** 이수시간 (시간 단위) */
  hours: number;
  /** 이수구분 (예: 이수) */
  completionType: string;
  certificateStatus: CertificateStatus;
  /** 재발급 기한 표기 — reissuable일 때만 (예: 2026.05.14 14:22까지) */
  reissueDeadline?: string;
}

export interface TrainingHistoryListParams {
  page: number;
  limit: number;
  period: PeriodFilter;
  /** 발급 가능만 보기 */
  issuableOnly: boolean;
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

/** 목업 데이터 — Figma 노드 25:2466~25:2493 표본 + 보충 (최근 3년 12건 · 발급 가능 3건) */
const MOCK_ITEMS: TrainingHistoryItem[] = [
  {
    id: "1",
    trainedOn: "2026-05-14",
    courseName: "비파괴검사 계속교육 (정기)",
    organizer: "협회 본부",
    hours: 8,
    completionType: "이수",
    certificateStatus: "issuable",
  },
  {
    id: "2",
    trainedOn: "2025-11-02",
    courseName: "감리원 법정 계속교육 2차",
    organizer: "부산지회",
    hours: 16,
    completionType: "이수",
    certificateStatus: "issuable",
  },
  {
    id: "3",
    trainedOn: "2024-07-19",
    courseName: "안전관리 실무 심화과정",
    organizer: "협회 본부",
    hours: 4,
    completionType: "이수",
    certificateStatus: "reissuable",
    reissueDeadline: "2026.05.14 14:22까지",
  },
  {
    id: "4",
    trainedOn: "2026-03-05",
    courseName: "건설기술 계속교육 (온라인)",
    organizer: "협회 본부",
    hours: 4,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "5",
    trainedOn: "2026-01-22",
    courseName: "공사비 산정 실무 교육",
    organizer: "서울지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "6",
    trainedOn: "2025-08-21",
    courseName: "설비공사 감리 실무협의",
    organizer: "서울지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "7",
    trainedOn: "2025-04-10",
    courseName: "토목 안전관리 세미나",
    organizer: "대구지회",
    hours: 4,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "8",
    trainedOn: "2025-06-18",
    courseName: "환경 영향 평가 교육",
    organizer: "인천지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "9",
    trainedOn: "2024-11-27",
    courseName: "전기설비 감리 교육",
    organizer: "인천지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "10",
    trainedOn: "2024-09-04",
    courseName: "소방설비 계속교육",
    organizer: "협회 본부",
    hours: 4,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "11",
    trainedOn: "2024-03-15",
    courseName: "공사감독 실무 과정",
    organizer: "협회 본부",
    hours: 16,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "12",
    trainedOn: "2023-10-30",
    courseName: "품질관리 계속교육",
    organizer: "광주지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  // 3년 초과 — '전체 기간' 선택 시에만 노출
  {
    id: "13",
    trainedOn: "2021-03-08",
    courseName: "감리 기초 직무교육",
    organizer: "대전지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "14",
    trainedOn: "2020-09-12",
    courseName: "건축감리 기초교육",
    organizer: "협회 본부",
    hours: 16,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
  {
    id: "15",
    trainedOn: "2019-06-20",
    courseName: "공정관리 실무교육",
    organizer: "춘천지회",
    hours: 8,
    completionType: "이수",
    certificateStatus: "unavailable",
  },
];

const API_BASE = import.meta.env.VITE_API_URL;

/** 로컬(브라우저 = KST) 기준 YYYY-MM-DD — toISOString()은 UTC라 새벽에 하루 어긋난다 */
function localYMD(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 목업 필터링 — 기간·검색·발급가능 필터 + 서버 사이드 페이지네이션 흉내 */
function filterMock({
  page,
  limit,
  period,
  issuableOnly,
  search,
}: TrainingHistoryListParams): TrainingHistoryListResult {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
  const cutoff = localYMD(cutoffDate);
  const query = search.trim();

  const byPeriod = MOCK_ITEMS.filter(
    (item) => period === "all" || item.trainedOn >= cutoff,
  );
  const bySearch =
    query === ""
      ? byPeriod
      : byPeriod.filter((item) => item.courseName.includes(query));
  const issuableCount = bySearch.filter(
    (item) => item.certificateStatus !== "unavailable",
  ).length;
  const filtered = issuableOnly
    ? bySearch.filter((item) => item.certificateStatus !== "unavailable")
    : bySearch;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    items: filtered.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
    issuableCount,
  };
}

export async function getTrainingHistoryList(
  params: TrainingHistoryListParams,
): Promise<TrainingHistoryListResult> {
  // 백엔드 미연동 — 목업: 짧은 지연 후 필터링 결과 반환
  if (!API_BASE) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return filterMock(params);
  }

  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    period: params.period,
    issuable_only: String(params.issuableOnly),
  });
  if (params.search.trim() !== "") {
    search.set("search", params.search.trim());
  }

  const response = await fetch(
    `${API_BASE}/api/v1/training-histories?${search.toString()}`,
  );
  if (!response.ok) {
    throw new Error("문제가 생겼어요. 잠시 후 다시 시도해 주세요");
  }

  // TODO(백엔드 스펙 확정 후): snake_case 응답 필드 매핑 조정
  return (await response.json()) as TrainingHistoryListResult;
}
