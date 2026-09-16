import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Checkbox, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { getIssuanceResult, type IssuanceResult } from "../../issuance-complete/api/get-issuance-result";
import {
  CertificatePreview,
  CertificatePrintSheet,
} from "../../issuance-complete/ui/certificate-preview";
import { downloadTrainingRecordPdf } from "../api/get-training-record-download";
import { getTrainingHistoryDetail, type TrainingHistoryDetail } from "../api/get-training-history-detail";
import { postIssuancePayment } from "../api/post-issuance-payment";

export interface IssuePaymentModalProps {
  /** 발급 대상 교육이력 ID 목록 — 1건이면 단건과 동일, N건이면 일괄 결제 */
  recordIds: string[];
  /** original: 결제 후 발급 / reissue: 직전 발급 7일 이내면 무료, 초과면 유료 */
  issueType: "original" | "reissue";
  onClose: () => void;
  /** 발급 확정 시 — 페이지가 선택 상태를 비운다 */
  onIssued?: () => void;
}

/** 확인서 발급 수수료 — Figma node 38:2327 (표기용 선견적 — 최종 금액은 서버가 판정) */
const ISSUANCE_FEE = 3000;

const TOAST_DURATION_MS = 3000;

/** 모달 단계 — 결제 → 발급 완료 */
type ModalPhase = "payment" | "issued";

/** 무료 재발급 기한이 남아 있는지 — 서버가 산출한 기한(reissueFreeUntil) 기준 */
function isFreeReissue(detail: TrainingHistoryDetail): boolean {
  if (detail.reissueFreeUntil === undefined) return false;
  return new Date(detail.reissueFreeUntil).getTime() > Date.now();
}

/**
 * 확인서 발급 결제·발급 완료 모달 — Figma node 78:3911(결제) · 78:4475(발급 완료) 기반.
 *
 * 상단 칩으로 발급 건을 선택하면 아래에 그 건의 내용이 표시된다 (node 99:5315).
 * 결제는 유료 건만 합산해 한 번에 진행하고, 7일 이내 재발급은 무료다.
 * 결제 성공(또는 무료 건) 시 같은 자리에서 발급 완료 화면으로 전환한다.
 */
export function IssuePaymentModal({ recordIds, issueType, onClose, onIssued }: IssuePaymentModalProps) {
  // 재발급 전체가 무료면 결제 단계를 건너뛴다 — 상세 로드 후 서버에 신청
  const [phase, setPhase] = useState<ModalPhase>("payment");
  const [agreed, setAgreed] = useState(false);
  /** 칩 선택 — 신청 내용·발급 완료 화면에서 어느 건을 보여줄지 */
  const [activeIndex, setActiveIndex] = useState(0);
  // 페이드아웃 진행 여부를 함께 들고 있다가 애니메이션 후 언마운트한다
  const [toast, setToast] = useState<{ message: string; isClosing: boolean } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);

  const queryClient = useQueryClient();

  const {
    data: details,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["training-history", "details", ...recordIds],
    queryFn: () => Promise.all(recordIds.map((id) => getTrainingHistoryDetail(id))),
  });

  // 발급 완료 결과 — 결제·무료 재발급으로 발급이 확정된 뒤 조회한다
  const issuance = useQuery({
    queryKey: ["issuance-complete", ...recordIds],
    queryFn: () => Promise.all(recordIds.map((id) => getIssuanceResult(id))),
    enabled: phase === "issued",
  });

  /** 유료 결제 대상 — 신규 발급 전체 + 7일 초과 재발급 (표기용 — 실제 판정은 서버) */
  const paidIds =
    details === undefined
      ? []
      : issueType === "original"
        ? recordIds
        : recordIds.filter(
            (id) =>
              !details.some(
                (detail) => detail.id === id && isFreeReissue(detail),
              ),
          );
  /** 무료 재발급 건수 — 결제 금액에서 제외 */
  const freeReissueCount =
    issueType === "reissue" ? recordIds.length - paidIds.length : 0;

  // 발급 비용은 단 건·일괄 건 동일 — 유료 건이 하나라도 있으면 3,000원 (node 99:5096)
  const totalAmount = paidIds.length > 0 ? ISSUANCE_FEE : 0;

  const payment = useMutation({
    mutationFn: () =>
      postIssuancePayment({
        items: recordIds.map((id) => ({ recordId: id, issueType })),
      }),
    onSuccess: () => {
      // 발급 가능 상태로 목록을 갱신하고 같은 모달에서 완료 화면으로
      queryClient.invalidateQueries({ queryKey: ["training-history", "list"] });
      setPhase("issued");
      onIssued?.();
    },
  });

  // 재발급 전체가 무료면 결제 없이 서버 신청으로 바로 발급 — 상세 로드 직후 1회 판정
  useEffect(() => {
    if (
      issueType === "reissue" &&
      details !== undefined &&
      paidIds.length === 0 &&
      phase === "payment" &&
      !payment.isPending &&
      !payment.isError
    ) {
      payment.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueType, details, paidIds.length, phase, payment.isPending, payment.isError]);

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

  /** 칩이 가리키는 건 — 목록이 바뀌면 범위를 벗어나지 않게 */
  const activeDetail = details?.[Math.min(activeIndex, details.length - 1)];
  const activeResult = issuance.data?.[
    Math.min(activeIndex, issuance.data.length - 1)
  ];

  const feeLabel = totalAmount.toLocaleString("ko-KR");
  const unitFeeLabel = ISSUANCE_FEE.toLocaleString("ko-KR");
  const canPay = agreed && !payment.isPending && totalAmount > 0;

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
          ) : isError || !details ? (
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
              {/* 신청 내용 — node 78:3911. 칩으로 발급 건을 선택해 내용을 확인한다 */}
              <h2 className="text-lg leading-normal font-bold text-gray-900">
                신청 내용
              </h2>

              <div className="flex flex-wrap items-start gap-2">
                {details.map((detail, index) => (
                  <button
                    key={detail.id}
                    type="button"
                    aria-pressed={index === activeIndex}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap",
                      index === activeIndex
                        ? "bg-primary-700 text-white"
                        : "bg-gray-100 text-gray-800",
                    )}
                  >
                    {detail.courseName}
                  </button>
                ))}
              </div>

              {/* 선택 건 상세 — node 78:3912 */}
              {activeDetail && (
                <div className="flex w-full flex-col gap-4 rounded-lg border border-solid border-gray-200 p-5">
                  <dl className="flex w-full flex-col gap-4">
                    <DetailRow label="교육명" value={activeDetail.courseName} />
                    <DetailRow
                      label="교육일자"
                      value={activeDetail.trainedOn.replaceAll("-", ".")}
                    />
                    <DetailRow label="이수시간" value={`${activeDetail.hours}시간`} />
                    <DetailRow label="신청인" value={activeDetail.applicantLabel} />
                  </dl>
                </div>
              )}

              {/* 결제 — node 78:3929~. 유료 건만 합산, 무료 재발급은 0원 표기 */}
              <h2 className="text-lg leading-normal font-bold text-gray-900">
                결제
              </h2>

              <div className="flex w-full items-start justify-between text-sm leading-normal">
                <p className="text-gray-600">
                  확인서 {paidIds.length}건 ({unitFeeLabel}원)
                </p>
                <p className="text-gray-700">{feeLabel}원</p>
              </div>

              {freeReissueCount > 0 && (
                <div className="flex w-full items-start justify-between text-sm leading-normal">
                  <p className="text-gray-600">무료 재발급 {freeReissueCount}건</p>
                  <p className="text-gray-700">0원</p>
                </div>
              )}

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
                className="rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800"
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
          // 발급 완료 — node 78:4475. 높이 600 고정, 본문(content-area)만 스크롤
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
                  {/* 발급 건 칩 — 선택한 건의 확인서를 보여준다 */}
                  <div className="flex flex-wrap items-start gap-2">
                    {issuance.data.map((result, index) => (
                      <button
                        key={result.verificationId}
                        type="button"
                        aria-pressed={index === activeIndex}
                        onClick={() => setActiveIndex(index)}
                        className={cn(
                          "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap",
                          index === activeIndex
                            ? "bg-primary-700 text-white"
                            : "bg-gray-100 text-gray-800",
                        )}
                      >
                        {details?.[index]?.courseName ?? `확인서 ${index + 1}`}
                      </button>
                    ))}
                  </div>

                  {/* 액션 — 선택 건 PDF 다운로드 · 인쇄 · 진위확인 링크 복사 (node 78:4510) */}
                  {activeResult && (
                    <div className="flex items-center gap-3">
                      <Button
                        className="rounded-lg px-6 py-3 text-sm"
                        onClick={() =>
                          handleDownloadPdf(
                            recordIds[
                              Math.min(activeIndex, recordIds.length - 1)
                            ] ?? "",
                            showToast,
                          )
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
                        onClick={() => handleCopyLink(activeResult, showToast)}
                      >
                        진위확인 링크 복사
                      </Button>
                    </div>
                  )}

                  {/* 안내 배너 — node 78:4517 */}
                  <NoticeBanner />

                  {/* 확인서 미리보기 — 선택 건 (node 78:4508) */}
                  {activeResult && (
                    <CertificatePreview
                      imageUrl={activeResult.previewImageUrl}
                      className="w-full flex-none"
                    />
                  )}

                  {/* 발급 정보 카드 — 선택 건 (node 78:4519) */}
                  {activeResult && <InfoCard result={activeResult} />}
                </>
              )}
            </div>

            {/* 확인 — node 78:4503. 스크롤 영역 밖에 고정된다 */}
            <Button
              color="black"
              fullWidth
              onClick={onClose}
              className="shrink-0 rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800"
            >
              확인
            </Button>

            {/* 인쇄 시에만 노출 — 선택 건 확인서 단독 출력 */}
            {activeResult && (
              <CertificatePrintSheet imageUrl={activeResult.previewImageUrl} />
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

/** 발급 정보 카드 — 확인서 번호 · 진위확인 ID · 발급일시 · 유효기간 (node 78:4519) */
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

/** 안내 배너 — node 78:4517 */
function NoticeBanner() {
  return (
    <div className="w-full rounded-lg border border-solid border-primary-100 bg-primary-50 px-5 py-3.5">
      <ul className="ms-5 list-disc text-[13px] leading-normal text-primary-700">
        <li>확인서 하단 진위확인 ID로 제출처에서 유효성을 검증할 수 있습니다.</li>
        <li>재다운로드는 일주일 이내에 발급·결제 내역에서 가능합니다.</li>
      </ul>
    </div>
  );
}

/**
 * PDF 다운로드 — 실제 발급 PDF 연동 전까지 S3 데모 PDF로 통일해 내려준다
 * (USE_MOCK 예외 — 백엔드에서 presigned URL을 발급한다).
 */
async function handleDownloadPdf(
  recordId: string,
  showToast: (message: string) => void,
): Promise<void> {
  try {
    await downloadTrainingRecordPdf(recordId, "교육이력확인서.pdf");
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
