import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { XIcon } from "@/src/shared/icon";
import { Button, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { postCompletionCertificates } from "../api/post-completion-certificates";
import type { CompletionCertificate } from "../api/post-completion-certificates";
import { getCompletionCertificatePreview } from "../api/get-completion-certificate-preview";
import {
  certificatePdfFileName,
  generateCertificatePdf,
} from "../api/generate-certificate-pdf";
import { CompletionCertificateSheet } from "./completion-certificate-sheet";

const TOAST_DURATION_MS = 3000;

export interface CompletionCertificateModalProps {
  /** 수료증 발급 대상 교육이력 ID 목록 — 열리면 미리보기 조회, PDF 저장 시 발급(무료·멱등) */
  recordIds: string[];
  onClose: () => void;
  /** 발급 성공 시 — 페이지가 선택 상태를 비운다 */
  onIssued?: () => void;
  /** 슈퍼 계정 — 발급 없이 미리보기·저장만 (미부여 번호, 실제 교육생 데이터) */
  previewOnly?: boolean;
}

/**
 * 수료증 미리보기·다운로드 모달 — 결제 없는 무료 발급.
 *
 * 미리보기는 그저 미리보기 — 열릴 때 발급 없이 스냅샷으로 조립해 보여 준다(번호 미부여).
 * PDF 다운로드를 누르는 시점에 서버에 발급을 요청하고(멱등 — 기발급 건은 기존 수료증
 * 반환), 응답(수료증 번호 포함)으로 시트를 갈아끼운 뒤 건별 파일로 저장한다
 * (1 이력 = 1 수료증). previewOnly(슈퍼 계정)면 발급 없이 현재 미리보기를 그대로 저장한다.
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
  });

  /** 미리보기 — 발급 없이 조회. 모달을 열 때 항상 이 조회로 연다 */
  const preview = useQuery({
    queryKey: ["completion-certificate", "preview", ...recordIds],
    queryFn: () => Promise.all(recordIds.map((id) => getCompletionCertificatePreview(id))),
    enabled: certificates === null,
  });

  // 미리보기 데이터 도착 — 같은 화면을 그대로 재사용한다
  useEffect(() => {
    if (preview.data && certificates === null) {
      setCertificates(preview.data);
    }
  }, [preview.data, certificates]);

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
   * PDF 다운로드 — 저장 시점에 발급을 확정한다(미리보기는 발급 없이 열린다).
   * 멱등이라 기발급 건은 기존 수료증을 돌려주므로 재다운로드도 안전. 응답(실제
   * 번호 포함)으로 시트를 갈아끼우고 두 프레임 뒤 캡처해 A4 PDF 파일로 저장한다.
   * previewOnly(슈퍼 계정)면 발급 없이 현재 미리보기를 그대로 저장한다.
   */
  const handleDownloadPdf = async () => {
    setIsPdfGenerating(true);
    try {
      let data = certificates;
      if (!previewOnly) {
        data = await issue.mutateAsync();
        setCertificates(data);
        // 시트가 실제 번호로 다시 그려진 뒤 캡처해야 한다 — 렌더 커밋 대기(두 프레임)
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }
      const container = captureRef.current;
      if (!container || !data) return;
      for (const certificate of data) {
        const el = container.querySelector<HTMLElement>(
          `[data-cert="${certificate.id}"]`,
        );
        if (!el) continue;
        await generateCertificatePdf(
          [el],
          certificatePdfFileName([certificate.courseName], "수료증"),
        );
      }
      showToast(
        data.length > 1
          ? `수료증 ${data.length}개 파일을 저장했어요`
          : "다운로드했어요",
      );
      if (!previewOnly) onIssued?.();
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

  const isError = preview.isError;

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
            <p className="text-14 text-gray-700">
              {preview.error instanceof Error
                ? preview.error.message
                : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outlined"
                color="gray"
                onClick={() => preview.refetch()}
              >
                다시 시도
              </Button>
              <Button variant="outlined" color="gray" onClick={onClose}>
                닫기
              </Button>
            </div>
          </div>
        ) : preview.isPending || certificates === null ? (
          <p className="py-20 text-center text-14 text-gray-500">
            미리보기를 불러오고 있어요
          </p>
        ) : (
          <>
            <h2 className="text-18 leading-normal font-bold text-gray-900 mobile:text-16">
              수료증 미리보기
            </h2>
            <p className="text-14 leading-normal text-gray-500 mobile:text-13">
              {previewOnly
                ? `수료증 미리보기 ${certificates.length}건 — 발급되지 않은 미리보기예요`
                : `사내 기관 수료내역 ${certificates.length}건 — PDF로 저장하면 발급돼요`}
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
                    <figcaption className="mt-1 text-center text-12 leading-normal text-gray-500">
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
              className="shrink-0 rounded-lg bg-gray-900 py-4 text-16 font-bold hover:bg-gray-800 mobile:py-3 mobile:text-14"
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
