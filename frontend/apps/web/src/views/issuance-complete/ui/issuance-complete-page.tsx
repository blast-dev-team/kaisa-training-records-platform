import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { CaretLeftIcon } from "@/src/shared/icon";
import { Button, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";
import { IssuanceStepper } from "@/src/widget";

import { downloadCertificatePdf } from "../api/download-certificate-pdf";
import { getIssuanceResult, type IssuanceResult } from "../api/get-issuance-result";
import { CertificatePreview, CertificatePrintSheet } from "./certificate-preview";

const TOAST_DURATION_MS = 3000;

/**
 * 교육 인증서 발급 완료 — Figma node 37:26367 기반.
 *
 * 좌측 확인서 미리보기 + 우측 액션(PDF 다운로드 · 인쇄 · 진위확인 링크 복사)과
 * 발급 정보 카드. 결과는 라우트 :id로 조회한다.
 */
export function IssuanceCompletePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // 페이드아웃 진행 여부를 함께 들고 있다가 애니메이션 후 언마운트한다
  const [toast, setToast] = useState<{
    message: string;
    isClosing: boolean;
  } | null>(null);

  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["issuance-complete", id],
    queryFn: () => getIssuanceResult(id as string),
    enabled: id !== undefined,
  });

  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    };
  }, []);

  /** 페이드아웃(200ms) 후 완전히 제거한다 */
  const dismissToast = () => {
    setToast((current) =>
      current ? { ...current, isClosing: true } : current,
    );
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 200);
  };

  const showToast = (message: string) => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast({ message, isClosing: false });
    toastTimer.current = window.setTimeout(
      () => dismissToast(),
      TOAST_DURATION_MS,
    );
  };

  /** PDF 다운로드 — 백엔드 pdfUrl이 없으면 인쇄 대화상자('PDF로 저장')로 대체 */
  const handleDownloadPdf = async () => {
    if (!result) return;
    try {
      const downloaded = await downloadCertificatePdf(result);
      if (!downloaded) {
        window.print();
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
      );
    }
  };

  /** 진위확인 링크 복사 — ?id= 자동 입력되는 공개 진위확인 페이지로 연결 */
  const handleCopyLink = async () => {
    if (!result) return;
    const url = `${window.location.origin}/verification-no-auth?id=${encodeURIComponent(result.verificationId)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("링크가 복사됐어요");
    } catch {
      showToast("복사에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
  };

  if (isLoading) {
    return (
      <section className="flex flex-1 items-center justify-center py-20 font-sans text-sm text-gray-500">
        확인서 정보를 불러오고 있어요
      </section>
    );
  }

  if (isError || !result) {
    return (
      <section className="flex flex-col items-center gap-4 py-20 text-center font-sans">
        <p className="text-sm text-gray-700">
          {error instanceof Error
            ? error.message
            : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
        </p>
        <Button variant="outlined" color="gray" onClick={() => refetch()}>
          다시 시도
        </Button>
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-6 font-sans print:hidden">
        {/* 뒤로가기 + 페이지 제목 */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex cursor-pointer items-center gap-2 self-start text-left"
        >
          <span className="size-8 text-gray-700">
            <CaretLeftIcon />
          </span>
          <h1 className="text-[28px] leading-normal font-bold whitespace-nowrap text-gray-900">
            발급 완료
          </h1>
        </button>

        <IssuanceStepper currentStep={3} />

        <div className="flex items-start gap-6">
          <CertificatePreview imageUrl={result.previewImageUrl} />

          <div className="flex min-w-px flex-1 flex-col gap-6">
            {/* 액션 — PDF 다운로드 · 인쇄 · 진위확인 링크 복사 */}
            <div className="flex items-center gap-3">
              <Button
                className="rounded-lg px-6 py-3 text-sm"
                onClick={handleDownloadPdf}
              >
                PDF 다운로드
              </Button>
              <Button
                variant="outlined"
                color="gray"
                className="rounded-lg px-6 py-3 text-sm font-medium text-gray-700"
                onClick={() => window.print()}
              >
                인쇄
              </Button>
              <Button
                variant="outlined"
                color="gray"
                className="rounded-lg px-6 py-3 text-sm font-medium text-gray-700"
                onClick={handleCopyLink}
              >
                진위확인 링크 복사
              </Button>
            </div>

            {/* 안내 배너 */}
            <div className="w-full rounded-lg border border-solid border-primary-100 bg-primary-50 px-5 py-3.5">
              <ul className="ms-5 list-disc text-[13px] leading-normal text-primary-700">
                <li>확인서 하단 진위확인 ID로 제출처에서 유효성을 검증할 수 있습니다.</li>
                <li>재다운로드는 일주일 이내에 발급·결제 내역에서 가능합니다.</li>
              </ul>
            </div>

            {/* 발급 정보 카드 */}
            <InfoCard result={result} />
          </div>
        </div>
      </section>

      {/* 인쇄 시에만 노출 — 확인서 단독 출력 */}
      <CertificatePrintSheet imageUrl={result.previewImageUrl} />

      {/* 복사 · 다운로드 피드백 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 print:hidden">
          <Toast
            type="success"
            onClose={dismissToast}
            className={cn(toast.isClosing && "animate-toast-out")}
          >
            {toast.message}
          </Toast>
        </div>
      )}
    </>
  );
}

function InfoCard({ result }: { result: IssuanceResult }) {
  const rows: Array<[label: string, value: string]> = [
    ["확인서 번호", result.certificateNumber],
    ["진위확인 ID", result.verificationId],
    ["발급일시", result.issuedAtLabel],
    ["유효기간", result.validityLabel],
  ];

  return (
    <dl className="w-full rounded-lg border border-solid border-gray-200 bg-white px-7 py-6">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-solid border-gray-100 py-3.5"
        >
          <dt className="text-sm leading-normal font-medium whitespace-nowrap text-gray-500">
            {label}
          </dt>
          <dd className="text-sm leading-normal font-medium whitespace-nowrap text-gray-800">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
