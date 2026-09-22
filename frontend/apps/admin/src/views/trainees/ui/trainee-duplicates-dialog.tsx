import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { deleteTrainee, getTraineeDuplicates, type Trainee } from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 행 클릭 — 해당 교육생 수정 모달로 이동 */
  onEdit: (trainee: Trainee) => void;
}

/** 감리원증번호 중복 교육생 목록 — 행 클릭 시 수정, 바로 삭제도 가능 */
export function TraineeDuplicatesDialog({ isOpen, onClose, onEdit }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["trainees", "duplicates"],
    queryFn: getTraineeDuplicates,
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrainee(id),
    onSuccess: () => {
      toast.success("감리원을 삭제했어요");
      setConfirmingId(null);
      queryClient.invalidateQueries({ queryKey: ["trainees"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="감리원증번호 중복 확인"
      description="증번호가 같은 감리원들 — 이름 개명 등으로 발생해요. 클릭해서 수정하세요"
      actions={[{ label: "닫기", onClick: onClose }]}
    >
      {isLoading ? (
        <p className="p-3 text-[13px] text-ink-3">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="p-3 text-[13px] text-ink-3">중복된 감리원증번호가 없어요</p>
      ) : (
        <DuplicateGroups
          rows={rows}
          confirmingId={confirmingId}
          setConfirmingId={setConfirmingId}
          deleteMutation={deleteMutation}
          onEdit={onEdit}
        />
      )}
    </Dialog>
  );
}

function DuplicateGroups({
  rows,
  confirmingId,
  setConfirmingId,
  deleteMutation,
  onEdit,
}: {
  rows: Trainee[];
  confirmingId: string | null;
  setConfirmingId: (id: string | null) => void;
  deleteMutation: { isPending: boolean; mutate: (id: string) => void };
  onEdit: (trainee: Trainee) => void;
}) {
  const groups = new Map<string, Trainee[]>();
  for (const t of rows) {
    const key = t.certNo ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto">
      {[...groups.entries()].map(([certNo, trainees]) => (
        <div key={certNo} className="rounded-md border border-line">
          <p className="border-b border-line bg-bg-2 px-3 py-1.5 text-[12px] font-medium text-ink">
            {certNo}
            <span className="ml-1.5 text-ink-3">({trainees.length}명)</span>
          </p>
          {trainees.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 border-b border-line px-3 py-2 text-[13px] last:border-b-0"
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left hover:underline"
                onClick={() => onEdit(t)}
              >
                <span className="text-ink">{t.name}</span>
                <span className="text-[11px] text-ink-3">{t.certNo}</span>
                <span className="ml-auto text-[11px] text-ink-3">
                  {t.birthDate ?? "생년월일 없음"}
                </span>
              </button>
              {confirmingId === t.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(t.id)}
                  >
                    {deleteMutation.isPending ? "삭제 중…" : "삭제"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingId(null)}>
                    취소
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-danger hover:text-danger"
                  onClick={() => setConfirmingId(t.id)}
                >
                  삭제
                </Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
