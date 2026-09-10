import defaultPreview from "@/src/assets/certificate-preview.png";
import { cn } from "@/src/shared/utils/cn";

export interface CertificatePreviewProps {
  /** 서버가 내려준 확인서 이미지 — 없으면 기본 에셋으로 대체 */
  imageUrl?: string;
  className?: string;
}

/**
 * 확인서 미리보기 — Figma 노드 37:26470 기반.
 *
 * 디자인은 스크린샷 1252×1780 에셋을 임베딩해 뒀다. 발급 에셋을 그대로
 * 받아 저장했고, API 연결 후 previewImageUrl로 실제 확인서 이미지를 받는다.
 */
export function CertificatePreview({
  imageUrl,
  className,
}: CertificatePreviewProps) {
  return (
    <figure
      className={cn(
        "relative aspect-[1252/1780] min-w-px flex-1 overflow-hidden print:hidden",
        className,
      )}
    >
      <img
        src={imageUrl ?? defaultPreview}
        alt="계속교육이력확인서 미리보기"
        className="absolute inset-0 size-full object-cover"
      />
    </figure>
  );
}

export interface CertificatePrintSheetProps {
  imageUrl?: string;
}

/**
 * 인쇄용 확인서 시트 — 화면에서는 숨기고 인쇄 시에만 A4 폭으로 노출한다.
 * 페이지의 나머지 요소는 print:hidden이라 이 시트만 인쇄된다.
 */
export function CertificatePrintSheet({ imageUrl }: CertificatePrintSheetProps) {
  return (
    <div className="fixed inset-0 z-[999] hidden overflow-auto bg-white p-10 print:block">
      <img
        src={imageUrl ?? defaultPreview}
        alt="계속교육이력확인서"
        className="mx-auto w-full max-w-[794px]"
      />
    </div>
  );
}
