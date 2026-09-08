import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";

import { CaretLeftIcon } from "@/src/shared/icon";
import { Button, Checkbox, Dropdown, type DropdownOption } from "@/src/shared/ui";
import { IssuanceStepper } from "@/src/widget";

import { getTrainingHistoryDetail } from "../api/get-training-history-detail";
import { postIssuancePayment } from "../api/post-issuance-payment";

/** 확인서 발급 수수료 — Figma node 38:2327 */
const ISSUANCE_FEE = 3000;

/** 발급 용도 옵션 — Figma node 38:2311 placeholder 예시 기반 */
const PURPOSE_OPTIONS: DropdownOption[] = [
  { value: "renewal", label: "자격 갱신 제출용" },
  { value: "review", label: "자격심사 제출용" },
  { value: "etc", label: "기타" },
];

const PURPOSE_PLACEHOLDER = "발급 용도 (선택) — 예: 자격 갱신 제출용";

/** 발급 완료 페이지로 전달하는 결제 컨텍스트 */
export interface IssuancePaymentState {
  courseName: string;
  trainedOn: string;
  hours: number;
  purpose: string;
  amount: number;
}

/**
 * 확인서 발급 결제 — Figma node 38:2279 기반.
 *
 * 좌측 신청 내용(교육명·교육일자·이수시간·신청인·발급 용도)과 우측 결제 카드.
 * 결제하기 → 결제 mutation 성공 시 발급 완료 페이지로 데이터를 실어 이동한다.
 * 재발급(reissuable) 건은 결제 없이 데이터 확인 후 바로 발급 완료로 넘어간다.
 */
export function TrainingHistoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [purpose, setPurpose] = useState("");
  const [agreed, setAgreed] = useState(false);

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["training-history", "detail", id],
    queryFn: () => getTrainingHistoryDetail(id as string),
    enabled: id !== undefined,
  });

  const payment = useMutation({
    mutationFn: () =>
      postIssuancePayment({
        recordId: id as string,
        purpose,
        agreed,
        amount: ISSUANCE_FEE,
      }),
    onSuccess: () => {
      if (!detail) return;
      // 결제 완료 화면으로 — 뒤로가기로 결제 화면에 되돌아오지 않게 replace
      navigate(`/training-history/${id}/complete`, {
        replace: true,
        state: {
          courseName: detail.courseName,
          trainedOn: detail.trainedOn,
          hours: detail.hours,
          purpose,
          amount: ISSUANCE_FEE,
        } satisfies IssuancePaymentState,
      });
    },
  });

  // 재발급 — 결제 없이 확인한 데이터를 실어 바로 발급 완료로
  useEffect(() => {
    if (!detail || detail.certificateStatus !== "reissuable") return;
    navigate(`/training-history/${id}/complete`, {
      replace: true,
      state: {
        courseName: detail.courseName,
        trainedOn: detail.trainedOn,
        hours: detail.hours,
        purpose: "",
        amount: 0,
      } satisfies IssuancePaymentState,
    });
  }, [detail, id, navigate]);

  if (isLoading) {
    return (
      <section className="flex flex-1 items-center justify-center py-20 font-sans text-sm text-gray-500">
        신청 내용을 불러오고 있어요
      </section>
    );
  }

  if (isError || !detail) {
    return (
      <section className="flex flex-col items-center gap-4 py-20 text-center font-sans">
        <p className="text-sm text-gray-700">
          {error instanceof Error
            ? error.message
            : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}
        </p>
        <div className="flex gap-2">
          <Button variant="outlined" color="gray" onClick={() => refetch()}>
            다시 시도
          </Button>
          <Button variant="outlined" color="gray" onClick={() => navigate(-1)}>
            목록으로
          </Button>
        </div>
      </section>
    );
  }

  if (detail.certificateStatus === "reissuable") {
    return (
      <section className="flex flex-1 items-center justify-center py-20 font-sans text-sm text-gray-500">
        발급 완료 화면으로 이동하고 있어요
      </section>
    );
  }

  const feeLabel = ISSUANCE_FEE.toLocaleString("ko-KR");
  const canPay = agreed && !payment.isPending;

  return (
    <section className="flex flex-col gap-6 font-sans">
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
          결제
        </h1>
      </button>

      <IssuanceStepper currentStep={2} />

      <div className="flex w-full items-start gap-6">
        {/* 신청 내용 — node 38:2297 */}
        <div className="flex min-w-px flex-1 flex-col gap-4 rounded-lg border border-solid border-gray-200 bg-white p-7">
          <h2 className="text-lg leading-normal font-bold text-gray-900">
            신청 내용
          </h2>

          <dl className="flex w-full flex-col gap-4">
            <DetailRow label="교육명" value={detail.courseName} />
            <DetailRow label="교육일자" value={detail.trainedOn.replaceAll("-", ".")} />
            <DetailRow label="이수시간" value={`${detail.hours}시간`} />
            <DetailRow label="신청인" value={detail.applicantLabel} />
          </dl>

          <Dropdown
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={(next) => setPurpose(next as string)}
            placeholder={PURPOSE_PLACEHOLDER}
            className="pt-2"
          />
        </div>

        {/* 결제 — node 38:2314 */}
        <div className="flex min-w-px flex-1 flex-col gap-4 rounded-lg border border-solid border-gray-200 bg-white p-7">
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
            className="pt-2"
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
        </div>
      </div>
    </section>
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
