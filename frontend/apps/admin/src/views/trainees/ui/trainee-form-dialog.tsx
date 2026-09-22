import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Select } from "@/src/shared/ui/select";
import {
  membershipGradeQueries,
  patchTrainee,
  postTrainee,
  traineeQueries,
  type Trainee,
} from "@/src/entities/trainee";
import { yearsAgoYMD } from "@/src/shared/utils/format";

/** 연간 등급 코드 — BE PERIOD_GRADE_CODE 와 일치. 이 등급만 기간(만료일)이 있다 */
const PERIOD_GRADE_CODE = "annual";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null 이면 신규 등록 모드 */
  trainee: Trainee | null;
}

/**
 * 감리원 등록·정보 수정. 성명·생년월일·전화·이메일.
 * 등급 변경은 이력이 남는 GradeChangeDialog 전용 — 신규 등록 시에만 초기 등급을 고른다.
 */
export function TraineeFormDialog({ isOpen, onClose, trainee }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [certNo, setCertNo] = useState("");
  const [supervisorGrade, setSupervisorGrade] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [memo, setMemo] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const { data: grades } = useQuery(membershipGradeQueries.list(true));
  const selectedGrade = (grades ?? []).find((g) => g.id === gradeId);
  const isAnnual = selectedGrade?.code === PERIOD_GRADE_CODE;

  useEffect(() => {
    if (!isOpen) return;
    setName(trainee?.name ?? "");
    setCertNo(trainee?.certNo ?? "");
    setSupervisorGrade(trainee?.supervisorGrade ?? "");
    setBirthDate(trainee?.birthDate ?? "");
    setPhone(""); // 전화는 원문 미보유(마스킹만 응답) — 입력 시에만 변경
    setEmail(trainee?.email ?? "");
    setMemo(trainee?.memo ?? "");
    setGradeId(trainee?.membershipGradeId ?? "");
    setExpiresAt(trainee?.gradeExpiresAt ?? yearsAgoYMD(-1));
  }, [isOpen, trainee]);

  const mutation = useMutation({
    mutationFn: () => {
      if (trainee) {
        const input: Parameters<typeof patchTrainee>[1] = {
          name: name.trim(),
          cert_no: certNo.trim() || null,
          supervisor_grade: supervisorGrade.trim() || null,
          birth_date: birthDate || null,
          email: email.trim() || null,
          memo: memo.trim() || null,
        };
        if (phone.trim()) input.phone = phone.trim();
        return patchTrainee(trainee.id, input);
      }
      return postTrainee({
        name: name.trim(),
        cert_no: certNo.trim() || null,
        supervisor_grade: supervisorGrade.trim() || null,
        birth_date: birthDate || null,
        phone: phone.trim() || undefined,
        email: email.trim() || null,
        memo: memo.trim() || null,
        membership_grade_id: gradeId || undefined,
        grade_expires_at: gradeId && isAnnual ? expiresAt || undefined : undefined,
      });
    },
    onSuccess: (_data, _vars) => {
      toast.success(trainee ? "감리원 정보를 수정했어요" : "감리원을 등록했어요");
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={trainee ? "감리원 정보 수정" : "감리원 등록"}
      description={
        trainee
          ? `${trainee.certNo ?? ""} · ${trainee.name}`
          : "본인인증 없이 수기 등록 — 신원을 확인한 뒤 등록해 주세요"
      }
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: trainee ? "저장" : "등록",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !name.trim() || (!trainee && isAnnual && !expiresAt),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <Label>성명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>감리원증번호</Label>
            <Input
              placeholder="예: 정보시스템감리협회 제1361호"
              value={certNo}
              onChange={(e) => setCertNo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>감리원 등급</Label>
            <Input
              placeholder="예: 감리원 / 수석감리원"
              value={supervisorGrade}
              onChange={(e) => setSupervisorGrade(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>생년월일</Label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>전화번호</Label>
            <Input
              placeholder={trainee?.phoneMasked || "01012345678"}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {trainee && (
              <p className="text-[11px] text-ink-3">
                보안상 원문은 저장 시 암호화돼요 — 비워 두면 변경 없음
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>이메일</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        {!trainee && (
          <div className="space-y-1.5">
            <Label>회원등급 (선택)</Label>
            <Select value={gradeId} onChange={(e) => setGradeId(e.target.value)}>
              {(grades ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            {isAnnual && (
              <div className="flex flex-col gap-1.5">
                <Label>만료일</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className="text-[11px] text-ink-3">
                  만료일이 지나면 자동으로 일반 등급으로 바뀌어요
                </p>
              </div>
            )}
            <p className="text-[11px] text-ink-3">
              등급 변경은 교육생 목록의 등급변경으로 — 변경 이력이 남아요
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>메모</Label>
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
