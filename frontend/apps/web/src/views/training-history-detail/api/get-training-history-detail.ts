/**
 * 교육이력 상세(발급 신청 대상) 조회 API.
 *
 * 백엔드가 아직 없어 VITE_API_URL 미설정 시 Figma 노드(38:2297)의 목업 데이터를
 * 반환한다. 백엔드 스펙 확정 후 경로·응답 매핑을 조정한다.
 */

export interface TrainingHistoryDetail {
  id: string;
  /** 교육명 */
  courseName: string;
  /** 교육일자 (YYYY-MM-DD) */
  trainedOn: string;
  /** 이수시간 (시간 단위) */
  hours: number;
  /** 신청인 표기 (예: 홍○○ (본인인증 완료)) */
  applicantLabel: string;
  /** 확인서 발급 상태 — 이 화면은 issuable/reissuable만 다룬다 */
  certificateStatus: "issuable" | "reissuable";
}

/** 목업 데이터 — 목록(25:2466~)과 동일한 표본 + 신청인(38:2310) */
const MOCK_DETAILS: TrainingHistoryDetail[] = [
  {
    id: "1",
    courseName: "비파괴검사 계속교육 (정기)",
    trainedOn: "2026-05-14",
    hours: 8,
    applicantLabel: "홍○○ (본인인증 완료)",
    certificateStatus: "issuable",
  },
  {
    id: "2",
    courseName: "감리원 법정 계속교육 2차",
    trainedOn: "2025-11-02",
    hours: 16,
    applicantLabel: "홍○○ (본인인증 완료)",
    certificateStatus: "issuable",
  },
  {
    id: "3",
    courseName: "안전관리 실무 심화과정",
    trainedOn: "2024-07-19",
    hours: 4,
    applicantLabel: "홍○○ (본인인증 완료)",
    certificateStatus: "reissuable",
  },
];

const API_BASE = import.meta.env.VITE_API_URL;

export async function getTrainingHistoryDetail(
  id: string,
): Promise<TrainingHistoryDetail> {
  // 백엔드 미연동 — 목업: 짧은 지연 후 해당 ID 반환
  if (!API_BASE) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const found = MOCK_DETAILS.find((item) => item.id === id);
    if (!found) {
      throw new Error("교육이력을 찾을 수 없어요");
    }
    return found;
  }

  const response = await fetch(
    `${API_BASE}/api/v1/training-histories/${encodeURIComponent(id)}`,
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("교육이력을 찾을 수 없어요");
    }
    throw new Error("문제가 생겨요. 잠시 후 다시 시도해 주세요");
  }

  // TODO(백엔드 스펙 확정 후): snake_case 응답 필드 매핑 조정
  return (await response.json()) as TrainingHistoryDetail;
}
