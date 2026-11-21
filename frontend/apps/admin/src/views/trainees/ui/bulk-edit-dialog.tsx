import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ApiError } from "@/src/shared/api";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Label } from "@/src/shared/ui/label";
import { postTraineeBulkUpdate, traineeQueries, type Trainee } from "@/src/entities/trainee";
import {
  EMPTY_ROW,
  buildBulkItems,
  toRowDraft,
  validateRows,
  type RowDraft,
  type RowIssue,
  type RowIssueField,
} from "./bulk-edit-rows";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 일괄 수정 대상 — 선택한 교육생들 */
  trainees: Trainee[];
  /** 성공 후 선택 해제용 */
  onDone: () => void;
}

/** 모달 안에서 교육생마다 두 줄로 값을 고치고 한 번에 저장한다 */
export function BulkEditDialog({ isOpen, onClose, trainees, onDone }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  // 저장을 한 번 눌러야 오류를 보여 준다 — 열자마자 빨간 표시가 뜨지 않게. 이후로는 고치는 대로 갱신
  const [attempted, setAttempted] = useState(false);
  // 서버가 알려 준 사람별 오류(다른 감리원과 증번호 중복 등) — 그 사람 칸을 고치면 지운다
  const [serverIssues, setServerIssues] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!isOpen) return;
    const seeded: Record<string, RowDraft> = {};
    for (const t of trainees) seeded[t.id] = toRowDraft(t);
    setRows(seeded);
    setAttempted(false);
    setServerIssues({});
    // 열릴 때의 선택 목록을 그대로 시드 — 이후 trainees 참조 변화는 무시한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setRow = (id: string, patch: Partial<RowDraft>) => {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...patch } }));
    setServerIssues((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const items = buildBulkItems(trainees, rows);
  const clientIssues = useMemo(() => validateRows(trainees, rows), [trainees, rows]);
  const shownIssues: Record<string, RowIssue[]> = attempted ? clientIssues : {};
  const issueOf = (id: string, field: RowIssueField) =>
    shownIssues[id]?.find((i) => i.field === field)?.message;
  // 요약 — 이름순이 아니라 화면 순서대로 "홍길동: 전화번호는 …"
  const problemRows = trainees
    .map((t) => ({
      trainee: t,
      messages: [...(shownIssues[t.id] ?? []).map((i) => i.message), ...(serverIssues[t.id] ?? [])],
    }))
    .filter((r) => r.messages.length > 0);

  const mutation = useMutation({
    mutationFn: () => postTraineeBulkUpdate({ items }),
    onSuccess: ({ updated, skipped }) => {
      toast.success(`정보를 수정했어요 — ${updated}명${skipped ? ` (제외 ${skipped}명)` : ""}`);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      onDone();
      onClose();
    },
    onError: (e: Error) => {
      // 서버 오류를 사람별로 — field 는 body.items.<순번>[.칸] 형태라 보낸 items 의 순번으로 사람을 찾는다
      const byId: Record<string, string[]> = {};
      if (e instanceof ApiError) {
        for (const fe of e.fieldErrors ?? []) {
          const m = /^body\.items\.(\d+)/.exec(fe.field);
          const id = m ? items[Number(m[1])]?.id : undefined;
          if (id) (byId[id] ??= []).push(fe.message);
        }
      }
      if (Object.keys(byId).length > 0) {
        setServerIssues(byId);
        toast.error(`${Object.keys(byId).length}명의 정보에 오류가 있어요 — 빨간 칸을 확인해 주세요`);
        return;
      }
      toast.error(toUserMessage(e));
    },
  });

  const handleSave = () => {
    setAttempted(true);
    if (Object.keys(clientIssues).length > 0) {
      toast.error(`${Object.keys(clientIssues).length}명의 정보를 확인해 주세요`);
      return;
    }
    if (items.length === 0) {
      toast.info("변경된 내용이 없어요");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title="감리원 정보 일괄 수정"
      description={`${trainees.length}명의 성명·생년월일·전화번호·이메일·감리원증번호·수석감리원증번호·메모를 개별로 수정해요`}
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: `${trainees.length}명 저장`,
          variant: "primary",
          isLoading: mutation.isPending,
          onClick: handleSave,
        },
      ]}
    >
      <div className="space-y-2">
        {problemRows.length > 0 && (
          <div role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-12 text-danger">
            <p className="font-medium">{problemRows.length}명의 정보를 확인해 주세요 — 저장하지 않았어요</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {problemRows.map(({ trainee, messages }) => (
                <li key={trainee.id}>
                  {rows[trainee.id]?.name.trim() || trainee.name}: {messages.join(" · ")}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* 한 사람당 두 줄(4칸×2) — 칸이 모달 폭에 맞춰 줄어들어 가로 스크롤이 생기지 않는다 */}
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {trainees.map((t) => {
            const row = rows[t.id];
            if (!row) return null;
            const hasIssue = !!shownIssues[t.id]?.length || !!serverIssues[t.id]?.length;
            const certIssue = issueOf(t.id, "certNo");
            return (
              <div
                key={t.id}
                aria-invalid={hasIssue || undefined}
                className={`grid grid-cols-4 gap-x-2 gap-y-2 rounded-lg border px-2.5 py-2 ${
                  hasIssue ? "border-2 border-danger bg-danger-soft/30" : "border-line"
                }`}
              >
                <Field label="성명" required error={issueOf(t.id, "name")}>
                  <Input
                    value={row.name}
                    aria-invalid={!!issueOf(t.id, "name") || undefined}
                    onChange={(e) => setRow(t.id, { name: e.target.value })}
                  />
                </Field>
                <Field label="생년월일">
                  <DateField
                    ariaLabel={`생년월일 ${t.id}`}
                    value={row.birthDate}
                    onChange={(v) => setRow(t.id, { birthDate: v })}
                  />
                </Field>
                <Field label="전화번호" error={issueOf(t.id, "phone")}>
                  <Input
                    value={row.phone}
                    placeholder={t.phoneMasked || "전화 없음"}
                    aria-invalid={!!issueOf(t.id, "phone") || undefined}
                    onChange={(e) => setRow(t.id, { phone: e.target.value })}
                  />
                </Field>
                <Field label="이메일" error={issueOf(t.id, "email")}>
                  <Input
                    type="email"
                    value={row.email}
                    placeholder="이메일 없음"
                    aria-invalid={!!issueOf(t.id, "email") || undefined}
                    onChange={(e) => setRow(t.id, { email: e.target.value })}
                  />
                </Field>
                <Field label="감리원증번호" error={certIssue}>
                  <Input
                    value={row.certNo}
                    placeholder={t.certNo || "번호 없음"}
                    aria-invalid={!!certIssue || undefined}
                    onChange={(e) => setRow(t.id, { certNo: e.target.value })}
                  />
                </Field>
                <Field label="수석감리원증번호">
                  <Input
                    value={row.seniorCertNo}
                    placeholder={t.seniorCertNo || "번호 없음"}
                    aria-invalid={!!certIssue || undefined}
                    onChange={(e) => setRow(t.id, { seniorCertNo: e.target.value })}
                  />
                </Field>
                <Field label="메모" className="col-span-2">
                  <Input
                    value={row.memo}
                    placeholder="메모 없음"
                    onChange={(e) => setRow(t.id, { memo: e.target.value })}
                  />
                </Field>
                {serverIssues[t.id] && (
                  <p role="alert" className="col-span-4 text-11 text-danger">
                    {serverIssues[t.id]!.join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-12 text-ink-3">
          전화번호·이메일·감리원증번호·수석감리원증번호를 비워 두면 기존 값을 유지해요 (이메일 삭제는 개별 수정에서). 메모는 비우면 지워져요
        </p>
      </div>
    </Dialog>
  );
}

/** 칸 라벨 + 입력 — min-w-0 이 없으면 그리드 칸이 내용 폭 아래로 줄지 않아 테두리 밖으로 밀린다 */
function Field({
  label,
  error,
  className = "",
  required = false,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <Label className="text-11 text-ink-3">
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {children}
      {error && (
        <p role="alert" className="text-11 text-danger">{error}</p>
      )}
    </div>
  );
}
