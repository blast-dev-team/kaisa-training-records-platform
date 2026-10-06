import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Label } from "@/src/shared/ui/label";
import { Textarea } from "@/src/shared/ui/textarea";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import {
  courseSessionQueries,
  patchCourseSession,
  postCourseSession,
  type CourseSession,
  type CourseSessionSource,
} from "@/src/entities/course-session";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: CourseSession | null;
  /** 등록 성공 후 호출 — 바로 교육생 연결로 이어갈 때 사용 */
  onCreated?: (session: CourseSession) => void;
}

/** 과정 id → 소속 기관 타입. 옵션을 그릴 때 채운다 — 선택 후 상세 재호출 없이 자동 체크 판단 */
const courseTypeById = new Map<string, CourseSessionSource>();

const fetchCourses = fetchOptions("/courses", {}, (c) => {
  const id = c.id as string;
  courseTypeById.set(id, c.institution_type === "external" ? "external" : "internal");
  return {
    value: id,
    label: c.name as string,
    hint: c.institution_name as string | undefined,
  };
});

/** 교육 일정 등록·수정 — 과정 선택(검색 드롭다운) + 기간·시간·메모 */
export function CourseSessionFormDialog({ isOpen, onClose, session, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  /** 선택된 과정 라벨 — 검색으로 골라 목록 리셋 후에도 트리거에 이름이 남는다 (••• 방지) */
  const [courseLabel, setCourseLabel] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [memo, setMemo] = useState("");
  const [isActive, setIsActive] = useState(true);
  // 외부 교육 — 연결된 감리원 내역의 source. 외부 기관 과정 선택 시 자동 체크
  const [source, setSource] = useState<CourseSessionSource>("internal");

  useEffect(() => {
    if (!isOpen) return;
    setCourseId(session?.courseId ?? "");
    setCourseLabel(session?.courseName ?? null);
    setStartedAt(session?.startedAt ?? "");
    setEndedAt(session?.endedAt ?? "");
    setTotalHours(session?.totalHours != null ? String(session.totalHours) : "");
    setMemo(session?.memo ?? "");
    setIsActive(session?.isActive ?? true);
    setSource(session?.source ?? "internal");
  }, [isOpen, session]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (session) {
        return patchCourseSession(session.id, {
          started_at: startedAt || null,
          ended_at: endedAt || null,
          total_hours: totalHours === "" ? null : Number(totalHours),
          is_active: isActive,
          source,
          memo: memo.trim() || null,
        });
      }
      return postCourseSession({
        course_id: courseId,
        started_at: startedAt || null,
        ended_at: endedAt || null,
        total_hours: totalHours === "" ? 0 : Number(totalHours),
        is_active: isActive,
        source,
        memo: memo.trim() || null,
      });
    },
    onSuccess: (created) => {
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
      description="일정 등록 후 감리원을 연결하면 교육 내역이 생성돼요"
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: session ? "수정" : "등록 후 감리원 연결",
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
              onChange={(v, option) => {
                setCourseId(v ?? "");
                setCourseLabel(option?.label ?? null);
                // 외부 기관 과정이면 '외부 교육' 자동 체크 — 목록에서 받은 기관 타입으로 판단
                if (v) setSource(courseTypeById.get(v) ?? "internal");
              }}
              fetchPage={fetchCourses}
              queryKeyPrefix={["options", "courses"]}
              placeholder="과정 검색 · 선택"
              selectedLabel={courseLabel ?? undefined}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>시작일</Label>
            <DateField
              ariaLabel="시작일"
              value={startedAt ?? ""}
              onChange={(v) => {
                setStartedAt(v);
                if (v && endedAt && v > endedAt) setEndedAt(v);
              }}
              maxDate={endedAt || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label>종료일</Label>
            <DateField
              ariaLabel="종료일"
              value={endedAt ?? ""}
              onChange={(v) => {
                setEndedAt(v);
                if (v && startedAt && v < startedAt) setStartedAt(v);
              }}
              minDate={startedAt || undefined}
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
            <p className="text-11 text-ink-3">입력한 총 시수가 이수 시수로 인정돼요</p>
          </div>
        </div>
        <label className="flex flex-col text-13 text-ink-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent]"
              checked={source === "external"}
              onChange={(e) => setSource(e.target.checked ? "external" : "internal")}
            />
            외부 교육
          </div>
          <span className="text-11 text-ink-3">
            (외부 기관 과정이면 자동 체크 — 연결된 감리원 내역이 외부로 구분돼요)
          </span>
        </label>
        <label className="flex items-center gap-2 text-13 text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[--color-accent]"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          운영중
          <span className="text-11 text-ink-3">(해제하면 '종료' 상태로 표시돼요)</span>
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
