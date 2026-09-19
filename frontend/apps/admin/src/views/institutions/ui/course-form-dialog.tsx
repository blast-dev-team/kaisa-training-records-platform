import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import {
  SearchableSelect,
  fetchOptions,
  type SearchableOption,
} from "@/src/shared/ui/searchable-select";
import { Textarea } from "@/src/shared/ui/textarea";
import { apiClient } from "@/src/shared/api";
import {
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

const institutionFetcher = fetchOptions("/institutions", {}, (i) => ({
  value: i.id as string,
  label: i.name as string,
}));

const sessionNameFetcher = fetchOptions("/session-names", {}, (s) => ({
  value: s.id as string,
  label: s.name as string,
}));

const courseCodeFetcher = fetchOptions("/courses", {}, (c) => ({
  value: c.course_code as string,
  label: c.course_code as string,
  hint: c.name as string | undefined,
}));

/** 분류 드롭다운 — distinct category (검색 가능) */
async function fetchCategoryPage(search: string, page: number) {
  const { data } = await apiClient.get<string[]>("/courses/categories", {
    params: { search: search || undefined },
  });
  return {
    items: data.map((v) => ({ value: v, label: v })),
    total: data.length,
    page: 1,
    limit: 100,
    total_pages: 1,
  } satisfies {
    items: SearchableOption[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

/** 과정 등록·수정 — 회차명(마스터)과 과정명을 분리해 관리한다 */
export function CourseFormDialog({ isOpen, onClose, course }: Props) {
  const queryClient = useQueryClient();
  const [institutionId, setInstitutionId] = useState("");
  const [sessionNameId, setSessionNameId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isExternal, setIsExternal] = useState(false);

  // 검색 결과에 없는 기관·회차명을 그 자리에서 생성한다
  const createInstitution = async (name: string): Promise<string | null> => {
    try {
      const created = await postInstitution({ name });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      return created.id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };
  const createSessionName = async (name: string): Promise<string | null> => {
    try {
      const created = await postSessionName({ name });
      queryClient.invalidateQueries({ queryKey: ["session-names"] });
      return created.id;
    } catch (e) {
      toast.error((e as Error).message);
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
    setCategory(course?.category ?? "");
    setDescription(course?.description ?? "");
    setIsActive(course?.isActive ?? true);
    setIsExternal(course?.isExternal ?? false);
  }, [isOpen, course]);

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        institution_id: institutionId,
        name: name.trim(),
        session_name_id: sessionNameId || null,
        is_external: isExternal,
        course_code: code.trim() || undefined,
        total_hours: Number(totalHours || 0),
        category: category.trim() || null,
        description: description.trim() || null,
        is_active: isActive,
      };
      return course ? patchCourse(course.id, input) : postCourse(input);
    },
    onSuccess: () => {
      toast.success(course ? "과정을 수정했어요" : "과정을 등록했어요");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
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
          isDisabled: !institutionId || !name.trim(),
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        <div className="space-y-1.5">
          <Label>소속 기관</Label>
          <SearchableSelect
            value={institutionId || null}
            onChange={(v) => setInstitutionId(v ?? "")}
            fetchPage={institutionFetcher}
            queryKeyPrefix={["options", "institutions"]}
            placeholder="기관 검색 · 선택"
            clearable={!course}
            selectedLabel={course?.institutionName ?? undefined}
            onCreate={createInstitution}
            createLabel={(q) => `'${q}' 새 기관으로 추가`}
          />
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
          <p className="text-[11px] text-ink-3">회차명 관리에서 새 회차명을 등록할 수 있어요</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
            <Label>과정명</Label>
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
            <Label>총 시수</Label>
            <Input
              type="number"
              min={0}
              placeholder="예: 8"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>분류</Label>
            <SearchableSelect
              value={category || null}
              onChange={(v) => setCategory(v ?? "")}
              fetchPage={fetchCategoryPage}
              queryKeyPrefix={["options", "course-categories"]}
              placeholder="분류 검색 · 선택 (예: 온라인)"
              clearable
            />
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
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent]"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            사용중 (해제하면 이력 등록에서 제외돼요)
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              className="size-4 accent-[--color-accent]"
              checked={isExternal}
              onChange={(e) => setIsExternal(e.target.checked)}
            />
            외부 교육과정 (감리원이 개인적으로 수료한 외부 교육)
          </label>
        </div>
      </div>
    </Dialog>
  );
}
