import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { SearchInput } from "@/src/shared/ui/search-input";
import { Label } from "@/src/shared/ui/label";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Select } from "@/src/shared/ui/select";
import {
  SearchableSelect,
  fetchOptions,
  type SearchableOption,
} from "@/src/shared/ui/searchable-select";
import { Textarea } from "@/src/shared/ui/textarea";
import { useDebouncedValue } from "@/src/shared/hooks/use-debounced-value";
import {
  getCourseDetail,
  patchCourse,
  postCourse,
  postInstitution,
} from "@/src/entities/institution";
import {
  patchTrainingRecord,
  postTrainingRecord,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  TRAINING_SOURCE_LABELS,
  type CompletionStatus,
  type TrainingRecord,
  type TrainingSource,
} from "@/src/entities/training-record";
import {
  getTraineeList,
  postTrainee,
  traineeQueries,
  type Trainee as TraineeEntity,
} from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 수정 대상 — null이면 신규 등록 */
  record: TrainingRecord | null;
  /** 외부 수료 뷰에서는 'external' 고정 */
  defaultSource: TrainingSource;
  /** 딥링크 등록 — 교육생 미리 선택 */
  presetTrainee?: TraineeEntity | null;
}

const institutionFetcher = fetchOptions("/institutions", {}, (i) => ({
  value: i.id as string,
  label: i.name as string,
}));

export function TrainingRecordFormDialog({
  isOpen,
  onClose,
  record,
  defaultSource,
  presetTrainee,
}: Props) {
  const queryClient = useQueryClient();

  const [trainee, setTrainee] = useState<TraineeEntity | null>(null);
  const [traineeSearch, setTraineeSearch] = useState("");
  const [traineeQuery, setTraineeQuery] = useState<string | null>(null);
  // 검색 결과가 없을 때 그 자리에서 교육생을 새로 만든다
  const [creatingTrainee, setCreatingTrainee] = useState(false);
  const [newTraineeBirth, setNewTraineeBirth] = useState("");
  const [newTraineePhone, setNewTraineePhone] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [institutionLabel, setInstitutionLabel] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [courseLabel, setCourseLabel] = useState<string | null>(null);
  /** 이 세션에서 그 자리 생성한 과정 — 저장 시 최종 총 시수를 마스터에 반영한다 */
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);
  const [totalHours, setTotalHours] = useState("");
  const [source, setSource] = useState<TrainingSource>(defaultSource);
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus>("completed");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [memo, setMemo] = useState("");

  const traineeDropdownRef = useRef<HTMLDivElement>(null);
  const debouncedTraineeSearch = useDebouncedValue(traineeSearch.trim(), 300);
  const [traineeDropdownOpen, setTraineeDropdownOpen] = useState(false);

  // 교육생 검색 — 클릭 시 펼침 + 무한 스크롤 (debounce 300ms)
  const traineeListQuery = useInfiniteQuery({
    queryKey: [...traineeQueries.lists(), { q: debouncedTraineeSearch, limit: 20 }],
    queryFn: ({ pageParam }) =>
      getTraineeList({ q: debouncedTraineeSearch || undefined, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: traineeDropdownOpen && !record && !trainee,
  });
  const traineeOptions = traineeListQuery.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (!traineeDropdownOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!traineeDropdownRef.current?.contains(e.target as Node)) setTraineeDropdownOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [traineeDropdownOpen]);

  // 검색 결과 없음 → 그 자리에서 생성하고 바로 선택. 교육생 관리와 같은 수기 등록 경로.
  const createTraineeMutation = useMutation({
    mutationFn: () =>
      postTrainee({
        name: traineeSearch.trim(),
        birth_date: newTraineeBirth || null,
        phone: newTraineePhone.trim() || undefined,
      }),
    onSuccess: (created) => {
      toast.success(`교육생을 등록했어요 — ${created.name}`);
      setTrainee(created);
      setCreatingTrainee(false);
      setTraineeQuery(null);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 검색 결과에 없는 기관·과정을 그 자리에서 만든다 — 기관·과정 마스터와 연동
  const createInstitution = async (name: string): Promise<string | null> => {
    try {
      const created = await postInstitution({ name });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      setInstitutionLabel(name);
      return created.id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const createCourse = async (name: string): Promise<string | null> => {
    if (!institutionId) {
      toast.error("기관을 먼저 선택해 주세요");
      return null;
    }
    try {
      const created = await postCourse({
        institution_id: institutionId,
        name,
        session_name_id: null,
        total_hours: totalHours === "" ? 0 : Number(totalHours),
        is_external: source === "external",
      });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setCourseLabel(name);
      setCreatedCourseId(created.id);
      return created.id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  // 열릴 때마다 폼 초기화 — record 있으면 수정값, 없으면 신규 기본값
  useEffect(() => {
    if (!isOpen) return;
    setTraineeQuery(null);
    setTraineeSearch("");
    setCreatingTrainee(false);
    setNewTraineeBirth("");
    setNewTraineePhone("");
    setCreatedCourseId(null);
    if (record) {
      setTrainee(
        record.traineeId
          ? {
              id: record.traineeId,
              traineeNo: record.traineeNo ?? "",
              certNo: null,
              supervisorGrade: null,
    seniorCertNo: null,
    seniorCertIssuedDate: null,
              name: record.traineeName ?? "",
              birthDate: null,
              phoneMasked: "",
              email: null,
              reviewStatus: "approved",
              membershipGradeId: null,
              gradeName: null,
              gradeExpiresAt: null,
              userId: null,
              memo: null,
              createdAt: "",
              updatedAt: "",
            }
          : null,
      );
      setInstitutionId(record.institutionId ?? "");
      setInstitutionLabel(record.institutionName ?? "");
      setCourseId(record.courseId ?? "");
      setCourseLabel(record.courseName);
      setTotalHours(record.totalHours !== null ? String(record.totalHours) : "");
      setSource(record.source);
      setCompletionStatus(record.completionStatus);
      setStartedAt(record.startedAt ?? "");
      setEndedAt(record.endedAt ?? "");
      setMemo(record.memo ?? "");
      if (record.courseId && !record.institutionId) {
        // courseId 만 있고 기관 연결이 없는 레거시 이력 — 과정 상세에서 기관을 채운다
        getCourseDetail(record.courseId).then((course) => {
          setInstitutionId(course.institutionId);
          setInstitutionLabel(course.institutionName);
        });
      }
    } else {
      setTrainee(presetTrainee ?? null);
      setInstitutionId("");
      setInstitutionLabel(null);
      setCourseId("");
      setCourseLabel(null);
      setTotalHours("");
      setSource(defaultSource);
      setCompletionStatus("completed");
      setStartedAt("");
      setEndedAt("");
      setMemo("");
    }
  }, [isOpen, record, presetTrainee, defaultSource]);

  // 기관 변경 — 과정은 기관 소속이라 선택을 무효로 한다
  const handleInstitutionChange = (value: string | null, option?: SearchableOption) => {
    setInstitutionId(value ?? "");
    setInstitutionLabel(option?.label ?? null);
    setCourseId("");
    setCourseLabel(null);
  };

  // 과정 마스터 선택 → 총 시수 스냅샷 자동 채움
  const handleCourseChange = (value: string | null, option?: SearchableOption) => {
    setCourseId(value ?? "");
    setCourseLabel(option?.label ?? null);
    // 생성한 과정에서 다른 과정으로 바꾸면 마스터 반영 대상에서 뺀다
    if (createdCourseId !== null && value !== createdCourseId) setCreatedCourseId(null);
    if (!value) return;
    // 스냅샷 채움은 과정 상세 조회 후 — 라벨만으로는 시수를 모른다
    getCourseDetail(value).then((course) => {
      setCourseLabel(course.name);
      // 방금 그 자리에서 만든 과정은 시수를 덮지 않는다 — 저장 시 최종 입력값으로 마스터를 맞춘다
      if (value !== createdCourseId) {
        setTotalHours(course.totalHours !== null ? String(course.totalHours) : "");
      }
    });
  };

  // 기관별 과정 검색 — 기관이 바뀌면 과정 목록도 새로 불러온다
  const courseFetcher = useMemo(
    () =>
      fetchOptions("/courses", institutionId ? { institution_id: institutionId } : {}, (c) => ({
        value: c.id as string,
        label: c.name as string,
      })),
    [institutionId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      // 그 자리에서 만든 과정은 저장 시 최종 총 시수를 마스터에 반영 — 생성 시점엔 시수가 비어 있을 수 있다
      if (createdCourseId) {
        await patchCourse(createdCourseId, {
          institution_id: institutionId,
          name: courseLabel?.trim() || "과정",
          session_name_id: null,
          total_hours: totalHours === "" ? 0 : Number(totalHours),
          is_external: source === "external",
          is_active: true,
        });
        queryClient.invalidateQueries({ queryKey: ["courses"] });
      }
      const input = {
        trainee_id: trainee!.id,
        course_id: courseId || null,
        institution_id: institutionId || null,
        total_hours: totalHours === "" ? null : Number(totalHours),
        started_at: startedAt || null,
        ended_at: endedAt || null,
        source,
        completion_status: completionStatus,
        memo: memo.trim() || null,
      };
      if (record) return patchTrainingRecord(record.id, input);
      return postTrainingRecord(input);
    },
    onSuccess: () => {
      toast.success(record ? "내역을 수정했어요" : "내역을 등록했어요");
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = useMemo(
    () => !!trainee && !!institutionId && !!courseId && !mutation.isPending,
    [trainee, institutionId, courseId, mutation.isPending],
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={record ? "교육내역 수정" : "교육내역 등록"}
      description={
        record
          ? `${record.traineeCertNo ?? ""} ${record.traineeName ?? ""}`
          : "기관·과정을 선택하면 시수가 자동으로 채워져요. 없는 값은 검색어로 바로 추가돼요"
      }
      actions={[
        { label: "취소", onClick: onClose },
        {
          label: record ? "수정" : "등록",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !canSubmit,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      <div className="space-y-4 pt-1">
        {/* 감리원 — 수정 시 고정 */}
        <div className="space-y-1.5">
          <Label>감리원</Label>
          {record ? (
            <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-13 text-ink">
              {trainee?.certNo} {trainee?.name}
            </p>
          ) : trainee ? (
            <div className="flex items-center justify-between rounded-md border border-accent-soft bg-accent-soft px-3 py-2">
              <span className="text-13 text-accent-ink">
                {trainee.certNo} · {trainee.name} · {trainee.phoneMasked}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setTrainee(null)}>
                변경
              </Button>
            </div>
          ) : (
            <div ref={traineeDropdownRef} className="relative">
              <SearchInput
                placeholder="클릭해서 성명(전체)으로 검색 · 선택"
                value={traineeSearch}
                onChange={(e) => {
                  setTraineeSearch(e.target.value);
                  setTraineeDropdownOpen(true);
                }}
                onFocus={() => setTraineeDropdownOpen(true)}
              />
              {traineeDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
                  <div
                    className="max-h-56 overflow-y-auto scrollbar-thin divide-y divide-line-2"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (
                        traineeListQuery.hasNextPage &&
                        !traineeListQuery.isFetchingNextPage &&
                        el.scrollHeight - el.scrollTop - el.clientHeight < 40
                      ) {
                        traineeListQuery.fetchNextPage();
                      }
                    }}
                  >
                    {traineeListQuery.isPending ? (
                      <p className="px-3 py-2 text-13 text-ink-3">불러오는 중...</p>
                    ) : traineeOptions.length === 0 ? (
                      <div className="space-y-2 px-3 py-2">
                        <p className="text-13 text-ink-3">검색 결과가 없어요</p>
                        {!creatingTrainee && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCreatingTrainee(true)}
                            disabled={!traineeSearch.trim()}
                          >
                            '{traineeSearch.trim()}' 신규 교육생으로 등록
                          </Button>
                        )}
                      </div>
                    ) : (
                      traineeOptions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-13 hover:bg-panel-2"
                          onClick={() => {
                            setTrainee(t);
                            setTraineeQuery(null);
                            setTraineeDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium text-ink">{t.name}</span>
                          <span className="ml-2 text-ink-3">
                            {t.certNo} · {t.phoneMasked}
                          </span>
                        </button>
                      ))
                    )}
                    {traineeListQuery.isFetchingNextPage && (
                      <p className="px-3 py-1.5 text-center text-12 text-ink-3">불러오는 중…</p>
                    )}
                  </div>
                  {/* 검색 결과 없음 → 그 자리에서 신규 생성 (기존 흐름 유지) */}
                  {traineeOptions.length === 0 && creatingTrainee && (
                    <div className="space-y-2 border-t border-line px-3 py-2">
                      <div className="grid grid-cols-3 gap-2">
                        <Input value={traineeSearch.trim()} disabled aria-label="성명" />
                        <DateField
                          ariaLabel="생년월일"
                          value={newTraineeBirth}
                          onChange={setNewTraineeBirth}
                        />
                        <Input
                          placeholder="전화번호 (선택)"
                          value={newTraineePhone}
                          onChange={(e) => setNewTraineePhone(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={createTraineeMutation.isPending}
                          onClick={() => createTraineeMutation.mutate()}
                        >
                          {createTraineeMutation.isPending ? "생성 중..." : "생성 후 선택"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCreatingTrainee(false)}>
                          취소
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 기관·과정 — 마스터 드롭다운, 없는 값은 그 자리에서 생성해 마스터와 연동 */}
        <div className="space-y-1.5">
          <Label>기관</Label>
          <SearchableSelect
            value={institutionId || null}
            onChange={handleInstitutionChange}
            fetchPage={institutionFetcher}
            queryKeyPrefix={["options", "record-institutions"]}
            placeholder="기관 검색 · 선택"
            selectedLabel={institutionLabel ?? undefined}
            clearable
            onCreate={createInstitution}
            createLabel={(q) => `'${q}' 새 기관으로 추가`}
          />
        </div>
        <div className="space-y-1.5">
          <Label>과정</Label>
          <SearchableSelect
            value={courseId || null}
            onChange={handleCourseChange}
            fetchPage={courseFetcher}
            queryKeyPrefix={["options", "record-courses", institutionId || "all"]}
            placeholder={institutionId ? "과정 검색 · 선택" : "기관을 먼저 선택하세요"}
            selectedLabel={courseLabel ?? undefined}
            disabled={!institutionId}
            clearable
            onCreate={createCourse}
            createLabel={(q) => `'${q}' 새 과정으로 추가`}
          />
          <p className="text-11 text-ink-3">
            과정을 선택하면 총 시수가 자동으로 채워져요. 없는 기관·과정은 검색어로 바로 추가할 수 있어요
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <div className="space-y-1.5">
            <Label>구분</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value as TrainingSource)}>
              {Object.entries(TRAINING_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>시작일</Label>
            <DateField
              ariaLabel="시작일"
              value={startedAt}
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
              value={endedAt}
              onChange={(v) => {
                setEndedAt(v);
                if (v && startedAt && v < startedAt) setStartedAt(v);
              }}
              minDate={startedAt || undefined}
            />
          </div>
        </div>

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

        <div className="space-y-1.5">
          <Label>메모</Label>
          <Textarea
            rows={2}
            placeholder="참고 사항"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
