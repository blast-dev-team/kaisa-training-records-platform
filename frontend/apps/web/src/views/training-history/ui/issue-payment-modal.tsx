import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Checkbox, Dropdown, Toast, type DropdownOption } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { downloadCertificatePdf } from "../../issuance-complete/api/download-certificate-pdf";
import { getIssuanceResult, type IssuanceResult } from "../../issuance-complete/api/get-issuance-result";
import {
  CertificatePreview,
  CertificatePrintSheet,
} from "../../issuance-complete/ui/certificate-preview";
import { getTrainingHistoryDetail } from "../api/get-training-history-detail";
import { postIssuancePayment } from "../api/post-issuance-payment";

export interface IssuePaymentModalProps {
  /** 발급 대상 교육이력 ID */
  recordId: string;
  onClose: () => void;
}

/** 확인서 발급 수수료 — Figma node 38:2327 */
const ISSUANCE_FEE = 3000;

/** 발급 용도 옵션 — Figma node 38:2311 placeholder 예시 기반 */
const PURPOSE_OPTIONS: DropdownOption[] = [
  { value: "renewal", label: "자격 갱신 제출용" },
  { value: "review", label: "자격심사 제출용" },
  { value: "etc", label: "기타" },
];

const PURPOSE_PLACEHOLDER = "발급 용도 (선택) — 예: 자격 갱신 제출용";

const TOAST_DURATION_MS = 3000;

/** 모달 단계 — 결제 → 발급 완료 */
type ModalPhase = "payment" | "issued";

/**
 * 확인서 발급 결제·발급 완료 모달 — Figma node 78:3911(결제) · 78:4533(발급 완료) 기반.
 *
 * 교육이력 목록의 「발급 신청 · 재발급」 클릭 시 띄운다.
 * 결제 성공(또는 재발급) 시 같은 자리에서 발급 완료 화면(840×600 고정, 본문
 * 스크롤)으로 전환한다 — 페이지 이동은 없다.
 */
export function IssuePaymentModal({ recordId, onClose }: IssuePaymentModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("payment");
  const [purpose, setPurpose] = useState("");
  const [agreed, setAgreed] = useState(false);
  // 페이드아웃 진행 여부를 함께 들고 있다가 애니메이션 후 언마운트한다
  const [toast, setToast] = useState<{ message: string; isClosing: boolean } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);

  const queryClient = useQueryClient();

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["training-history", "detail", recordId],
    queryFn: () => getTrainingHistoryDetail(recordId),
  });

  // 발급 완료 결과 — 결제·재발급 단계 전환 후에만 조회한다
  const issuance = useQuery({
    queryKey: ["issuance-complete", recordId],
    queryFn: () => getIssuanceResult(recordId),
    enabled: phase === "issued",
  });

  const payment = useMutation({
    mutationFn: () =>
      postIssuancePayment({
        recordId,
        purpose,
        agreed,
        amount: ISSUANCE_FEE,
      }),
    onSuccess: () => {
      // 발급 가능 상태로 목록을 갱신하고 같은 모달에서 완료 화면으로
      queryClient.invalidateQueries({ queryKey: ["training-history", "list"] });
      setPhase("issued");
    },
  });

  // 재발급 — 결제 없이 바로 발급 완료 단계로
  useEffect(() => {
    if (!detail || detail.certificateStatus !== "reissuable") return;
    setPhase("issued");
  }, [detail]);

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

  // 결제 진행 중에는 닫지 못하게 한다
  const canClose = !(phase === "payment" && payment.isPending);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canClose) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canClose, onClose]);

  const feeLabel = ISSUANCE_FEE.toLocaleString("ko-KR");
  const canPay = agreed && !payment.isPending && !!detail;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={() => canClose && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={phase === "payment" ? "확인서 발급 결제" : "확인서 발급 완료"}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex max-h-[calc(100dvh-40px)] max-w-full flex-col gap-4 overflow-y-auto rounded-lg bg-white p-7 font-sans shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)]",
          phase === "payment" ? "w-[500px]" : "h-[600px] w-[840px]",
        )}
      >
        {phase === "payment" ? (
          isLoading ? (
            <p className="py-20 text-center text-sm text-gray-500">
              신청 내용을 불러오고 있어요
            </p>
          ) : isError || !detail ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <p className="text-sm text-gray-700">
                {error instanceof Error
                  ? error.message
                  : "문제가 생겨요. 잠시 후 다시 시도해 주세요"}
              </p>
              <div className="flex gap-2">
                <Button variant="outlined" color="gray" onClick={() => refetch()}>
                  다시 시도
                </Button>
                <Button variant="outlined" color="gray" onClick={onClose}>
                  닫기
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 신청 내용 — node 78:3912 */}
              <div className="flex w-full flex-col gap-4 rounded-lg border border-solid border-gray-200 p-5">
                <h2 className="text-lg leading-normal font-bold text-gray-900">
                  신청 내용
                </h2>

                <dl className="flex w-full flex-col gap-4">
                  <DetailRow label="교육명" value={detail.courseName} />
                  <DetailRow
                    label="교육일자"
                    value={detail.trainedOn.replaceAll("-", ".")}
                  />
                  <DetailRow label="이수시간" value={`${detail.hours}시간`} />
                  <DetailRow label="신청인" value={detail.applicantLabel} />
                </dl>

                <Dropdown
                  options={PURPOSE_OPTIONS}
                  value={purpose}
                  onChange={(next) => setPurpose(next as string)}
                  placeholder={PURPOSE_PLACEHOLDER}
                />
              </div>

              {/* 결제 — node 78:3929~78:3941 */}
              <h2 className="text-lg leading-normal font-bold text-gray-900">
                결제
              </h2>

              <div className="flex w-full items-start justify-between text-sm leading-normal">
                <p className="text-gray-600">확인서 1건</p>
                <p className="text-gray-700">{feeLabel}원</p>
              </div>

              <div className="flex w-full items-start justify-between text-base leading-normal font-bold text-gray-900">
                <p>결제 금액</p>
                <p>{feeLabel}원</p>
              </div>

              <Checkbox
                size="s"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              >
                [필수] 발급·환불 규정에 동의합니다.
              </Checkbox>

              <Button
                color="black"
                fullWidth
                disabled={!canPay}
                onClick={() => payment.mutate()}
                className="rounded-lg py-4 text-base font-bold"
              >
                <span className="flex items-center gap-2">
                  <span>{feeLabel}원</span>
                  <span>{payment.isPending ? "결제 중..." : "결제하기"}</span>
                </span>
              </Button>

              {payment.isError && (
                <p className="text-xs leading-normal text-red-500" role="alert">
                  {payment.error instanceof Error
                    ? payment.error.message
                    : "결제에 실패했어요. 잠시 후 다시 시도해 주세요"}
                </p>
              )}

              <p className="text-xs leading-normal text-gray-400">
                발급 완료 후에는 환불되지 않습니다.
              </p>
            </>
          )
        ) : (
          // 발급 완료 — node 78:4533. 높이 600 고정, 본문(content-area)만 스크롤
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
              {issuance.isLoading ? (
                <p className="py-20 text-center text-sm text-gray-500">
                  확인서 정보를 불러오고 있어요
                </p>
              ) : issuance.isError || !issuance.data ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <p className="text-sm text-gray-700">
                    {issuance.error instanceof Error
                      ? issuance.error.message
                      : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
                  </p>
                  <Button
                    variant="outlined"
                    color="gray"
                    onClick={() => issuance.refetch()}
                  >
                    다시 시도
                  </Button>
                </div>
              ) : (
                <>
                  {/* 액션 — PDF 다운로드 · 인쇄 · 진위확인 링크 복사 (node 78:4535) */}
                  <div className="flex items-center gap-3">
                    <Button
                      className="rounded-lg px-6 py-3 text-sm"
                      onClick={() =>
                        handleDownloadPdf(issuance.data as IssuanceResult, showToast)
                      }
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
                      onClick={() =>
                        handleCopyLink(issuance.data as IssuanceResult, showToast)
                      }
                    >
                      진위확인 링크 복사
                    </Button>
                  </div>

                  {/* 안내 배너 — node 78:4542 */}
                  <div className="w-full rounded-lg border border-solid border-primary-100 bg-primary-50 px-5 py-3.5">
                    <ul className="ms-5 list-disc text-[13px] leading-normal text-primary-700">
                      <li>
                        확인서 하단 진위확인 ID로 제출처에서 유효성을 검증할 수
                        있습니다.
                      </li>
                      <li>
                        재다운로드는 일주일 이내에 발급·결제 내역에서 가능합니다.
                      </li>
                    </ul>
                  </div>

                  {/* 확인서 미리보기 — node 78:4544 */}
                  <CertificatePreview
                    imageUrl={issuance.data.previewImageUrl}
                    className="w-full flex-none"
                  />

                  {/* 발급 정보 카드 — node 78:4545 */}
                  <InfoCard result={issuance.data} />
                </>
              )}
            </div>

            {/* 확인 — node 78:4558. 스크롤 영역 밖에 고정된다 */}
            <Button
              color="black"
              fullWidth
              onClick={onClose}
              className="shrink-0 rounded-lg py-4 text-base font-bold"
            >
              확인
            </Button>

            {/* 인쇄 시에만 노출 — 확인서 단독 출력 */}
            {issuance.data && (
              <CertificatePrintSheet imageUrl={issuance.data.previewImageUrl} />
            )}
          </>
        )}
      </section>

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
    </div>
  );
}

/** 신청 내용 행 — 라벨(gray-500) / 값(gray-800), 하단 구분선 (node 78:3914) */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full items-center justify-between border-b border-solid border-gray-100 pb-3 text-sm leading-normal font-medium">
      <dt className="whitespace-nowrap text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}

/** 발급 정보 카드 — 확인서 번호 · 진위확인 ID · 발급일시 · 유효기간 (node 78:4545) */
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

/** PDF 다운로드 — 백엔드 pdfUrl이 없으면 인쇄 대화상자('PDF로 저장')로 대체 */
async function handleDownloadPdf(
  result: IssuanceResult,
  showToast: (message: string) => void,
): Promise<void> {
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
}

/** 진위확인 링크 복사 — ?id= 자동 입력되는 공개 진위확인 페이지로 연결 */
async function handleCopyLink(
  result: IssuanceResult,
  showToast: (message: string) => void,
): Promise<void> {
  const url = `${window.location.origin}/verification-no-auth?id=${encodeURIComponent(result.verificationId)}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast("링크가 복사됐어요");
  } catch {
    showToast("복사에 실패했어요. 잠시 후 다시 시도해 주세요");
  }
}
