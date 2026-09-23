import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { generateCertificatePdf } from "@/src/shared/utils/generate-certificate-pdf";
import { todayYMD } from "@/src/shared/utils/format";
import type { CompletionCertificate } from "@/src/entities/training-record";
import { CompletionCertificateSheet } from "./completion-certificate-sheet";

/** A4 시트 원본 폭·높이 @96dpi — 미리보기 스케일 계산용 */
const SHEET_WIDTH = 794;
const SHEET_HEIGHT = 1123;
const PREVIEW_SCALE = 0.72;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 발급된 수료증들 — 1건 = 1장 PDF. 여러 건이면 인원별 파일로 저장된다 */
  certificates: CompletionCertificate[] | null;
}

/**
 * 수료증 미리보기 모달 — 발급 응답(번호 포함)을 그대로 미리보고 저장한다.
 * 확인서 미리보기와 같은 캡처 방식: 화면 밖 원본 크기 시트를 래스터화해 PDF로.
 */
export function CompletionCertificateModal({ isOpen, onClose, certificates }: Props) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const certs = certificates ?? [];

  const handleDownloadAll = async () => {
    const container = captureRef.current;
    if (!container) return;
    setIsDownloading(true);
    try {
      for (const certificate of certs) {
        const el = container.querySelector<HTMLElement>(
          `[data-cert="${certificate.id}"]`,
        );
        if (!el) continue;
        await generateCertificatePdf(
          [el],
          `수료증_${certificate.traineeName || certificate.traineeId}_${todayYMD()}.pdf`,
        );
      }
      toast.success(
        certs.length > 1 ? `수료증 ${certs.length}개 파일을 저장했어요` : "PDF를 저장했어요",
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 생성에 실패했어요");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title="수료증 미리보기"
        description={
          certs.length > 1
            ? `수료증 ${certs.length}건 — 건별 PDF로 저장돼요`
            : certs[0]
              ? `${certs[0].traineeName ?? ""} · ${certs[0].certificateNo}`
              : undefined
        }
        size="xl"
        actions={[
          { label: "닫기", onClick: onClose },
          {
            label: certs.length > 1 ? "전체 다운로드" : "PDF 다운로드",
            variant: "primary",
            isLoading: isDownloading,
            onClick: handleDownloadAll,
          },
        ]}
      >
        <div className="flex max-h-[60vh] flex-wrap justify-center gap-6 overflow-auto rounded-lg border border-line bg-bg p-4">
          {certs.map((certificate) => (
            <figure key={certificate.id} className="m-0">
              <div
                style={{
                  width: SHEET_WIDTH * PREVIEW_SCALE,
                  height: SHEET_HEIGHT * PREVIEW_SCALE,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
                  }}
                >
                  <CompletionCertificateSheet certificate={certificate} />
                </div>
              </div>
              <figcaption className="mt-1 text-center text-[12px] text-ink-2">
                {certificate.traineeName} · {certificate.certificateNo}
              </figcaption>
            </figure>
          ))}
        </div>
      </Dialog>

      {/* 캡처 전용 원본 크기 시트 — 화면 밖에 두고 PDF 생성에만 쓴다 */}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0 }} ref={captureRef}>
        {isOpen &&
          certs.map((certificate) => (
            <div key={certificate.id} data-cert={certificate.id}>
              <CompletionCertificateSheet certificate={certificate} />
            </div>
          ))}
      </div>
    </>
  );
}
