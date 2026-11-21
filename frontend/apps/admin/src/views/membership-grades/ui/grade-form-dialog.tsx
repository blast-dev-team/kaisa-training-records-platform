import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import {
  membershipGradeQueries,
  patchMembershipGrade,
  postMembershipGrade,
  type MembershipGrade,
} from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  grade: MembershipGrade | null;
}

export function GradeFormDialog({ isOpen, onClose, grade }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [priceKrw, setPriceKrw] = useState("");
  const [isActive, setIsActive] = useState(true);
  // 0원 저장 확인 — 0원이면 이 등급 회원은 결제 없이 발급된다
  const [confirmFree, setConfirmFree] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode(grade?.code ?? "");
    setName(grade?.name ?? "");
    setDescription(grade?.description ?? "");
    setSortOrder(grade ? String(grade.sortOrder) : "0");
    setPriceKrw(grade ? String(grade.priceKrw) : "");
    setIsActive(grade?.isActive ?? true);
    setConfirmFree(false);
  }, [isOpen, grade]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (grade) {
        return patchMembershipGrade(grade.id, {
          name: name.trim(),
          // 비우면 지운다 — undefined 는 키가 빠져 기존 설명이 남았다
          description: description.trim() || null,
          sort_order: Number(sortOrder || 0),
          price_krw: Number(priceKrw),
          is_active: isActive,
        });
      }
      return postMembershipGrade({
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        sort_order: Number(sortOrder || 0),
        price_krw: Number(priceKrw),
      });
    },
    onSuccess: () => {
      toast.success(grade ? "등급을 수정했어요" : "등급을 등록했어요");
      queryClient.invalidateQueries({ queryKey: membershipGradeQueries.all() });
      setConfirmFree(false);
      onClose();
    },
    onError: (e: Error) => {
      setConfirmFree(false);
      toast.error(toUserMessage(e));
    },
  });

  // 발급 단가는 필수 — 비운 칸을 0원으로 바꿔 저장하면 그 등급 회원 전원이 무료 발급된다
  const priceText = priceKrw.trim();
  const priceValid = priceText !== "" && Number.isInteger(Number(priceText)) && Number(priceText) >= 0;
  const priceError =
    priceText === ""
      ? grade
        ? "발급 단가를 입력해 주세요"
        : null
      : priceValid
        ? null
        : "발급 단가는 0원 이상의 정수로 입력해 주세요";
  // 이미 0원인 등급의 다른 칸만 고칠 때는 다시 묻지 않는다
  const becomesFree = priceValid && Number(priceText) === 0 && (!grade || grade.priceKrw !== 0);

  const submit = () => {
    if (becomesFree) {
      setConfirmFree(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <>
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={grade ? "회원등급 수정" : "회원등급 등록"}
      description="발급 단가는 등급에 설정한 가격으로 결정돼요"
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: grade ? "수정" : "등록",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !name.trim() || (!grade && !code.trim()) || !priceValid,
          onClick: submit,
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>
              코드{!grade && <span className="text-danger"> *</span>}
            </Label>
            <Input
              placeholder="예: regular"
              value={code}
              disabled={grade !== null}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>정렬순서</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>
            발급 단가 (원) <span className="text-danger">*</span>
          </Label>
          <Input
            type="number"
            min={0}
            placeholder="예: 3000"
            value={priceKrw}
            onChange={(e) => setPriceKrw(e.target.value)}
          />
          {priceError && (
            <p role="alert" className="text-11 text-danger">{priceError}</p>
          )}
          <p className="text-11 text-ink-3">
            확인서 발급 시 이 가격으로 결제돼요 — 0원이면 무료 발급
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>등급명 <span className="text-danger">*</span></Label>
          <Input
            placeholder="예: 일반 / 연간 / 평생"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>설명</Label>
          <Textarea
            rows={2}
            placeholder="선택"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {grade && (
          <label className="flex items-center gap-2 text-13 text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent] cursor-pointer"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            사용중 (해제하면 신규 배정에서 제외돼요)
          </label>
        )}
      </div>
    </Dialog>
    <Dialog
      isOpen={confirmFree}
      onClose={() => setConfirmFree(false)}
      title="발급 단가를 0원으로 저장할까요?"
      description={`'${name.trim() || "이 등급"}' 회원은 확인서를 결제 없이 무료로 발급받게 돼요`}
      actions={[
        { label: "취소", onClick: () => setConfirmFree(false) },
        {
          label: "0원으로 저장",
          variant: "primary",
          isLoading: mutation.isPending,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <p className="pt-1 text-13 text-ink-2">
        유료 등급이라면 취소하고 발급 단가를 입력해 주세요.
      </p>
    </Dialog>
    </>
  );
}
