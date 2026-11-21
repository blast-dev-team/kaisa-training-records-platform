import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { hoursError, isValidHours } from "@/src/shared/utils/hours";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import { Textarea } from "@/src/shared/ui/textarea";
import {
  getCourseLinks,
  patchCourse,
  postCourse,
  postInstitution,
  postSessionName,
  type Course,
} from "@/src/entities/institution";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  course: Course | null;
}

const INSTITUTION_TYPE_HINT: Record<string, string> = {
  internal: "사내",
  external: "외부",
};

const institutionFetcher = fetchOptions("/institutions", { is_active: true }, (i) => ({
  value: i.id as string,
  label: i.name as string,
  hint: INSTITUTION_TYPE_HINT[(i.institution_type as string) ?? ""] ?? "구분 미설정",
  meta: { institutionType: (i.institution_type as string | null) ?? null },
}));

const sessionNameFetcher = fetchOptions("/session-names", { is_active: true }, (s) => ({
  value: s.id as string,
  label: s.name as string,
}));

const rawCourseCodeFetcher = fetchOptions("/courses", {}, (c) => ({
  value: (c.course_code as string | null) ?? "",
  label: (c.course_code as string | null) ?? "",
  hint: c.name as string | undefined,
}));
/** 과정코드 옵션 — 코드 없는 과정(빈 행)과 같은 코드 중복을 걸러 낸다 */
const courseCodeFetcher: typeof rawCourseCodeFetcher = async (search, page) => {
  const res = await rawCourseCodeFetcher(search, page);
  const seen = new Set<string>();
  return {
    ...res,
    items: res.items.filter((o) => {
      if (!o.value || seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    }),
  };
};

/** 과정 등록·수정 — 회차명(마스터)과 과정명을 분리해 관리한다 */
export function CourseFormDialog({ isOpen, onClose, course }: Props) {
  const queryClient = useQueryClient();
  const [institutionId, setInstitutionId] = useState("");
  const [sessionNameId, setSessionNameId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  // 기관 변경 확인 — 연결된 일정·이력까지 함께 바뀌므로 저장 전에 한 번 더 묻는다
  const [confirmMove, setConfirmMove] = useState(false);
  const institutionChanged = !!course && !!institutionId && institutionId !== course.institutionId;
  const linksQuery = useQuery({
    queryKey: ["course-links", course?.id],
    queryFn: () => getCourseLinks(course!.id),
    enabled: isOpen && institutionChanged,
    staleTime: 0,
  });
  const links = linksQuery.data;
  const linkSummary = links
    ? `일정 ${links.sessionCount.toLocaleString()}건, 교육이력 ${links.recordCount.toLocaleString()}건`
    : "연결된 일정·교육이력";
  // 시수 필수 — 입력칸을 건드렸거나 수정 중이면 빈 값을 바로 알린다
  const [hoursTouched, setHoursTouched] = useState(false);
  const totalHoursError = hoursError(totalHours, {
    label: "총 시수",
    required: hoursTouched || !!course,
  });

  // 검색 결과에 없는 기관·회차명을 그 자리에서 생성한다
  const createInstitution = async (name: string): Promise<string | null> => {
    try {
      const created = await postInstitution({ name });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      return created.id;
    } catch (e) {
      toast.error(toUserMessage(e));
      return null;
    }
  };
  const createSessionName = async (name: string): Promise<string | null> => {
    try {
      const created = await postSessionName({ name });
      queryClient.invalidateQueries({ queryKey: ["session-names"] });
      return created.id;
    } catch (e) {
      toast.error(toUserMessage(e));
      return null;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setInstitutionId(course?.institutionId ?? "");
    setSessionNameId(course?.sessionNameId ?? "");
    setName(course?.name ?? "");
    setCode(course?.courseCode ?? "");
    setTotalHours(
      course?.totalHours !== null && course?.totalHours !== undefined
        ? String(course.totalHours)
        : "",
    );
    setDescription(course?.description ?? "");
    setIsActive(course?.isActive ?? true);
    setConfirmMove(false);
    setHoursTouched(false);
  }, [isOpen, course]);

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        institution_id: institutionId,
        name: name.trim(),
        session_name_id: sessionNameId || null,
        // 수정에서 코드를 지우면 null 로 지운다 — undefined 는 키가 빠져 기존 코드가 남았다
        course_code: code.trim() || (course ? null : undefined),
        total_hours: Number(totalHours),
        description: description.trim() || null,
        is_active: isActive,
      };
      if (course) {
        // 기관을 바꾸면 서버가 연결된 일정·교육이력의 기관·사내/외부 구분까지 함께 맞춘다
        return patchCourse(course.id, input);
      }
      return postCourse(input);
    },
    onSuccess: () => {
      toast.success(course ? "과정을 수정했어요" : "과정을 등록했어요");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      // 과정명 변경은 서버가 연결된 이력의 과정명에 반영한다 — 연관 목록도 새로 읽는다
      queryClient.invalidateQueries({ queryKey: ["course-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["training-records"] });
      queryClient.invalidateQueries({ queryKey: ["course-links"] });
      setConfirmMove(false);
      onClose();
    },
    onError: (e: Error) => {
      setConfirmMove(false);
      toast.error(toUserMessage(e));
    },
  });

  const submit = () => {
    if (institutionChanged) {
      setConfirmMove(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <>
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={course ? "과정 수정" : "과정 등록"}
      description="이력 등록에서 과정을 선택하면 과정명·기관·시수가 자동으로 채워져요"
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: course ? "수정" : "등록",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !institutionId || !name.trim() || !isValidHours(totalHours),
          onClick: submit,
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>소속 기관 <span className="text-danger">*</span></Label>
          <SearchableSelect
            value={institutionId || null}
            onChange={(v) => setInstitutionId(v ?? "")}
            fetchPage={institutionFetcher}
            queryKeyPrefix={["options", "institutions"]}
            placeholder="기관 검색 · 선택"
            clearable={!course}
            // 수정 시에도 기관을 바로잡을 수 있다 — 연결된 일정·이력은 서버가 함께 옮긴다
            selectedLabel={
              course && institutionId === course.institutionId
                ? (course.institutionName ?? undefined)
                : undefined
            }
            onCreate={createInstitution}
            createLabel={(q) => `'${q}' 새 기관으로 추가`}
          />
          {institutionChanged && (
            <p role="status" className="text-11 text-warn">
              기관을 바꾸면 이 과정의 {linkSummary}의 기관과 사내·외부 구분이 함께 바뀌어요.
              이미 발급된 확인서·수료증은 바뀌지 않아요.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>회차명</Label>
          <SearchableSelect
            value={sessionNameId || null}
            onChange={(v) => setSessionNameId(v ?? "")}
            fetchPage={sessionNameFetcher}
            queryKeyPrefix={["options", "session-names"]}
            placeholder="회차명 검색 · 선택 (예: 2019년 1차)"
            clearable
            selectedLabel={course?.sessionName ?? undefined}
            onCreate={createSessionName}
            createLabel={(q) => `'${q}' 새 회차명으로 추가`}
          />
          <p className="text-11 text-ink-3">회차명 관리에서 새 회차명을 등록할 수 있어요</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <Label>과정명 <span className="text-danger">*</span></Label>
            <Input
              placeholder="예: 감리원 보수교육"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>과정코드</Label>
            {course ? (
              <Input placeholder="선택" value={code} onChange={(e) => setCode(e.target.value)} />
            ) : (
              <SearchableSelect
                value={code || null}
                onChange={(v) => setCode(v ?? "")}
                fetchPage={courseCodeFetcher}
                queryKeyPrefix={["options", "course-codes"]}
                placeholder="기존 코드 검색 · 선택"
                clearable
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <Label>
              총 시수 <span className="text-danger">*</span>
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={totalHours}
              onChange={(e) => {
                setTotalHours(e.target.value);
                setHoursTouched(true);
              }}
            />
            {totalHoursError && (
              <p role="alert" className="text-11 text-danger">{totalHoursError}</p>
            )}
          </div>
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
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-13 text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent] cursor-pointer"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            사용중 (해제하면 이력 등록에서 제외돼요)
          </label>
        </div>
      </div>
    </Dialog>
    <Dialog
      isOpen={confirmMove}
      onClose={() => setConfirmMove(false)}
      title="교육기관을 변경할까요?"
      description={`${course?.institutionName ?? "현재 기관"}에서 선택한 기관으로 옮겨요`}
      actions={[
        { label: "취소", onClick: () => setConfirmMove(false) },
        {
          label: "변경",
          variant: "primary",
          isLoading: mutation.isPending,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <ul className="list-disc space-y-1 pl-5 pt-1 text-13 text-ink-2">
        <li>{linkSummary}이 새 기관으로 함께 옮겨져요.</li>
        <li>새 기관이 사내가 아니면 외부교육으로 바뀌어 외부교육 합계(최근 3년 16시간)에 포함돼요.</li>
        <li>이미 발급된 확인서·수료증의 내용은 바뀌지 않아요.</li>
      </ul>
    </Dialog>
    </>
  );
}
