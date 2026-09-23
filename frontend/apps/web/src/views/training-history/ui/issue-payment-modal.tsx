import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CaretDownIcon, CaretUpIcon, XIcon } from "@/src/shared/icon";
import { Button, Checkbox, Toast } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { getIssuanceBundles } from "../../issuance-complete/api/get-issuance-result";
import { useAuthStore } from "@/src/shared/store/auth-store";
import { generateCertificatePdf } from "../api/generate-certificate-pdf";
import { getCertificatePrice } from "../api/get-certificate-price";
import { getTrainingHistoryDetail, type TrainingHistoryDetail } from "../api/get-training-history-detail";
import { postIssuancePayment } from "../api/post-issuance-payment";
import {
  CertificateDocumentSheet,
  paginateRows,
  toSheetRows,
  type CertificateSheetPage,
} from "./certificate-document-sheet";

export interface IssuePaymentModalProps {
  /** 발급 대상 교육이력 ID 목록 — 1건이면 단건과 동일, N건이면 일괄 결제 */
  recordIds: string[];
  /** original: 결제 후 발급 / reissue: 직전 발급 7일 이내면 무료, 초과면 유료 */
  issueType: "original" | "reissue";
  onClose: () => void;
  /** 발급 확정 시 — 페이지가 선택 상태를 비운다 */
  onIssued?: () => void;
  /** 슈퍼 계정 — 결제·발급 없이 미리보기만 제공한다 */
  previewOnly?: boolean;
}

const TOAST_DURATION_MS = 3000;

/** 모달 단계 — 발급될 PDF 미리보기·결제 → 신청 내용(발급 완료) */
type ModalPhase = "preview" | "issued";

/** 무료 재발급 기한이 남아 있는지 — 서버가 산출한 기한(reissueFreeUntil) 기준 */
function isFreeReissue(detail: TrainingHistoryDetail): boolean {
  if (detail.reissueFreeUntil === undefined) return false;
  return new Date(detail.reissueFreeUntil).getTime() > Date.now();
}

/** 32 → "32", 8.5 → "8.5" — 합계 시간의 소수점 꼬리 정리 */
function formatHours(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * 확인서 발급 미리보기·결제 모달.
 *
 * 발급 버튼을 누르면 먼저 발급될 확인서 PDF 미리보기를 보여 주고, 결제하기를
 * 눌러야 포트원 결제창이 열린다. 결제(또는 무료 재발급)가 끝나면 같은 자리에서
 * 신청 내용 요약으로 전환되고, 하단 PDF 다운로드로 확인서를 내려받는다.
 */
export function IssuePaymentModal({
  recordIds,
  issueType,
  onClose,
  onIssued,
  previewOnly = false,
}: IssuePaymentModalProps) {
  const [phase, setPhase] = useState<ModalPhase>("preview");
  const [agreed, setAgreed] = useState(false);
  /** 신청 문서 상세(교육명 목록) 펼침 여부 — 신청 내용 화면에서만 쓴다 */
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // 페이드아웃 진행 여부를 함께 들고 있다가 애니메이션 후 언마운트한다
  const [toast, setToast] = useState<{ message: string; isClosing: boolean } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);

  /** 확인서 문서 시트 — 발급 완료 후 PDF 캡처 대상 (화면 밖 렌더) */
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
  // 발급이 확정된 뒤 조회한다. PDF 다운로드에 실제 확인서 번호·발급일이 들어간다
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
      // 발급 가능 상태로 목록을 갱신하고 같은 모달에서 신청 내용으로 전환한다
      queryClient.invalidateQueries({ queryKey: ["training-history", "list"] });
      setPhase("issued");
      onIssued?.();
    },
  });

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
  const canClose = !(phase === "preview" && payment.isPending);

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

  /** 미리보기 문서 페이지 — 선택한 이력 전체가 한 문서로 합쳐진다 (연속 문서 분할) */
  const previewPages = useMemo(
    () => paginateRows(toSheetRows(details ?? [])),
    [details],
  );
  /** 문서 머리 표기(서식·문서번호·감리원) — 첫 이력 값 */
  const headDetail = details?.[0];

  /** 발급 완료 묶음별 문서 페이지 — PDF 다운로드 캡처 대상. 보통 묶음은 1개다 */
  const issuedSheets = useMemo(() => {
    if (issuance.data === undefined || details === undefined) return [];
    const byId = new Map(details.map((detail) => [detail.id, detail]));
    return issuance.data.map((bundle) => {
      const bundleDetails = bundle.recordIds
        .map((id) => byId.get(id))
        .filter((detail): detail is TrainingHistoryDetail => detail !== undefined);
      return {
        bundle,
        pages: paginateRows(toSheetRows(bundleDetails)),
        head: bundleDetails[0],
        totalHours: bundleDetails.reduce((sum, detail) => sum + detail.hours, 0),
      };
    });
  }, [issuance.data, details]);

  /** 확인서 성명 — 슈퍼 계정은 이력 소유 교육생명, 일반 회원은 로그인명 */
  const storeName = useAuthStore((state) => state.userName).replace(/\s*님$/, "");
  const memberName = previewOnly
    ? details?.[0]?.traineeName ?? storeName
    : storeName;

  /** 발급 대상 총 이수시간 — 신청 내용 요약 표기 */
  const totalHours = (details ?? []).reduce((sum, detail) => sum + detail.hours, 0);

  const pricesLoaded = prices.isSuccess;
  const feeLabel = pricesLoaded ? totalAmount.toLocaleString("ko-KR") : "—";
  /** 선택 건 단가 — 한 회원은 등급이 하나라 전 건 단가 동일 */
  const unitFeeLabel = pricesLoaded
    ? (headDetail ? priceById.get(headDetail.id) ?? 0 : 0).toLocaleString("ko-KR")
    : "—";
  /** 전 건 무료 재발급 — 결제창 없이 서버 신청만으로 발급된다 */
  const isFree = paidIds.length === 0;
  const canPay = agreed && !payment.isPending && pricesLoaded && (totalAmount > 0 || isFree);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
      onClick={() => canClose && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={phase === "preview" ? "확인서 발급 미리보기" : "신청 내용"}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "relative flex max-h-[calc(100dvh-40px)] max-w-full flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg bg-white p-7 font-sans shadow-[0px_4px_24px_0px_rgba(0,0,0,0.15)] mobile:p-4",
          phase === "preview"
            ? "h-[720px] w-[840px] mobile:h-[calc(100dvh-40px)] mobile:w-full"
            : "w-[500px] mobile:w-full",
        )}
      >
        {/* X 로 닫는다. 결제 진행 중엔 닫을 수 없다 */}
        {canClose && (
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex size-8 cursor-pointer items-center justify-center text-gray-500"
          >
            <XIcon className="size-6" />
          </button>
        )}
        {phase === "preview" ? (
          isLoading ? (
            <p className="py-20 text-center text-sm text-gray-500">
              미리보기를 불러오고 있어요
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
              {/* 발급될 확인서 미리보기 — 결제 전이라 확인서 번호·발급일은 비어 있다 */}
              <h2 className="text-lg leading-normal font-bold text-gray-900 mobile:text-base">
                발급 미리보기
              </h2>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                <div
                  ref={previewRef}
                  className="w-full flex-none pointer-events-none"
                >
                  {previewPages.map((page, pageIndex) => (
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
                        <PreviewSheet
                          page={page}
                          headDetail={headDetail}
                          memberName={memberName}
                          totalHours={totalHours}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 슈퍼 계정 — 결제 단계 없음. 미리보기 안내만 */}
              {previewOnly ? (
                <p className="shrink-0 rounded-md bg-gray-100 px-4 py-3 text-[13px] leading-normal text-gray-500">
                  슈퍼 계정 미리보기예요. 발급·결제는 일반 회원 로그인에서만 가능해요.
                </p>
              ) : (
              <div className="flex shrink-0 flex-col gap-3">
                {paidIds.length > 0 && (
                  <div className="flex w-full items-start justify-between text-sm leading-normal mobile:text-xs">
                    <p className="text-gray-600">
                      확인서 {paidIds.length}건 ({unitFeeLabel}원)
                    </p>
                    <p className="text-gray-700">{feeLabel}원</p>
                  </div>
                )}

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
                    <span>
                      {payment.isPending
                        ? "결제 중..."
                        : isFree
                          ? "발급하기"
                          : "결제하기"}
                    </span>
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
              </div>
              )}
            </>
          )
        ) : (
          <>
            {/* 신청 내용 — 발급 완료 요약. 확인서 번호·진위확인 정보는 발급·결제 내역 화면에서 본다 */}
            <h2 className="text-lg leading-normal font-bold text-gray-900 mobile:text-base">
              신청 내용
            </h2>

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
              <dl className="flex w-full flex-col gap-4 rounded-lg border border-solid border-gray-200 p-5 mobile:p-3">
                <div className="flex flex-col gap-3">
                  <DetailRow label="신청 문서" value="계속교육내역확인서" />
                  {/* 상세보기 — 신청한 교육 건들을 나열한다. 접으면 한 줄 토글만 남는다 */}
                  <button
                    type="button"
                    aria-expanded={isDetailOpen}
                    onClick={() => setIsDetailOpen((open) => !open)}
                    className="flex cursor-pointer items-center gap-1 self-start font-sans text-xs leading-normal font-medium text-gray-500 hover:text-gray-700"
                  >
                    상세보기
                    {isDetailOpen ? (
                      <CaretUpIcon className="size-3" />
                    ) : (
                      <CaretDownIcon className="size-3" />
                    )}
                  </button>
                  {isDetailOpen && (
                    <ul className="flex flex-col gap-1.5 pb-1">
                      {(details ?? []).map((detail) => (
                        <li
                          key={detail.id}
                          className="font-sans text-xs leading-normal text-gray-600"
                        >
                          {detail.courseName}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <DetailRow label="총시간" value={`${formatHours(totalHours)}시간`} />
                <DetailRow label="총건수" value={`${details?.length ?? recordIds.length}건`} />
              </dl>
            )}

            {/* PDF 다운로드 — 발급된 묶음 확인서를 내려받는다 */}
            <Button
              color="black"
              fullWidth
              disabled={isPdfGenerating || issuedSheets.length === 0}
              onClick={() => void handleDownloadPdf()}
              className="mt-auto shrink-0 rounded-lg bg-gray-900 py-4 text-base font-bold hover:bg-gray-800 mobile:py-3 mobile:text-sm"
            >
              {isPdfGenerating ? "생성 중..." : "PDF 다운로드"}
            </Button>

            {/* 화면 밖 렌더 — PDF 캡처 대상. 묶음별 문서 페이지를 모두 담는다 */}
            {issuedSheets.length > 0 && (
              <div
                aria-hidden
                className="fixed left-[-10000px] top-0"
              >
                <div ref={sheetRef}>
                  {issuedSheets.map(({ bundle, pages, head, totalHours }) =>
                    pages.map((page, pageIndex) => (
                      <div
                        key={`${bundle.verificationId}-${pageIndex}`}
                        data-sheet-page
                      >
                        <CertificateDocumentSheet
                          rows={page.rows}
                          showHead={page.showHead}
                          showClosing={page.showClosing}
                          startNo={page.startNo}
                          totalHours={totalHours}
                          memberName={memberName}
                          supervisorGrade={head?.supervisorGrade}
                          supervisorCertNo={head?.supervisorCertNo}
                          formNo="제31호"
                          docNo={bundle.docNo ?? undefined}
                          issuedOnLabel={formatKoreanDate(bundle.issuedAt)}
                          certificateNumber={page.showClosing ? bundle.certificateNumber : undefined}
                        />
                      </div>
                    )),
                  )}
                </div>
              </div>
            )}
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

/** 신청 내용 행 — 라벨(gray-500) / 값(gray-800), 하단 구분선 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full items-center justify-between border-b border-solid border-gray-100 pb-3 text-sm leading-normal font-medium">
      <dt className="whitespace-nowrap text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </div>
  );
}

/** 발급일시(ISO) → 확인서 발급일 표기 (예: 2026년 7월 23일) */
function formatKoreanDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 미리보기 문서 — 결제 전이라 발급일·확인서 번호는 비워 둔다.
 * 실제 발급분과 같은 서식이라 내려받은 PDF와 모양이 같다.
 */
function PreviewSheet({
  page,
  headDetail,
  memberName,
  totalHours,
}: {
  page: CertificateSheetPage;
  headDetail?: TrainingHistoryDetail;
  memberName: string;
  totalHours: number;
}) {
  return (
    <CertificateDocumentSheet
      rows={page.rows}
      showHead={page.showHead}
      showClosing={page.showClosing}
      startNo={page.startNo}
      totalHours={totalHours}
      memberName={memberName}
      supervisorGrade={headDetail?.supervisorGrade}
      supervisorCertNo={headDetail?.supervisorCertNo}
      formNo="제31호"
    />
  );
}
