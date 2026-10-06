import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
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

/** 감리원 등급 옵션 — BE SupervisorGrade enum 과 같은 값. 저장 시 서버가 검증한다 */
const SUPERVISOR_GRADE_OPTIONS = ["미지정", "감리원", "수석감리원"] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null 이면 신규 등록 모드 */
  trainee: Trainee | null;
}

/**
 * 감리원 등록·정보 수정. 성명·생년월일·전화·이메일.
 * 감리원 등급은 선택값 — 단, 수석감리원증번호를 추가하면 수석감리원으로 고정된다.
 * 번호를 지우고 저장하면 선택한 등급(기본 감리원)으로 저장된다.
 */
export function TraineeFormDialog({ isOpen, onClose, trainee }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [certNo, setCertNo] = useState("");
  const [showSenior, setShowSenior] = useState(false);
  const [seniorCertNo, setSeniorCertNo] = useState("");
  const [seniorCertIssuedDate, setSeniorCertIssuedDate] = useState("");
  const [supervisorGrade, setSupervisorGrade] = useState("감리원");
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
    setShowSenior(trainee?.seniorCertNo != null);
    setSeniorCertNo(trainee?.seniorCertNo ?? "");
    setSeniorCertIssuedDate(trainee?.seniorCertIssuedDate ?? "");
    setSupervisorGrade(trainee?.supervisorGrade ?? "감리원");
    setBirthDate(trainee?.birthDate ?? "");
    setPhone(""); // 전화는 원문 미보유(마스킹만 응답) — 입력 시에만 변경
    setEmail(trainee?.email ?? "");
    setMemo(trainee?.memo ?? "");
    setGradeId(trainee?.membershipGradeId ?? "");
    setExpiresAt(trainee?.gradeExpiresAt ?? yearsAgoYMD(-1));
  }, [isOpen, trainee]);

  // 저장 시점 유효 수석번호 — 입력칸을 닫으면 제거 의미
  const effectiveSeniorNo = showSenior ? seniorCertNo.trim() : "";
  // 수석감리원증번호를 추가하는 동안은 등급이 수석감리원으로 고정된다
  const effectiveGrade = showSenior ? "수석감리원" : supervisorGrade;

  const handleGradeChange = (v: string) => {
    // 수석감리원 직접 선택은 수석감리원증번호 추가와 같은 의미 — 입력칸을 연다
    if (v === "수석감리원") setShowSenior(true);
    setSupervisorGrade(v);
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (trainee) {
        const input: Parameters<typeof patchTrainee>[1] = {
          name: name.trim(),
          cert_no: certNo.trim() || null,
          senior_cert_no: effectiveSeniorNo || null,
          senior_cert_issued_date: showSenior ? seniorCertIssuedDate || null : null,
          supervisor_grade: effectiveGrade === "미지정" ? null : effectiveGrade,
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
        senior_cert_no: effectiveSeniorNo || null,
        senior_cert_issued_date: showSenior ? seniorCertIssuedDate || null : null,
        supervisor_grade: effectiveGrade === "미지정" ? null : effectiveGrade,
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
            <div className="flex gap-1">
              <Label>감리원증번호</Label>
              <span className="text-11 text-ink-3">
                감리원증번호와 수석감리원증번호를 모두 등록할 수 있어요.
              </span>
            </div>
            <Input
              placeholder="예: 정보시스템감리협회 제1361호"
              value={certNo}
              onChange={(e) => setCertNo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>감리원 등급</Label>
            <Select
              value={effectiveGrade}
              disabled={showSenior}
              onChange={(e) => handleGradeChange(e.target.value)}
            >
              {SUPERVISOR_GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            {showSenior && (
              <p className="text-11 text-ink-3">
                수석감리원증번호가 있어 수석감리원으로 고정돼요 — 번호를 제거하면
                선택할 수 있어요
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {showSenior ? (
              <div className="space-y-1.5 rounded-lg border border-line bg-bg p-3">
                <div className="flex items-center justify-between">
                  <Label>수석감리원증번호</Label>
                  <button
                    type="button"
                    className="text-12 text-ink-3 underline-offset-2 hover:underline"
                    onClick={() => {
                      setShowSenior(false);
                      setSupervisorGrade("감리원");
                    }}
                  >
                    제거
                  </button>
                </div>
                <Input
                  placeholder="수석 감리원증 번호를 입력해 주세요"
                  value={seniorCertNo}
                  onChange={(e) => setSeniorCertNo(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <Label>수석감리원증 발급일</Label>
                  <DateField
                    ariaLabel="수석감리원증 발급일"
                    value={seniorCertIssuedDate}
                    onChange={setSeniorCertIssuedDate}
                  />
                </div>
                <p className="flex flex-col text-11 text-ink-3">
                  번호를 입력하면 저장 시 수석감리원 등급으로 변경됩니다.
                  <br />
                  지우고 저장하면 감리원등급으로 변경됩니다.
                </p>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setShowSenior(true)}>
                + 수석 감리원증 추가
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>생년월일</Label>
            <DateField ariaLabel="생년월일" value={birthDate} onChange={setBirthDate} />
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
              <p className="text-11 text-ink-3">
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
                <DateField ariaLabel="만료일" value={expiresAt} onChange={setExpiresAt} />
                <p className="text-11 text-ink-3">
                  만료일이 지나면 자동으로 일반 등급으로 바뀌어요
                </p>
              </div>
            )}
            <p className="text-11 text-ink-3">
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
