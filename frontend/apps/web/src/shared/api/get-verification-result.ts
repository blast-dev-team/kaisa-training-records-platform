/**
 * 계속교육이력확인서 진위확인 조회 API — 실제 백엔드 연동 (공개 엔드포인트, 인증 불필요).
 * POST /api/public/certificate-verifications — 진위확인 ID 는 확인서 번호(certificate_no).
 * 성명은 폼 입력만 있을 뿐 서버가 검증하지 않는다 (데모 단계 — 이름 일치와 무관하게 확인 가능).
 * 결과는 유효(valid)만 상세를 노출하고 expired·revoked·not_found 는 확인 불가로 처리한다.
 */

/** 묶음 확인서의 교육이력 1행 — 확인서에 인쇄된 정보만 서버가 공개한다 */
export interface VerificationRecordRow {
  courseName: string;
  hoursSummary: string;
}

export interface VerificationResult {
  /** 진위확인 결과 — true면 유효한 확인서 */
  isValid: boolean;
  /** 성명 (마스킹된 값, 예: 홍○○) */
  applicantName: string;
  /** 확인서번호 */
  certificateNumber: string;
  /** 교육명 */
  courseName: string;
  /** 이수시간 요약 (예: 8시간 (2026.05.14)) */
  completionSummary: string;
  /** 발급일 (YYYY.MM.DD) */
  issuedAt: string;
  /** 조회일 (YYYY.MM.DD) */
  queriedAt: string;
  /** 묶음 확인서의 전체 교육내역 — 1건 발급이면 빈 배열 */
  records: VerificationRecordRow[];
}

export interface VerificationLookupParams {
  /** 진위확인 ID — 확인서 번호와 같다 */
  verificationId: string;
  /** 성명 — 데모 단계에선 서버 검증 없음 (입력 필수는 폼 정책) */
  applicantName: string;
}

/** 백엔드 PublicVerificationResponse — snake_case 그대로 */
interface PublicVerificationDto {
  result: string;
  certificate_no: string | null;
  issued_name_masked: string | null;
  course_name: string | null;
  total_hours: string | number | null;
  training_ended_at: string | null;
  issued_at: string | null;
  records: Array<{
    course_name: string;
    institution_name: string | null;
    total_hours: string | number;
    training_ended_at: string | null;
  }> | null;
  message: string | null;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function formatYMD(iso: string | null): string {
  if (!iso) return "";
  return iso.replaceAll("-", ".");
}

function todayYMD(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
}

function toResult(dto: PublicVerificationDto): VerificationResult {
  // 유효한 확인서만 상세 노출 — expired·revoked·not_found 는 확인 불가 화면
  if (dto.result !== "valid") {
    return {
      isValid: false,
      applicantName: "",
      certificateNumber: "",
      courseName: "",
      completionSummary: "",
      issuedAt: "",
      queriedAt: todayYMD(),
      records: [],
    };
  }
  const hours = dto.total_hours != null ? Number(dto.total_hours) : null;
  return {
    isValid: true,
    applicantName: dto.issued_name_masked ?? "",
    certificateNumber: dto.certificate_no ?? "",
    courseName: dto.course_name ?? "",
    completionSummary:
      hours != null ? `${hours}시간 (${formatYMD(dto.training_ended_at)})` : "",
    issuedAt: formatYMD(dto.issued_at),
    queriedAt: todayYMD(),
    records: (dto.records ?? []).map((record) => {
      const recordHours = Number(record.total_hours);
      return {
        courseName: record.course_name,
        hoursSummary: Number.isNaN(recordHours)
          ? ""
          : `${recordHours}시간 (${formatYMD(record.training_ended_at)})`,
      };
    }),
  };
}

export async function getVerificationResult(
  params: VerificationLookupParams,
): Promise<VerificationResult> {
  const response = await fetch(`${API_BASE}/api/public/certificate-verifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificate_no: params.verificationId }),
  });
  const data = (await response.json().catch(() => ({}))) as Partial<
    PublicVerificationDto & { message: string }
  >;
  if (!response.ok) {
    throw new Error(
      data.message ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
    );
  }
  return toResult(data as PublicVerificationDto);
}
