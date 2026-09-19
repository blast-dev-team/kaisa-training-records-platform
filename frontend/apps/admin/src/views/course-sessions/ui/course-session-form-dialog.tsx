import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import type { Course } from "@/src/entities/institution";
import {
  courseSessionQueries,
  patchCourseSession,
  postCourseSession,
  type CourseSession,
} from "@/src/entities/course-session";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: CourseSession | null;
  /** 등록 성공 후 호출 — 바로 교육생 연결로 이어갈 때 사용 */
  onCreated?: (session: CourseSession) => void;
}

const fetchCourses = fetchOptions("/courses", {}, c => ({
  value: c.id as string,
  label: c.name as string,
  hint: c.institution_name as string | undefined,
}));

/** 교육 일정 등록·수정 — 과정 선택(검색 드롭다운) + 기간·시간·메모 */
export function CourseSessionFormDialog({ isOpen, onClose, session, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [recognizedHours, setRecognizedHours] = useState("");
  const [memo, setMemo] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setCourseId(session?.courseId ?? "");
    setStartedAt(session?.startedAt ?? "");
    setEndedAt(session?.endedAt ?? "");
    setTotalHours(session?.totalHours != null ? String(session.totalHours) : "");
    setRecognizedHours(
      session?.recognizedHours != null ? String(session.recognizedHours) : "",
    );
    setMemo(session?.memo ?? "");
    setIsActive(session?.isActive ?? true);
  }, [isOpen, session]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (session) {
        return patchCourseSession(session.id, {
          started_at: startedAt || null,
          ended_at: endedAt || null,
          total_hours: totalHours === "" ? null : Number(totalHours),
          recognized_hours: recognizedHours === "" ? null : Number(recognizedHours),
          is_active: isActive,
          memo: memo.trim() || null,
        });
      }
      return postCourseSession({
        course_id: courseId,
        started_at: startedAt || null,
        ended_at: endedAt || null,
        total_hours: totalHours === "" ? 0 : Number(totalHours),
        recognized_hours: recognizedHours === "" ? 0 : Number(recognizedHours),
        is_active: isActive,
        memo: memo.trim() || null,
      });
    },
    onSuccess: created => {
      toast.success(session ? "일정을 수정했어요" : "일정을 등록했어요");
      queryClient.invalidateQueries({ queryKey: courseSessionQueries.all() });
      if (!session && onCreated) {
        onClose();
        onCreated(created as CourseSession);
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={session ? "교육 일정 수정" : "교육 일정 등록"}
      description="일정 등록 후 교육생을 연결하면 교육 이력이 생성돼요"
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: session ? "수정" : "등록 후 교육생 연결",
          isLoading: mutation.isPending,
          isDisabled: !session && !courseId,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-3">
        {!session && (
          <div className="space-y-1.5">
            <Label>과정</Label>
            <SearchableSelect
              value={courseId || null}
              onChange={v => setCourseId(v ?? "")}
              fetchPage={fetchCourses}
              queryKeyPrefix={["options", "courses"]}
              placeholder="과정 검색 · 선택"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>시작일</Label>
            <Input
              type="date"
              value={startedAt ?? ""}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>종료일</Label>
            <Input
              type="date"
              value={endedAt ?? ""}
              min={startedAt || undefined}
              onChange={(e) => setEndedAt(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>총 시수</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>인정 시수</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={recognizedHours}
              onChange={(e) => setRecognizedHours(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[--color-accent]"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          운영중 (해제하면 '종료' 상태로 표시돼요)
        </label>
        <div className="space-y-1.5">
          <Label>메모</Label>
          <Textarea
            rows={2}
            placeholder="운영 참고 사항 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
