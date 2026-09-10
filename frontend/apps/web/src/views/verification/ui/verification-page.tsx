import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

import {
  getVerificationResult,
  type VerificationResult,
} from '@/src/shared/api/get-verification-result';
import { CapCaptcha } from '@/src/shared/lib/cap';
import { Button, TextField } from '@/src/shared/ui';
import { VerificationFailModal, VerificationResultModal } from '@/src/widget/verification-modal';

/**
 * 계속교육이력확인서 진위확인 — Figma node 19:25634 (Main Content) 기반.
 *
 * MainLayout(헤더·사이드바·푸터) 하위 `/verify` 라우트. 폼 구조는 비인증 페이지
 * (node 19:25742)와 동일하며, 조회 결과는 성공/실패 모달로 표시한다.
 * QR 접속 시 ?id= 로 진위확인 ID가 자동 입력된다.
 */
export function VerificationPage() {
  const [searchParams] = useSearchParams();
  const [verificationId, setVerificationId] = useState(searchParams.get('id') ?? '');
  const [applicantName, setApplicantName] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);

  const lookupMutation = useMutation({
    mutationFn: getVerificationResult,
    onSuccess: setResult,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    lookupMutation.mutate({
      verificationId: verificationId.trim(),
      applicantName: applicantName.trim(),
      issuanceDate: issuanceDate.trim(),
      captchaToken,
    });
  };

  // 세 입력(진위확인 ID · 성명 · 보안문자)을 모두 채워야 활성화
  const isSubmittable =
    verificationId.trim() !== '' &&
    applicantName.trim() !== '' &&
    issuanceDate.trim() !== '' &&
    captchaToken !== '';

  return (
    <section className="-mx-8 -my-10 flex flex-1 flex-col bg-[#f9f9f7] px-10 py-10 font-sans">
      {/* 헤더 — 제목(28px Bold) + 안내문(14px gray-600), gap 12px */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="flex w-full flex-col gap-3 text-center">
          <h1 className="text-[28px] leading-normal font-bold text-gray-900">
            계속교육이력확인서 진위확인
          </h1>
          <p className="text-sm leading-[1.6] text-gray-600">
            확인서 하단의 진위확인 ID와 발급 대상자의 성명을 입력하시면 해당 확인서의 유효 여부를
            확인할 수 있습니다.
          </p>
        </div>

        {/* 폼 카드 + 도움말 (gap 10px) */}
        <div className="flex w-full flex-col items-center gap-2.5">
          <form
            onSubmit={handleSubmit}
            className="flex w-[400px] flex-col gap-4 rounded-[12px] border border-solid border-gray-200 bg-white p-8"
          >
            <TextField
              variant="outlined"
              placeholder="진위확인 ID (예: A7K9-2F4M-QX58)"
              autoComplete="off"
              value={verificationId}
              onChange={(event) => setVerificationId(event.target.value)}
              className="overflow-clip rounded-lg"
            />
            <TextField
              variant="outlined"
              placeholder="발급날짜,숫자만 입력(예: 20251015)"
              autoComplete="off"
              value={issuanceDate}
              onChange={(event) => setIssuanceDate(event.target.value)}
              className="overflow-clip rounded-lg"
            />
            <TextField
              variant="outlined"
              placeholder="성명"
              autoComplete="name"
              value={applicantName}
              onChange={(event) => setApplicantName(event.target.value)}
              className="overflow-clip rounded-lg"
            />

            <CapCaptcha onSolve={setCaptchaToken} />

            <Button
              type="submit"
              fullWidth
              disabled={!isSubmittable || lookupMutation.isPending}
              className="rounded-lg px-6 py-4"
            >
              {lookupMutation.isPending ? '확인 중...' : '진위 확인'}
            </Button>

            {lookupMutation.isError && (
              <p className="text-sm text-red-500">
                {lookupMutation.error instanceof Error
                  ? lookupMutation.error.message
                  : '문제가 생겨요. 잠시 후 다시 시도해 주세요'}
              </p>
            )}
          </form>

          <p className="text-[13px] text-gray-500">
            QR 코드로 접속한 경우 진위확인 ID가 자동 입력됩니다.
          </p>
        </div>
      </div>

      {result && result.isValid && (
        <VerificationResultModal result={result} onClose={() => setResult(null)} />
      )}
      {result && !result.isValid && <VerificationFailModal onRetry={() => setResult(null)} />}
    </section>
  );
}
