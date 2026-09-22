import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Select } from "@/src/shared/ui/select";
import { Textarea } from "@/src/shared/ui/textarea";
import {
  membershipGradeQueries,
  patchTrainee,
  traineeQueries,
  type Trainee,
} from "@/src/entities/trainee";
import { yearsAgoYMD } from "@/src/shared/utils/format";
import { useQuery } from "@tanstack/react-query";

/** 연간 등급 코드 — BE PERIOD_GRADE_CODE 와 일치. 이 등급만 기간(만료일)이 있다 */
const PERIOD_GRADE_CODE = "annual";

interface Props {
  trainee: Trainee | null;
  onClose: () => void;
}

export function GradeChangeDialog({ trainee, onClose }: Props) {
  const queryClient = useQueryClient();
  const [gradeId, setGradeId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");

  const { data: grades } = useQuery(membershipGradeQueries.list(true));
  const selectedGrade = (grades ?? []).find((g) => g.id === gradeId);
  const isAnnual = selectedGrade?.code === PERIOD_GRADE_CODE;

  useEffect(() => {
    if (trainee) {
      setGradeId(trainee.membershipGradeId ?? "");
      // 연간이면 기존 만료일(연장), 없으면 오늘+1년을 기본값으로 제안
      setExpiresAt(trainee.gradeExpiresAt ?? yearsAgoYMD(-1));
      setReason("");
    }
  }, [trainee]);

  const mutation = useMutation({
    mutationFn: (input: { id: string; gradeId: string; reason: string; expiresAt: string }) =>
      patchTrainee(input.id, {
        membership_grade_id: input.gradeId,
        grade_expires_at: input.expiresAt || undefined,
        grade_change_reason: input.reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("등급을 변경했어요");
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={trainee !== null}
      onClose={onClose}
      title="회원등급 변경"
      description={
        trainee
          ? `${trainee.certNo} ${trainee.name} · 현재 ${trainee.gradeName ?? "미지정"}`
          : undefined
      }
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: "변경",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !gradeId || (isAnnual && !expiresAt),
          onClick: () => {
            if (!trainee || !gradeId) return;
            mutation.mutate({ id: trainee.id, gradeId, reason, expiresAt });
          },
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>회원등급</Label>
          <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
            <option value="">등급 선택</option>
            {(grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        {isAnnual && (
          <div className="space-y-1.5">
            <Label>만료일</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <p className="text-[12px] text-ink-3">
              만료일 당일까지 유지되고, 지나면 자동으로 일반 등급으로 바뀌어요
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>변경 사유</Label>
          <Textarea
            rows={3}
            placeholder="변경 사유를 남겨두면 이력·감사로그에서 추적할 수 있어요"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
