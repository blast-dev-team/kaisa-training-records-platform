import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Label } from "@/src/shared/ui/label";
import { Pill } from "@/src/shared/ui/pill";
import { Textarea } from "@/src/shared/ui/textarea";
import { formatDateTime, formatPhone } from "@/src/shared/utils/format";
import {
  INQUIRY_STATUS_LABELS,
  inquiryCategoryLabel,
  inquiryQueries,
  putInquiryAnswer,
  type InquiryDetail,
  type InquiryHistoryItem,
} from "@/src/entities/inquiry";

const ANSWER_MAX = 5000;

/** 문의 상세 + 답변 — 왼쪽 문의·문의자·답변, 오른쪽 같은 문의자의 다른 문의 */
export function InquiryDetailDialog({
  inquiryId,
  onClose,
}: {
  inquiryId: string | null;
  onClose: () => void;
}) {
  const { data, isError } = useQuery({
    ...inquiryQueries.detail(inquiryId ?? ""),
    enabled: !!inquiryId,
  });

  return (
    <Dialog isOpen={!!inquiryId} onClose={onClose} size="2xl" title="문의 상세">
      {isError ? (
        <p className="py-10 text-center text-14 text-danger">
          문의를 불러오지 못했어요. 잠시 후 다시 시도해 주세요
        </p>
      ) : !data || data.id !== inquiryId ? (
        <p className="py-10 text-center text-14 text-ink-3">문의를 불러오고 있어요</p>
      ) : (
        // 문의가 바뀌면 답변 입력값을 새 문의 기준으로 다시 시작한다
        <InquiryDetailBody key={data.id} detail={data} onClose={onClose} />
      )}
    </Dialog>
  );
}

function InquiryDetailBody({ detail, onClose }: { detail: InquiryDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState(detail.answer ?? "");
  const isAnswered = detail.status === "answered";
  const unchanged = answer.trim() === (detail.answer ?? "").trim();

  const mutation = useMutation({
    mutationFn: () => putInquiryAnswer(detail.id, answer.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(inquiryQueries.detail(detail.id).queryKey, updated);
      // 목록·미해결 뱃지 갱신
      queryClient.invalidateQueries({ queryKey: inquiryQueries.all() });
      toast.success(isAnswered ? "답변을 수정했어요" : "답변을 등록했어요");
      if (!isAnswered) onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={isAnswered ? "ok" : "warn"}>{INQUIRY_STATUS_LABELS[detail.status]}</Pill>
          <span className="text-12 text-ink-3">{inquiryCategoryLabel(detail.category)}</span>
          <span className="text-12 text-ink-3">접수 {formatDateTime(detail.createdAt)}</span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-16 font-semibold text-ink">{detail.title}</p>
          <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-panel-2 px-3 py-3 text-14 leading-relaxed text-ink">
            {detail.content}
          </p>
        </div>

        <div className="rounded-lg border border-line px-3 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-12 font-semibold text-ink-2">
            문의자 정보
            <Pill tone={detail.isMember ? "accent" : "default"}>
              {detail.isMember ? "회원" : "비회원"}
            </Pill>
          </p>
          <dl className="grid grid-cols-[84px_1fr] gap-y-1 text-13">
            <dt className="text-ink-3">성명</dt>
            <dd className="text-ink">{detail.authorName}</dd>
            <dt className="text-ink-3">연락처</dt>
            <dd className="text-ink">{detail.authorPhone ? formatPhone(detail.authorPhone) : "—"}</dd>
            <dt className="text-ink-3">감리원번호</dt>
            <dd className="text-ink">{detail.authorCertNo ?? "—"}</dd>
            <dt className="text-ink-3">이메일</dt>
            <dd className="text-ink">{detail.authorEmail ?? "—"}</dd>
            {detail.traineeNo && (
              <>
                <dt className="text-ink-3">감리원</dt>
                <dd>
                  <Link
                    to={`/trainees?q=${encodeURIComponent(detail.traineeNo)}`}
                    className="text-accent hover:underline"
                  >
                    {detail.traineeNo} 감리원 정보 보기
                  </Link>
                </dd>
              </>
            )}
          </dl>
          {!detail.isMember && (
            <p className="mt-2 rounded bg-warn-soft px-2 py-1.5 text-12 text-warn-ink">
              비회원이 직접 입력한 정보라 본인확인이 되지 않았어요. 교육내역·감리원번호 같은 개인정보는
              답변에 담기 전에 본인 여부를 확인해 주세요
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inquiry-answer">
            답변{" "}
            {isAnswered && detail.answeredAt && (
              <span className="font-normal text-ink-3">
                · 마지막 답변 {detail.answeredByName ?? "-"} {formatDateTime(detail.answeredAt)}
              </span>
            )}
          </Label>
          <Textarea
            id="inquiry-answer"
            rows={7}
            maxLength={ANSWER_MAX}
            placeholder="교육생에게 보여질 답변을 입력해 주세요"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-11 text-ink-3">
              {answer.length.toLocaleString()} / {ANSWER_MAX.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 rounded-md border border-line px-4 text-13 text-ink-2 hover:bg-panel-2"
                onClick={onClose}
              >
                닫기
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-accent px-4 text-13 font-semibold text-white disabled:opacity-50"
                disabled={!answer.trim() || unchanged || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "저장 중..." : isAnswered ? "답변 수정" : "답변 등록"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <InquiryHistory items={detail.history} />
    </div>
  );
}

/** 같은 문의자의 다른 문의 — 누르면 내용·답변이 펼쳐진다 */
function InquiryHistory({ items }: { items: InquiryHistoryItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <aside className="flex min-w-0 flex-col gap-2 border-l border-line pl-5">
      <p className="text-13 font-semibold text-ink">
        이 문의자의 다른 문의 <span className="text-ink-3">{items.length}건</span>
      </p>
      <p className="text-11 text-ink-3">같은 회원 계정이거나 성명·연락처가 같은 문의예요</p>
      {items.length === 0 ? (
        <p className="text-12 text-ink-3">이전 문의가 없어요</p>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
          {items.map((h) => {
            const isOpen = openId === h.id;
            return (
              <li key={h.id} className="rounded-md border border-line">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full flex-col gap-1 px-2.5 py-2 text-left hover:bg-panel-2"
                  onClick={() => setOpenId(isOpen ? null : h.id)}
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-11 text-ink-3">
                    <Pill tone={h.status === "answered" ? "ok" : "warn"}>
                      {INQUIRY_STATUS_LABELS[h.status]}
                    </Pill>
                    {h.matchedBy === "name_phone" && (
                      <span
                        className="rounded bg-warn-soft px-1.5 py-0.5 text-warn-ink"
                        title="같은 회원 계정이 아니라 성명·연락처만 일치해요. 다른 사람일 수 있어요"
                      >
                        성명·연락처 일치 · 미확인
                      </span>
                    )}
                    {formatDateTime(h.createdAt)}
                  </span>
                  <span className="truncate text-13 font-medium text-ink" title={h.title}>
                    [{inquiryCategoryLabel(h.category)}] {h.title}
                  </span>
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-2 border-t border-line px-2.5 py-2 text-12">
                    <p className="whitespace-pre-wrap text-ink">{h.content}</p>
                    <p className="whitespace-pre-wrap rounded bg-accent-soft px-2 py-1.5 text-accent-ink">
                      {h.answer ?? "아직 답변이 없어요"}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
