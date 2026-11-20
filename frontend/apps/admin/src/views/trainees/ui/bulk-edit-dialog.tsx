import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Label } from "@/src/shared/ui/label";
import {
  postTraineeBulkUpdate,
  traineeQueries,
  type Trainee,
  type TraineeBulkUpdateItem,
} from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 일괄 수정 대상 — 선택한 교육생들 */
  trainees: Trainee[];
  /** 성공 후 선택 해제용 */
  onDone: () => void;
}

/** 모달 안에서 교육생마다 한 줄로 값을 고치고 한 번에 저장한다 */
interface RowDraft {
  name: string;
  birthDate: string;
  phone: string;
  certNo: string;
  seniorCertNo: string;
}

export function BulkEditDialog({ isOpen, onClose, trainees, onDone }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, RowDraft>>({});

  useEffect(() => {
    if (!isOpen) return;
    const seeded: Record<string, RowDraft> = {};
    for (const t of trainees) {
      seeded[t.id] = {
        name: t.name,
        birthDate: t.birthDate ?? "",
        phone: "",
        certNo: t.certNo ?? "",
        seniorCertNo: t.seniorCertNo ?? "",
      };
    }
    setRows(seeded);
    // 열릴 때의 선택 목록을 그대로 시드 — 이후 trainees 참조 변화는 무시한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const setRow = (id: string, patch: Partial<RowDraft>) => {
    setRows((prev) => {
      const base = prev[id] ?? {
        name: "",
        birthDate: "",
        phone: "",
        certNo: "",
        seniorCertNo: "",
      };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  // 전화는 빈 값 = 기존 유지 — null 을 보내면 초기화되므로 키를 생략한다
  // 사용자가 바꾼 칸만 보낸다 — 열 때 채운 값을 그대로 다 보내면, 그사이 다른 화면에서
  // 개별 수정한 이름·생년·증번호를 이 창을 연 시점의 옛 값으로 되돌렸다
  const items: TraineeBulkUpdateItem[] = trainees
    .map((t) => {
      const row = rows[t.id];
      const item: TraineeBulkUpdateItem = { id: t.id };
      if (!row) return item;
      if (row.name.trim() && row.name.trim() !== t.name) item.name = row.name.trim();
      if (row.birthDate && row.birthDate !== (t.birthDate ?? "")) item.birth_date = row.birthDate;
      if (row.phone.trim()) item.phone = row.phone.trim();
      if (row.certNo.trim() && row.certNo.trim() !== (t.certNo ?? "")) item.cert_no = row.certNo.trim();
      if (row.seniorCertNo.trim() && row.seniorCertNo.trim() !== (t.seniorCertNo ?? ""))
        item.senior_cert_no = row.seniorCertNo.trim();
      return item;
    })
    .filter((item) => Object.keys(item).length > 1);

  const nameEmpty = trainees.some((t) => !rows[t.id]?.name.trim());

  const mutation = useMutation({
    mutationFn: () => postTraineeBulkUpdate({ items }),
    onSuccess: ({ updated, skipped }) => {
      toast.success(`정보를 수정했어요 — ${updated}명${skipped ? ` (제외 ${skipped}명)` : ""}`);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="감리원 정보 일괄 수정"
      description={`${trainees.length}명의 성명·생년월일·전화번호·감리원증번호·수석감리원증번호를 개별로 수정해요`}
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: `${trainees.length}명 저장`,
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: nameEmpty,
          onClick: () => {
            if (items.length === 0) {
              toast.info("변경된 내용이 없어요");
              return;
            }
            mutation.mutate();
          },
        },
      ]}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[110px_1fr_150px_150px_170px] items-center gap-2 px-0.5">
          <Label className="text-11 text-ink-3">성명</Label>
          <Label className="text-11 text-ink-3">생년월일</Label>
          <Label className="text-11 text-ink-3">전화번호</Label>
          <Label className="text-11 text-ink-3">감리원증번호</Label>
          <Label className="text-11 text-ink-3">수석감리원증번호</Label>
        </div>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {trainees.map((t) => {
            const row = rows[t.id];
            if (!row) return null;
            return (
              <div
                key={t.id}
                className="grid grid-cols-[110px_1fr_150px_150px_170px] items-center gap-2 rounded-lg border border-line px-2.5 py-2"
              >
                <Input value={row.name} onChange={(e) => setRow(t.id, { name: e.target.value })} />
                <DateField
                  ariaLabel={`생년월일 ${t.id}`}
                  value={row.birthDate}
                  onChange={(v) => setRow(t.id, { birthDate: v })}
                />
                <Input
                  value={row.phone}
                  placeholder={t.phoneMasked || "전화 없음"}
                  onChange={(e) => setRow(t.id, { phone: e.target.value })}
                />
                <Input
                  value={row.certNo}
                  placeholder={t.certNo || "번호 없음"}
                  onChange={(e) => setRow(t.id, { certNo: e.target.value })}
                />
                <Input
                  value={row.seniorCertNo}
                  placeholder={t.seniorCertNo || "번호 없음"}
                  onChange={(e) => setRow(t.id, { seniorCertNo: e.target.value })}
                />
              </div>
            );
          })}
        </div>
        <p className="text-12 text-ink-3">
          전화번호·감리원증번호·수석감리원증번호를 비워 두면 기존 값을 유지해요
        </p>
      </div>
    </Dialog>
  );
}
