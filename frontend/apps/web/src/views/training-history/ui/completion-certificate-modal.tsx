import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { XIcon } from "@/src/shared/icon";
import { Button, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { postCompletionCertificates } from "../api/post-completion-certificates";
import type { CompletionCertificate } from "../api/post-completion-certificates";
import { getCompletionCertificatePreview } from "../api/get-completion-certificate-preview";
import { generateCertificatePdf } from "../api/generate-certificate-pdf";
import { CompletionCertificateSheet } from "./completion-certificate-sheet";

const TOAST_DURATION_MS = 3000;

/** 로컬(브라우저 = KST) 기준 YYYY-MM-DD — toISOString()은 UTC라 새벽에 하루 어긋난다 */
function todayYMD(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface CompletionCertificateModalProps {
  /** 수료증 발급 대상 교육이력 ID 목록 — 열리는 순간 서버에 발급 요청(무료·멱등) */
  recordIds: string[];
  onClose: () => void;
  /** 발급 성공 시 — 페이지가 선택 상태를 비운다 */
  onIssued?: () => void;
  /** 슈퍼 계정 — 발급 없이 미리보기만 (미부여 번호, 실제 교육생 데이터) */
  previewOnly?: boolean;
}

/**
 * 수료증 미리보기·다운로드 모달 — 결제 없는 무료 발급.
 *
 * 열리는 순간 서버에 발급을 요청하고, 응답(수료증 번호 포함)으로 미리보기를
 * 보여 준다. PDF 다운로드를 누르면 건별 파일로 저장한다 (1 이력 = 1 수료증).
 * previewOnly(슈퍼 계정)면 발급 API 대신 미리보기 API로 조회만 한다.
 */
export function CompletionCertificateModal({
  recordIds,
  onClose,
  onIssued,
  previewOnly = false,
}: CompletionCertificateModalProps) {
  const [certificates, setCertificates] = useState<CompletionCertificate[] | null>(
    null,
  );
  /** 다운로드 피드백 — 페이드아웃 진행 여부를 함께 들고 있다가 애니메이션 후 언마운트 */
  const [toast, setToast] = useState<{ message: string; isClosing: boolean } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);
  /** PDF 다운로드 캡처 대상 — 화면 밖 원본 크기 시트 */
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  /** 미리보기 축소율 — 모달 폭에 맞춰 A4 시트(794px)를 등비 축소한다 */
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.9);

  const issue = useMutation({
    mutationFn: () => postCompletionCertificates(recordIds),
    onSuccess: (result) => {
      setCertificates(result);
      onIssued?.();
    },
  });

  /** 슈퍼 계정 미리보기 — 발급 없이 조회만. previewOnly일 때만 쿼리한다 */
  const preview = useQuery({
    queryKey: ["completion-certificate", "preview", ...recordIds],
    queryFn: () => Promise.all(recordIds.map((id) => getCompletionCertificatePreview(id))),
    enabled: previewOnly && certificates === null,
  });

  // 모달이 열리면 한 번만 발급 요청 — 무료라 결제 단계 없이 바로 발급된다
  useEffect(() => {
    if (!previewOnly) issue.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 미리보기 데이터 도착 — 같은 화면을 그대로 재사용한다
  useEffect(() => {
    if (previewOnly && preview.data && certificates === null) {
      setCertificates(preview.data);
    }
  }, [previewOnly, preview.data, certificates]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => setPreviewScale(el.clientWidth / 794);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [certificates]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 모달 뒤 본문 스크롤 잠금 — 모달 안 제스처로 배경 페이지가 굴러가지 않게 한다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
    toastTimer.current = window.setTimeout(dismissToast, TOAST_DURATION_MS);
  };

  /**
   * PDF 다운로드 — 화면 밖에 렌더해 둔 수료증 시트를 건별 캡처해
   * A4 PDF 파일로 저장한다. 여러 건이면 인원별 파일이 된다.
   */
  const handleDownloadPdf = async () => {
    const container = captureRef.current;
    if (!container || !certificates) return;
    setIsPdfGenerating(true);
    try {
      for (const certificate of certificates) {
        const el = container.querySelector<HTMLElement>(
          `[data-cert="${certificate.id}"]`,
        );
        if (!el) continue;
        await generateCertificatePdf(
          [el],
          `수료증_${certificate.traineeName || certificate.traineeId}_${todayYMD()}.pdf`,
        );
      }
      showToast(
        certificates.length > 1
          ? `수료증 ${certificates.length}개 파일을 저장했어요`
          : "다운로드했어요",
      );
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "문제가 생겼어요. 잠시 후 다시 시도해 주세요",
      );
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const isError = previewOnly ? preview.isError : issue.isError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="수료증 미리보기"
        onClick={(event) => event.stopPropagation()}
        className="relative flex h-[720px] max-h-[calc(100dvh-40px)] w-[840px] max-w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg bg-white p-7 font-sans shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] mobile:h-[calc(100dvh-40px)] mobile:w-full mobile:p-4"
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex size-8 cursor-pointer items-center justify-center text-gray-500"
        >
          <XIcon className="size-6" />
        </button>

        {isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-gray-700">
              {issue.error instanceof Error
                ? issue.error.message
                : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outlined"
                color="gray"
                onClick={() => issue.mutate()}
              >
                다시 시도
              </Button>
              <Button variant="outlined" color="gray" onClick={onClose}>
                닫기
              </Button>
            </div>
          </div>
        ) : issue.isPending || certificates === null ? (
          <p className="py-20 text-center text-sm text-gray-500">
            {previewOnly ? "미리보기를 불러오고 있어요" : "수료증을 발급하고 있어요"}
          </p>
        ) : (
          <>
            <h2 className="text-lg leading-normal font-bold text-gray-900 mobile:text-base">
              수료증 미리보기
            </h2>
            <p className="text-sm leading-normal text-gray-500 mobile:text-[13px]">
              {previewOnly
                ? `수료증 미리보기 ${certificates.length}건 — 발급되지 않은 미리보기예요`
                : `내부 기관 수료내역 ${certificates.length}건 — 결제 없이 바로 내려받을 수 있어요`}
            </p>

            {/* 미리보기 — 모달 본문 폭에 맞춘 등비 축소, 시트 원본은 A4 794px */}
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
              <div ref={previewRef} className="w-full flex-none">
                {certificates.map((certificate) => (
                  <figure key={certificate.id} className="m-0 mb-6">
                    <div
                      className="pointer-events-none overflow-hidden"
                      style={{ aspectRatio: "794 / 1123" }}
                    >
                      <div
                        style={{
                          width: 794,
                          transform: `scale(${previewScale})`,
                          transformOrigin: "top left",
                        }}
                      >
                        <CompletionCertificateSheet certificate={certificate} />
                      </div>
                    </div>
                    <figcaption className="mt-1 text-center text-xs leading-normal text-gray-500">
                      {certificate.traineeName} · {certificate.certificateNo}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>

            {/* PDF 다운로드 — 건별 파일로 저장한다 */}
            <Button
              color="black"
              fullWidth
              disabled={isPdfGenerating}
              onClick={() => void handleDownloadPdf()}
              className="shrink-0 rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800 mobile:py-3 mobile:text-sm"
            >
              {isPdfGenerating
                ? "생성 중..."
                : certificates.length > 1
                  ? `전체 다운로드 (수료증 ${certificates.length}건)`
                  : "PDF 다운로드"}
            </Button>

            {/* 캡처 전용 원본 크기 시트 — 화면 밖에 두고 PDF 생성에만 쓴다 */}
            <div aria-hidden className="fixed left-[-10000px] top-0" ref={captureRef}>
              {certificates.map((certificate) => (
                <div key={certificate.id} data-cert={certificate.id}>
                  <CompletionCertificateSheet certificate={certificate} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 다운로드 피드백 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <Toast
            type="success"
            onClose={dismissToast}
            className={cn(toast.isClosing && "animate-toast-out")}
          >
            {toast.message}
          </Toast>
        </div>
      )}
    </div>
  );
}
