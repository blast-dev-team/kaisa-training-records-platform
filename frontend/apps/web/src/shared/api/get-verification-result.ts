/**
 * 계속교육이력확인서 진위확인 조회 API.
 *
 * 백엔드가 아직 없어 VITE_API_URL 미설정 시 Figma 노드(32:20)의 목업 데이터를
 * 반환한다. 백엔드 스펙 확정 후 경로·응답 매핑을 조정한다.
 */

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
}

export interface VerificationLookupParams {
  verificationId: string;
  applicantName: string;
  captchaToken: string;
}

/** 목업 데이터 — Figma 노드 32:20 값 */
const DEMO_VERIFICATION_ID = 'A7K9-2F4M-QX58';

const DEMO_RESULT: VerificationResult = {
  isValid: true,
  applicantName: '홍○○',
  certificateNumber: 'KAISA-2026-0004821',
  courseName: '비파괴검사 계속교육 (정기)',
  completionSummary: '8시간 (2026.05.14)',
  issuedAt: '2026.09.06',
  queriedAt: '2026.09.06',
};

/** 목업 실패 응답 — Figma 노드 32:2283 (확인 불가) 케이스 */
const DEMO_INVALID_RESULT: VerificationResult = {
  isValid: false,
  applicantName: '',
  certificateNumber: '',
  courseName: '',
  completionSummary: '',
  issuedAt: '',
  queriedAt: '2026.09.06',
};

const API_BASE = import.meta.env.VITE_API_URL;

export async function getVerificationResult(
  params: VerificationLookupParams,
): Promise<VerificationResult> {
  // 백엔드 미연동 — 목업: 짧은 지연 후 노드 데이터 반환.
  // 데모 ID가 아니면 확인 불가(노드 32:2283) 응답
  if (!API_BASE) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return params.verificationId === DEMO_VERIFICATION_ID
      ? DEMO_RESULT
      : DEMO_INVALID_RESULT;
  }

  const response = await fetch(`${API_BASE}/api/v1/verifications/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      verification_id: params.verificationId,
      applicant_name: params.applicantName,
      captcha_token: params.captchaToken,
    }),
  });

  if (!response.ok) {
    throw new Error('문제가 생겼어요. 잠시 후 다시 시도해 주세요');
  }

  // TODO(백엔드 스펙 확정 후): 응답 필드 매핑 조정
  const data = (await response.json()) as VerificationResult;
  return data;
}
