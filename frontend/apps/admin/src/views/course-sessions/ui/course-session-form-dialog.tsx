import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { hoursError, isValidHours } from "@/src/shared/utils/hours";
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

const INSTITUTION_TYPE_HINT: Record<string, string> = { internal: "사내", external: "외부" };

/** 기관 선택 옵션 — 보조 표기로 사내/외부. 고른 기관의 구분이 일정의 '외부 교육' 값이 된다 */
const fetchInstitutions = fetchOptions("/institutions", { is_active: true }, (i) => ({
  value: i.id as string,
  label: i.name as string,
  hint: INSTITUTION_TYPE_HINT[(i.institution_type as string) ?? ""],
  meta: { institutionType: (i.institution_type as string | null) ?? null },
}));

/** 과정 선택 옵션 — 고른 기관에 연결된 과정만 */
const courseFetcherFor = (institutionId: string) =>
  fetchOptions("/courses", { institution_id: institutionId, is_active: true }, (c) => ({
    value: c.id as string,
    label: c.name as string,
  }));

/** 기관 구분 → 일정 내역 구분. 지정된 사내 기관만 internal, 그 외는 external (서버와 같은 규칙) */
const sourceOf = (institutionType: string | null | undefined): CourseSessionSource =>
  institutionType === "internal" ? "internal" : "external";

/** 교육 일정 등록·수정 — 과정 선택(검색 드롭다운) + 기간·시간·메모 */
export function CourseSessionFormDialog({ isOpen, onClose, session, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [institutionId, setInstitutionId] = useState("");
  const [institutionLabel, setInstitutionLabel] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  /** 선택된 과정 라벨 — 검색으로 골라 목록 리셋 후에도 트리거에 이름이 남는다 (••• 방지) */
  const [courseLabel, setCourseLabel] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [memo, setMemo] = useState("");
  const [isActive, setIsActive] = useState(true);
  // 외부 교육 — 연결된 감리원 내역의 source. 기관 구분에 고정(직접 변경 불가) — 서버도 기관 기준으로 저장한다
  const [source, setSource] = useState<CourseSessionSource>("internal");

  // 연결된 감리원이 있으면 기관·과정 고정 — 이미 만든 내역의 과정·기관·구분과 어긋나지 않게(서버도 거절)
  const courseLocked = !!session && session.enrolledCount > 0;

  useEffect(() => {
    if (!isOpen) return;
    setInstitutionId(session?.institutionId ?? "");
    setInstitutionLabel(session?.institutionName ?? null);
    setCourseId(session?.courseId ?? "");
    setCourseLabel(session?.courseName ?? null);
    setStartedAt(session?.startedAt ?? "");
    setEndedAt(session?.endedAt ?? "");
    setTotalHours(session?.totalHours != null ? String(session.totalHours) : "");
    setMemo(session?.memo ?? "");
    setIsActive(session?.isActive ?? true);
    // 수정은 기관의 현재 구분을 따른다 — 일정 등록 후 기관 구분이 바뀌었어도 맞춰진다
    setSource(session ? sourceOf(session.institutionType) : "internal");
  }, [isOpen, session]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (session) {
        return patchCourseSession(session.id, {
          // 과정을 바꿨을 때만 보낸다 — 연결된 감리원이 있으면 서버가 거절한다
          ...(courseId !== session.courseId ? { course_id: courseId } : {}),
          started_at: startedAt || null,
          ended_at: endedAt || null,
          // 빈 칸은 '변경 없음' — null 을 보내면 서버가 거절(예전엔 500)
          ...(totalHours.trim() === "" ? {} : { total_hours: Number(totalHours) }),
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
    onError: (e: Error) => toast.error(toUserMessage(e)),
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
          isDisabled: !courseId || (totalHours.trim() !== "" && !isValidHours(totalHours)),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>기관</Label>
          <SearchableSelect
            value={institutionId || null}
            onChange={(v, option) => {
              if ((v ?? "") === institutionId) return;
              setInstitutionId(v ?? "");
              setInstitutionLabel(option?.label ?? null);
              // 기관이 바뀌면 과정은 다시 고른다 — 다른 기관의 과정이 남지 않게
              setCourseId("");
              setCourseLabel(null);
              setSource(sourceOf(option?.meta?.institutionType as string | null | undefined));
            }}
            fetchPage={fetchInstitutions}
            queryKeyPrefix={["options", "session-form-institutions"]}
            placeholder="기관 검색 · 선택"
            selectedLabel={institutionLabel ?? undefined}
            disabled={courseLocked}
            disableCreate
          />
        </div>
        <div className="space-y-1.5">
          <Label>과정</Label>
          <SearchableSelect
            value={courseId || null}
            onChange={(v, option) => {
              setCourseId(v ?? "");
              setCourseLabel(option?.label ?? null);
            }}
            fetchPage={courseFetcherFor(institutionId)}
            queryKeyPrefix={["options", "session-form-courses", institutionId || "none"]}
            placeholder={institutionId ? "과정 검색 · 선택" : "기관을 먼저 선택하세요"}
            selectedLabel={courseLabel ?? undefined}
            disabled={!institutionId || courseLocked}
            disableCreate
          />
          {courseLocked && (
            <p className="text-11 text-ink-3">
              감리원이 연결된 일정이라 기관·과정을 바꿀 수 없어요 (연결된 교육 내역과 어긋나지 않게)
            </p>
          )}
        </div>
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
            {hoursError(totalHours, { label: "총 시수" }) ? (
              <p role="alert" className="text-11 text-danger">
                {hoursError(totalHours, { label: "총 시수" })}
              </p>
            ) : (
              <p className="text-11 text-ink-3">입력한 총 시수가 이수 시수로 인정돼요</p>
            )}
          </div>
        </div>
        <label className="flex flex-col text-13 text-ink-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent]"
              checked={source === "external"}
              disabled
              readOnly
            />
            외부 교육
          </div>
          <span className="text-11 text-ink-3">
            (과정의 기관 구분에 따라 자동으로 정해져요 — 바꾸려면 기관 · 과정에서 기관 구분을 수정하세요)
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
