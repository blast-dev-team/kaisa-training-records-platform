import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { XIcon } from "@/src/shared/icon";
import { Button, Checkbox, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { getIssuanceBundles, type IssuanceBundle } from "../../issuance-complete/api/get-issuance-result";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { generateCertificatePdf } from "../api/generate-certificate-pdf";
import { getCertificatePrice } from "../api/get-certificate-price";
import { getTrainingHistoryDetail, type TrainingHistoryDetail } from "../api/get-training-history-detail";
import { postIssuancePayment } from "../api/post-issuance-payment";
import {
  CertificateDocumentSheet,
  chunkRows,
  ROWS_PER_PAGE,
  toSheetRows,
  type CertificateSheetRow,
} from "./certificate-document-sheet";

export interface IssuePaymentModalProps {
  /** 발급 대상 교육이력 ID 목록 — 1건이면 단건과 동일, N건이면 일괄 결제 */
  recordIds: string[];
  /** original: 결제 후 발급 / reissue: 직전 발급 7일 이내면 무료, 초과면 유료 */
  issueType: "original" | "reissue";
  onClose: () => void;
  /** 발급 확정 시 — 페이지가 선택 상태를 비운다 */
  onIssued?: () => void;
}

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

  /** 확인서 문서 시트 — PDF 캡처 대상 */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

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

  /**
   * 발급 단가 — 회원등급이 가진 가격으로 서버가 정한다
   * (기본: 일반 3,000원 · 평생·연간 1,800원, 어드민 등급 화면에서 수정). 표기용이며
   * 최종 청구·무료 재발급 판정은 신청 시점에 서버가 한다.
   */
  const prices = useQuery({
    queryKey: ["certificate-price", issueType, ...recordIds],
    queryFn: () => Promise.all(recordIds.map((id) => getCertificatePrice(id, issueType))),
    enabled: details !== undefined,
  });

  // 발급 완료 결과 — 묶음 확인서(한 발급 이벤트 = 확인서 1건). 결제·무료 재발급으로
  // 발급이 확정된 뒤 조회한다
  const issuance = useQuery({
    queryKey: ["issuance-complete", ...recordIds],
    queryFn: () => getIssuanceBundles(recordIds),
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

  /** 건별 단가 — 서버 규칙값. 아직 로드 전이면 undefined */
  const priceById = new Map(
    (prices.data ?? []).map((price) => [price.training_record_id, price.price_krw]),
  );

  // 표기 금액 = 유료 건 단가 1회 — 단 건·일괄 동일 요금 정책. 서버 주문도 최고 단가 1회로
  // 생성하므로(sum이 아님) 화면과 실제 청구가 같다. 최종 판정은 신청 시점에 서버가 한다
  const totalAmount = paidIds.reduce(
    (max, id) => Math.max(max, priceById.get(id) ?? 0),
    0,
  );

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

  /**
   * PDF 다운로드 — 화면 밖에 렌더해 둔 확인서 문서 페이지들을 캡처해
   * A4 PDF 한 파일로 저장한다. 선택한 교육 건들이 하나의 문서(묶음 확인서)로
   * 합쳐진다 — 5건까지 1페이지, 넘으면 페이지가 이어진다.
   */
  const handleDownloadPdf = async () => {
    const container = sheetRef.current;
    if (!container) return;
    setIsPdfGenerating(true);
    try {
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>("[data-sheet-page]"),
      );
      if (elements.length === 0) return;
      await generateCertificatePdf(elements, "교육이력확인서.pdf");
      showToast("다운로드했어요");
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

  // 결제 진행 중에는 닫지 못하게 한다
  const canClose = !(phase === "payment" && payment.isPending);

  /** 미리보기 축소율 — 모달 폭에 맞춰 A4 시트(794px)를 등비 축소한다 */
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.987);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const update = () => setPreviewScale(el.clientWidth / 794);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && canClose) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canClose, onClose]);

  // 모달 뒤 본문 스크롤 잠금 — 모달 안 제스처로 배경 페이지가 굴러가지 않게 한다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /** 칩이 가리키는 건 — 목록이 바뀌면 범위를 벗어나지 않게 */
  const activeDetail = details?.[Math.min(activeIndex, details.length - 1)];

  /** 발급 완료 — 칩은 묶음(확인서 1건)을 가리킨다. 보통 묶음은 1개다 */
  const activeBundle = issuance.data?.[
    Math.min(activeIndex, issuance.data.length - 1)
  ];

  /** 묶음에 포함된 이력 — 사용자가 선택한 순서 유지 */
  const bundleDetails = useMemo(() => {
    if (activeBundle === undefined || details === undefined) return [];
    const byId = new Map(details.map((detail) => [detail.id, detail]));
    return activeBundle.recordIds
      .map((id) => byId.get(id))
      .filter((detail): detail is TrainingHistoryDetail => detail !== undefined);
  }, [activeBundle, details]);

  /** 묶음 문서 페이지 — 5행/페이지, 넘는 건 다음 페이지(연번 이어짐)로 */
  const sheetPages = useMemo(
    () => chunkRows(toSheetRows(bundleDetails)),
    [bundleDetails],
  );
  /** 문서 머리 표기(서식·문서번호·감리원) — 첫 이력 값 */
  const bundleHeadDetail = bundleDetails[0];

  /** 확인서 성명 — 표시명의 " 님" 접미를 뗀 값 */
  const memberName = useAuthStore((state) => state.userName).replace(/\s*님$/, "");

  /** 무료 재발급 기한 (발급일 + 7일, 서버 산출) — 기한 지난 건은 값이 없다 */
  const freeReissueUntilLabel = activeDetail?.reissueFreeUntil
    ? `${formatDotDate(activeDetail.reissueFreeUntil)}까지`
    : undefined;

  const pricesLoaded = prices.isSuccess;
  const feeLabel = pricesLoaded ? totalAmount.toLocaleString("ko-KR") : "—";
  /** 선택 건 단가 — 한 회원은 등급이 하나라 전 건 단가 동일 */
  const unitFeeLabel = pricesLoaded
    ? (activeDetail ? priceById.get(activeDetail.id) ?? 0 : 0).toLocaleString("ko-KR")
    : "—";
  const canPay = agreed && !payment.isPending && totalAmount > 0 && pricesLoaded;

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
          "relative flex max-h-[calc(100dvh-40px)] max-w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg bg-white p-7 font-sans shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] mobile:p-4",
          phase === "payment"
            ? "w-[500px] mobile:w-full"
            : "h-[600px] w-[840px] mobile:h-[calc(100dvh-40px)] mobile:w-full",
        )}
      >
        {/* 모바일 — 전체화면형 모달이라 X 로 닫는다. 결제 진행 중엔 닫을 수 없다 */}
        {canClose && (
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 hidden size-8 cursor-pointer items-center justify-center text-gray-500 mobile:flex"
          >
            <XIcon className="size-6" />
          </button>
        )}
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
              <h2 className="text-lg leading-normal font-bold text-gray-900 mobile:text-base">
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
                      "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap mobile:text-xs",
                      index === activeIndex
                        ? "bg-primary-700 text-white"
                        : "bg-gray-100 text-gray-800",
                    )}
                  >
                    {detail.courseName}
                  </button>
                ))}
              </div>

              {/* 선택 건 상세 — node 78:3912 / 모바일 131:8892 */}
              {activeDetail && (
                <div className="flex w-full flex-col gap-4 rounded-lg border border-solid border-gray-200 p-5 mobile:p-3">
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
              <h2 className="text-lg leading-normal font-bold text-gray-900 mobile:text-base">
                결제
              </h2>

              <div className="flex w-full items-start justify-between text-sm leading-normal mobile:text-xs">
                <p className="text-gray-600">
                  확인서 {paidIds.length}건 ({unitFeeLabel}원)
                </p>
                <p className="text-gray-700">{feeLabel}원</p>
              </div>

              {freeReissueCount > 0 && (
                <div className="flex w-full items-start justify-between text-sm leading-normal mobile:text-xs">
                  <p className="text-gray-600">무료 재발급 {freeReissueCount}건</p>
                  <p className="text-gray-700">0원</p>
                </div>
              )}

              <div className="flex w-full items-start justify-between text-base leading-normal font-bold text-gray-900 mobile:text-sm">
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
                className="rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800 mobile:py-3 mobile:text-sm"
              >
                <span className="flex items-center gap-2">
                  <span>{feeLabel}원</span>
                  <span>{payment.isPending ? "결제 중..." : "결제하기"}</span>
                </span>
              </Button>

              {prices.isError && (
                <p className="text-xs leading-normal text-red-500" role="alert">
                  가격 정보를 불러오지 못했어요. 모달을 닫고 다시 열어 주세요
                </p>
              )}

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
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
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
                  {/* 묶음이 여러 개일 때만 칩 노출 — 한 묶음이면 선택할 필요 없다 */}
                  {issuance.data.length > 1 && (
                    <div className="flex flex-wrap items-start gap-2">
                      {issuance.data.map((bundle, index) => (
                        <button
                          key={bundle.verificationId}
                          type="button"
                          aria-pressed={index === activeIndex}
                          onClick={() => setActiveIndex(index)}
                          className={cn(
                            "cursor-pointer rounded-md px-3 py-1.5 font-sans text-[13px] font-medium leading-normal whitespace-nowrap mobile:text-xs",
                            index === activeIndex
                              ? "bg-primary-700 text-white"
                              : "bg-gray-100 text-gray-800",
                          )}
                        >
                          {bundleChipLabel(bundle, details)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 액션 — 묶음 확인서 PDF 다운로드 · 인쇄 · 진위확인 링크 복사 (node 78:4510 / 모바일 131:9652) */}
                  {activeBundle && (
                    <div className="flex flex-wrap items-center gap-3 mobile:gap-2">
                      <Button
                        className="rounded-lg px-6 py-3 text-sm mobile:rounded-lg mobile:px-4 mobile:py-2"
                        disabled={isPdfGenerating}
                        onClick={() => void handleDownloadPdf()}
                      >
                        {isPdfGenerating ? "생성 중..." : "PDF 다운로드"}
                      </Button>
                      <Button
                        variant="outlined"
                        color="gray"
                        className="rounded-lg px-6 py-3 text-sm font-medium text-gray-700 mobile:rounded-lg mobile:px-4 mobile:py-2"
                        onClick={() => window.print()}
                      >
                        인쇄
                      </Button>
                      <Button
                        variant="outlined"
                        color="gray"
                        className="rounded-lg px-6 py-3 text-sm font-medium text-gray-700 mobile:rounded-lg mobile:px-4 mobile:py-2"
                        onClick={() => handleCopyLink(activeBundle, showToast)}
                      >
                        진위확인 링크 복사
                      </Button>
                    </div>
                  )}

                  {/* 안내 배너 — node 78:4517 */}
                  <NoticeBanner />

                  {/* 확인서 미리보기 — 선택한 이력 전체가 한 문서(묶음)로 보인다 (node 78:4508).
                      미리보기·인쇄·PDF 가 같은 문서라 화면과 다운로드 결과가 달라지지 않는다 */}
                  {activeBundle && bundleDetails.length > 0 && (
                    <div
                      ref={previewRef}
                      className="w-full flex-none pointer-events-none"
                    >
                      {sheetPages.map((pageRows, pageIndex) => (
                        <div
                          key={pageIndex}
                          className="overflow-hidden"
                          style={{ aspectRatio: "794 / 1123" }}
                        >
                          {/* 모달 본문 폭에 맞춘 등비 축소 — 시트 원본은 A4 794px */}
                          <div
                            style={{
                              width: 794,
                              transform: `scale(${previewScale})`,
                              transformOrigin: "top left",
                            }}
                          >
                            <BundleSheet
                              pageRows={pageRows}
                              pageIndex={pageIndex}
                              bundle={activeBundle}
                              headDetail={bundleHeadDetail}
                              memberName={memberName}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 발급 정보 카드 — 묶음 확인서 (node 78:4519) */}
                  {activeBundle && (
                    <InfoCard
                      result={activeBundle}
                      reissueFreeUntilLabel={freeReissueUntilLabel}
                    />
                  )}
                </>
              )}
            </div>

            {/* 확인 — node 78:4503. 스크롤 영역 밖에 고정된다 */}
            <Button
              color="black"
              fullWidth
              onClick={onClose}
              className="shrink-0 rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800 mobile:py-3 mobile:text-sm"
            >
              확인
            </Button>

            {/* 인쇄 시에만 노출 — 묶음 확인서 문서 전체를 출력 */}
            {activeBundle && bundleHeadDetail && (
              <div className="fixed inset-0 z-[999] hidden overflow-auto bg-white print:block">
                <div className="mx-auto w-fit bg-white">
                  {sheetPages.map((pageRows, pageIndex) => (
                    <BundleSheet
                      key={pageIndex}
                      pageRows={pageRows}
                      pageIndex={pageIndex}
                      bundle={activeBundle}
                      headDetail={bundleHeadDetail}
                      memberName={memberName}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 화면 밖 렌더 — PDF 캡처 대상 (인쇄 흐름과 분리). 페이지 전체를 담는다 */}
            {activeBundle && bundleHeadDetail && (
              <div
                aria-hidden
                className="fixed left-[-10000px] top-0 print:hidden"
              >
                <div ref={sheetRef}>
                  {sheetPages.map((pageRows, pageIndex) => (
                    <div key={pageIndex} data-sheet-page>
                      <BundleSheet
                        pageRows={pageRows}
                        pageIndex={pageIndex}
                        bundle={activeBundle}
                        headDetail={bundleHeadDetail}
                        memberName={memberName}
                      />
                    </div>
                  ))}
                </div>
              </div>
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

/** 발급 정보 카드 — 확인서 번호 · 진위확인 ID · 발급일시 · 유효기간 · 무료 재발급 기한 (node 78:4519) */
function InfoCard({
  result,
  reissueFreeUntilLabel,
}: {
  result: IssuanceBundle;
  reissueFreeUntilLabel?: string;
}) {
  const rows: Array<[label: string, value: string]> = [
    ["확인서 번호", result.certificateNumber],
    ["진위확인 ID", result.verificationId],
    ["발급일시", result.issuedAtLabel],
    ["유효기간", result.validityLabel],
  ];
  if (reissueFreeUntilLabel) {
    rows.push(["무료 재발급 기한", reissueFreeUntilLabel]);
  }

  return (
    <dl className="w-full rounded-lg border border-solid border-gray-200 bg-white px-7 py-6 mobile:px-3 mobile:py-2">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between border-b border-solid border-gray-100 py-3.5 mobile:py-2"
        >
          <dt className="text-sm leading-normal font-medium whitespace-nowrap text-gray-500 mobile:text-xs">
            {label}
          </dt>
          <dd className="text-sm leading-normal font-medium whitespace-nowrap text-gray-800 mobile:text-xs">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 안내 배너 — node 78:4517 / 모바일 131:9659 */
function NoticeBanner() {
  return (
    <div className="w-full rounded-lg border border-solid border-primary-100 bg-primary-50 px-5 py-3.5 mobile:p-3">
      <ul className="ms-5 list-disc text-[13px] leading-normal text-primary-700 mobile:text-xs">
        <li>확인서 하단 진위확인 ID로 제출처에서 유효성을 검증할 수 있습니다.</li>
        <li>재다운로드는 일주일 이내에 발급·결제 내역에서 가능합니다.</li>
      </ul>
    </div>
  );
}

/** 발급일시(ISO) → 확인서 발급일 표기 (예: 2026년 7월 23일) */
function formatKoreanDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** ISO → "YYYY.MM.DD" — InfoCard 표기와 같은 형식 (로컬 KST 기준) */
function formatDotDate(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/**
 * 묶음 확인서 1페이지 — 미리보기·인쇄·PDF 캡처 공용.
 * 문서 머리(서식·문서번호·감리원)는 첫 이력 값, 확인서 번호는 묶음 번호 하나.
 */
function BundleSheet({
  pageRows,
  pageIndex,
  bundle,
  headDetail,
  memberName,
}: {
  pageRows: CertificateSheetRow[];
  pageIndex: number;
  bundle: IssuanceBundle;
  headDetail?: TrainingHistoryDetail;
  memberName: string;
}) {
  return (
    <CertificateDocumentSheet
      rows={pageRows}
      memberName={memberName}
      supervisorGrade={headDetail?.supervisorGrade}
      supervisorCertNo={headDetail?.supervisorCertNo}
      formNo={headDetail?.formNo}
      docNo={headDetail?.docNo}
      startNo={pageIndex * ROWS_PER_PAGE + 1}
      issuedOnLabel={formatKoreanDate(bundle.issuedAt)}
      certificateNumber={bundle.certificateNumber}
    />
  );
}

/** 묶음 칩 표기 — 대표 교육명 + 나머지 건수 (결제내역 화면과 같은 형식) */
function bundleChipLabel(
  bundle: IssuanceBundle,
  details: TrainingHistoryDetail[] | undefined,
): string {
  if (!details) return "확인서";
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  const names = bundle.recordIds
    .map((id) => byId.get(id)?.courseName)
    .filter((name): name is string => name !== undefined);
  const headName = names[0];
  if (headName === undefined) return "확인서";
  return names.length > 1
    ? `${headName} 외 ${names.length - 1}건`
    : headName;
}

/** 진위확인 링크 복사 — ?id= 자동 입력되는 공개 진위확인 페이지로 연결 */
async function handleCopyLink(
  result: IssuanceBundle,
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
