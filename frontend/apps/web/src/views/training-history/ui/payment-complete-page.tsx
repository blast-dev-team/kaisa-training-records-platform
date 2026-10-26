import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Button } from "@/src/shared/ui";

import {
  clearPendingIssuance,
  confirmIssuancePayment,
  readPendingIssuance,
} from "../api/post-issuance-payment";

/**
 * 모바일 결제 복귀 화면 — PortOne 이 결제창을 마치고 `redirectUrl` 로 돌려보낸다.
 *
 * 모바일 결제창은 페이지를 통째로 이동시켜, 결제 모달의 Promise 가 끝나지 않고
 * confirm 도 불리지 않았다. 여기서 쿼리의 paymentId 로 confirm 해 발급까지 마치고,
 * 교육이력 화면에서 발급 완료(PDF 다운로드) 모달을 연다.
 * 쿼리: `paymentId`, 실패 시 `code`·`message` (PortOne V2 리디렉션 규격).
 */
export function PaymentCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = searchParams.get("paymentId") ?? "";
  const failCode = searchParams.get("code");
  const pending = readPendingIssuance();

  const confirm = useQuery({
    queryKey: ["payment-confirm", paymentId],
    // 확정은 멱등이라 다시 불려도 한 번만 발급된다
    queryFn: async () => {
      await confirmIssuancePayment(paymentId);
      return true;
    },
    enabled: paymentId !== "" && !failCode,
    retry: false,
    staleTime: Infinity,
  });

  const failed = Boolean(failCode) || !paymentId;
  useEffect(() => {
    if (failed) clearPendingIssuance();
  }, [failed]);

  useEffect(() => {
    if (!confirm.isSuccess) return;
    const recordIds = pending?.orderNo === paymentId ? pending.recordIds : undefined;
    navigate("/training-history", {
      replace: true,
      state: recordIds ? { issuedRecordIds: recordIds } : null,
    });
  }, [confirm.isSuccess, navigate, paymentId, pending]);

  if (failed) {
    return (
      <ResultPanel
        title="결제가 완료되지 않았어요"
        description="결제를 취소했거나 결제 중 문제가 생겼어요. 결제된 금액은 없어요."
      >
        <Link to="/training-history" replace>
          <Button color="black" fullWidth>
            교육이력으로 돌아가기
          </Button>
        </Link>
      </ResultPanel>
    );
  }

  if (confirm.isError) {
    return (
      <ResultPanel
        title="결제를 확인하고 있어요"
        description={
          confirm.error instanceof Error
            ? confirm.error.message
            : "결제 확인이 늦어지고 있어요. 다시 결제하지 말고 잠시 후 다시 확인해 주세요"
        }
      >
        <Button
          color="black"
          fullWidth
          disabled={confirm.isFetching}
          onClick={() => confirm.refetch()}
        >
          {confirm.isFetching ? "확인 중..." : "다시 확인"}
        </Button>
        <Link to="/payment-history" className="text-center text-13 text-gray-500 underline">
          발급·결제 내역에서 확인하기
        </Link>
      </ResultPanel>
    );
  }

  return (
    <ResultPanel
      title="결제를 확인하고 있어요"
      description="확인서를 발급하는 중이에요. 이 화면을 닫지 말고 잠시만 기다려 주세요."
    />
  );
}

function ResultPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center font-sans mobile:px-5">
      <h1 className="text-18 font-semibold text-gray-900">{title}</h1>
      <p className="text-14 leading-[1.6] text-gray-500">{description}</p>
      {children && <div className="mt-2 flex flex-col gap-3">{children}</div>}
    </section>
  );
}
