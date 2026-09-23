/**
 * 교육이력 상세(발급 신청 대상) 조회 API — 실제 백엔드 연동
 * (USE_MOCK 예외 — 목록 API 참고). 본인 이력 또는 공용 데모 이력을 반환한다.
 */
import { useAuthStore } from "@/src/shared/store/auth-store";

export interface TrainingHistoryDetail {
  id: string;
  /** 교육명 */
  courseName: string;
  /** 교육일자 (YYYY-MM-DD) */
  trainedOn: string;
  /** 이수시간 (시간 단위) */
  hours: number;
  /** 교육기관명 — 확인서 표기용 */
  institutionName?: string;
  /** 확인서 서식번호 (예: 제31호) — 좌측 상단 표기 */
  /** 확인서 문서번호 (예: 대축-2026-0001) — 우측 상단 표기 */
  /** 감리원 등급 — 신청인 칸 표기 */
  supervisorGrade?: string;
  /** 감리원증 발급번호 — 신청인 칸 표기 */
  supervisorCertNo?: string;
  /** 신청인 표기 (예: 홍○○ (본인인증 완료)) */
  applicantLabel: string;
  /** 이력 소유 교육생명 — 슈퍼 계정 미리보기에서 서식 성명으로 쓴다 */
  traineeName?: string;
  /** 확인서 발급 상태 — 서버가 회원별로 판정 (데모 이력 공유 대응) */
  certificateStatus: "issuable" | "reissuable" | "unavailable";
  /** 직전 발급일시 (ISO) — reissue일 때만 */
  lastIssuedAt?: string;
  /** 7일 무료 재발급 기한 (ISO) — 기한 내면 무료, 지나면 유료 재발급 */
  reissueFreeUntil?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function getTrainingHistoryDetail(id: string): Promise<TrainingHistoryDetail> {
  const response = await fetch(`${API_BASE}/api/me/training-records/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new Error(body.message ?? "교육내역을 찾을 수 없어요");
    }
    throw new Error(body.message ?? "문제가 생겨요. 잠시 후 다시 시도해 주세요");
  }

  const data = await response.json();
  // 신청인 표기 — 로그인한 회원명 (본인인증 완료 상태라 고정 문구).
  // 슈퍼 계정은 남의 이력을 보므로 이력 소유 교육생명을 쓴다 (없으면 로그인명 폴백)
  const userName = useAuthStore.getState().userName;
  return {
    id: data.id,
    courseName: data.course_name,
    trainedOn: data.started_at ?? data.ended_at ?? "",
    hours: Number(data.total_hours),
    institutionName: data.institution_name ?? undefined,
    supervisorGrade: data.supervisor_grade ?? undefined,
    supervisorCertNo: data.supervisor_cert_no ?? undefined,
    traineeName: data.trainee_name ?? undefined,
    applicantLabel: `${data.trainee_name ?? userName} (본인인증 완료)`,
    // 발급 게이트(3년·수료·기발급)는 서버 판정 값을 그대로 쓴다
    certificateStatus: data.certificate_status ?? "issuable",
    lastIssuedAt: data.last_issued_at ?? undefined,
    reissueFreeUntil: data.reissue_free_until ?? undefined,
  };
}
