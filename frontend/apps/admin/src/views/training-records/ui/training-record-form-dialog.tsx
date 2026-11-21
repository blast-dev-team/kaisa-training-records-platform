import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { phoneError } from "@/src/shared/utils/phone";
import { useEffect, useMemo, useRef, useState } from "react";
import { hoursError, isValidHours } from "@/src/shared/utils/hours";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { ApiError } from "@/src/shared/api";
import { Button } from "@/src/shared/ui/button";
import {
  DuplicateCancelledError,
  useDuplicateConfirm,
} from "@/src/shared/ui/use-duplicate-confirm";
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
  isExternalInstitutionType,
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
import { ExternalHoursNotice, useExternalCap } from "./external-hours-notice";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 수정 대상 — null이면 신규 등록 */
  record: TrainingRecord | null;
  /** 딥링크 등록 — 교육생 미리 선택 */
  presetTrainee?: TraineeEntity | null;
}

const INSTITUTION_TYPE_HINT: Record<string, string> = { internal: "사내", external: "외부" };

/** 기관 옵션 — 보조 표기로 사내/외부 구분을 보여 주고, 외부교육 한도 판정용으로 구분값을 실어 둔다 */
const institutionFetcher = fetchOptions("/institutions", { is_active: true }, (i) => ({
  value: i.id as string,
  label: i.name as string,
  hint: INSTITUTION_TYPE_HINT[(i.institution_type as string) ?? ""] ?? "구분 미선택",
  meta: { institutionType: (i.institution_type as string | null) ?? null },
}));

/** 여러 명 등록에서 실패한 감리원 — 저장 후 이름과 사유를 한 번에 알린다 */
interface RegisterFailure {
  name: string;
  reason: string;
}

/** 저장 시 만들 새 과정의 자리표시 id — 서버로 보내지 않는다 */
const NEW_COURSE_ID = "__new_course__";

export function TrainingRecordFormDialog({ isOpen, onClose, record, presetTrainee }: Props) {
  const queryClient = useQueryClient();

  // 등록은 여러 감리원을 골라 같은 내역을 한 번에 만들 수 있다 — 수정은 해당 이력의 감리원 1명
  const [trainees, setTrainees] = useState<TraineeEntity[]>([]);
  /** 한 명만 골랐을 때의 감리원 — 외부교육 한도 미리보기·중복 확인 창은 1명일 때만 쓴다 */
  const singleTrainee = trainees.length === 1 ? trainees[0]! : null;
  const isSelected = (id: string) => trainees.some((t) => t.id === id);
  const toggleTrainee = (t: TraineeEntity) =>
    setTrainees((prev) => (prev.some((p) => p.id === t.id) ? prev.filter((p) => p.id !== t.id) : [...prev, t]));
  const [traineeSearch, setTraineeSearch] = useState("");
  const [traineeQuery, setTraineeQuery] = useState<string | null>(null);
  // 검색 결과가 없을 때 그 자리에서 교육생을 새로 만든다
  const [creatingTrainee, setCreatingTrainee] = useState(false);
  const [newTraineeBirth, setNewTraineeBirth] = useState("");
  const [newTraineePhone, setNewTraineePhone] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const [institutionLabel, setInstitutionLabel] = useState<string | null>(null);
  /** 선택한 기관 구분 — undefined 는 아직 기관을 고르지 않음(외부교육 한도 판정 안 함) */
  const [institutionType, setInstitutionType] = useState<string | null | undefined>(undefined);
  /** 구분은 기관 구분을 따른다 — 사내 기관이면 사내, 그 외(미선택·신규·외부)는 외부 */
  const derivedSource: TrainingSource = institutionType === "internal" ? "internal" : "external";
  const [courseId, setCourseId] = useState("");
  const [courseLabel, setCourseLabel] = useState<string | null>(null);
  /** 이 세션에서 그 자리 생성한 과정 — 저장 시 최종 총 시수를 마스터에 반영한다 */
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);
  // 저장 전까지 만들지 않은 새 과정의 이름 (courseId 는 NEW_COURSE_ID)
  const [pendingCourseName, setPendingCourseName] = useState<string | null>(null);
  const [totalHours, setTotalHours] = useState("");
  // 입력칸을 한 번이라도 건드린 뒤에만 "입력해 주세요" 안내 — 열자마자 빨간 문구가 뜨지 않게
  const [hoursTouched, setHoursTouched] = useState(false);
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
    enabled: traineeDropdownOpen && !record,
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
  const dupConfirm = useDuplicateConfirm();
  const createTraineeMutation = useMutation({
    mutationFn: () =>
      dupConfirm.withConfirm((allowDuplicate) =>
        postTrainee({
          name: traineeSearch.trim(),
          birth_date: newTraineeBirth || null,
          phone: newTraineePhone.trim() || undefined,
          allow_duplicate: allowDuplicate,
        }),
      ),
    onSuccess: (created) => {
      toast.success(`교육생을 등록했어요 — ${created.name}`);
      setTrainees((prev) => [...prev, created]);
      setTraineeSearch("");
      setCreatingTrainee(false);
      setTraineeQuery(null);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
    },
    onError: (e: Error) => {
      if (e instanceof DuplicateCancelledError) return;
      toast.error(toUserMessage(e));
    },
  });

  // 검색 결과에 없는 기관·과정을 그 자리에서 만든다 — 기관·과정 마스터와 연동
  const createInstitution = async (name: string): Promise<string | null> => {
    try {
      const created = await postInstitution({ name });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      setInstitutionLabel(name);
      setInstitutionType(null); // 그 자리에서 만든 기관은 구분 미선택 = 외부
      return created.id;
    } catch (e) {
      toast.error(toUserMessage(e));
      return null;
    }
  };

  // 새 과정은 바로 만들지 않고 이름만 잡아 둔다 — 저장할 때 입력한 총 시수로 함께 만든다.
  // (예전에는 추가 즉시 0시간 과정이 만들어져, 창을 닫으면 0시간 과정이 마스터에 남았다)
  const createCourse = async (name: string): Promise<string | null> => {
    if (!institutionId) {
      toast.error("기관을 먼저 선택해 주세요");
      return null;
    }
    setPendingCourseName(name);
    setCourseLabel(name);
    return NEW_COURSE_ID;
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
    setPendingCourseName(null);
    if (record) {
      setTrainees(
        record.traineeId
          ? [{
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
            }]
          : [],
      );
      setInstitutionId(record.institutionId ?? "");
      setInstitutionLabel(record.institutionName ?? "");
      setInstitutionType(record.institutionType);
      setCourseId(record.courseId ?? "");
      setCourseLabel(record.courseName);
      setTotalHours(record.totalHours !== null ? String(record.totalHours) : "");
      setCompletionStatus(record.completionStatus);
      setStartedAt(record.startedAt ?? "");
      setEndedAt(record.endedAt ?? "");
      // 기존 메모를 불러온다 — 비워 두면 저장 시 memo:null 로 기존 메모가 지워졌다.
      // 신규 등록 창에서 쓰다 만 메모가 다른 이력 수정에 따라오지 않게 항상 덮어쓴다
      setMemo(record.memo ?? "");
      if (record.courseId && !record.institutionId) {
        // courseId 만 있고 기관 연결이 없는 레거시 이력 — 과정 상세에서 기관을 채운다
        getCourseDetail(record.courseId).then((course) => {
          setInstitutionId(course.institutionId);
          setInstitutionLabel(course.institutionName);
          setInstitutionType(course.institutionType);
        });
      }
    } else {
      setTrainees(presetTrainee ? [presetTrainee] : []);
      setInstitutionId("");
      setInstitutionLabel(null);
      setInstitutionType(undefined);
      setCourseId("");
      setCourseLabel(null);
      setTotalHours("");
      setHoursTouched(false);
      setCompletionStatus("completed");
      setStartedAt("");
      setEndedAt("");
      setMemo("");
    }
  }, [isOpen, record, presetTrainee]);

  // 기관 변경 — 과정은 기관 소속이라 선택을 무효로 한다
  const handleInstitutionChange = (value: string | null, option?: SearchableOption) => {
    setInstitutionId(value ?? "");
    setInstitutionLabel(option?.label ?? null);
    setInstitutionType(
      value ? ((option?.meta?.institutionType as string | null | undefined) ?? null) : undefined,
    );
    setCourseId("");
    setCourseLabel(null);
    // 다른 기관으로 바꾸면 방금 만든(또는 만들 예정인) 과정은 더 이상 대상이 아니다
    setCreatedCourseId(null);
    setPendingCourseName(null);
  };

  // 과정 상세 응답 경합 방지 — 늦게 도착한 이전 과정의 응답이 지금 선택을 덮지 않게
  const latestCourseRequest = useRef<string | null>(null);

  // 과정 마스터 선택 → 총 시수 스냅샷 자동 채움
  const handleCourseChange = (value: string | null, option?: SearchableOption) => {
    latestCourseRequest.current = value;
    setCourseId(value ?? "");
    setCourseLabel(option?.label ?? null);
    // 새 과정(저장 시 생성) — 상세 조회할 과정이 아직 없다. 총 시수는 직접 입력한다
    if (value === NEW_COURSE_ID) return;
    // 다른 과정으로 바꾸면 새 과정 예약·이전 저장 시도에서 만든 과정은 대상에서 뺀다
    setPendingCourseName(null);
    setCreatedCourseId(null);
    if (!value) return;
    // 스냅샷 채움은 과정 상세 조회 후 — 라벨만으로는 시수를 모른다
    getCourseDetail(value).then((course) => {
      if (latestCourseRequest.current !== value) return;
      setCourseLabel(course.name);
      setTotalHours(course.totalHours !== null ? String(course.totalHours) : "");
    });
  };

  // 기관별 과정 검색 — 기관이 바뀌면 과정 목록도 새로 불러온다
  const courseFetcher = useMemo(
    () =>
      fetchOptions(
        "/courses",
        institutionId ? { institution_id: institutionId, is_active: true } : { is_active: true },
        (c) => ({
          value: c.id as string,
          label: c.name as string,
        }),
      ),
    [institutionId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      // 새 과정은 저장하는 이 시점에 입력한 총 시수로 만든다 (총 시수는 canSubmit 에서 필수).
      // 이전 저장 시도에서 과정만 만들어지고 내역 저장이 실패했다면 다시 만들지 않고 그 과정을 고친다
      let finalCourseId = courseId;
      if (courseId === NEW_COURSE_ID) {
        const coursePayload = {
          institution_id: institutionId,
          name: (pendingCourseName ?? courseLabel ?? "").trim(),
          session_name_id: null,
          total_hours: Number(totalHours),
          is_external: derivedSource === "external",
        };
        if (createdCourseId) {
          await patchCourse(createdCourseId, { ...coursePayload, is_active: true });
          finalCourseId = createdCourseId;
        } else {
          const created = await postCourse(coursePayload);
          setCreatedCourseId(created.id);
          finalCourseId = created.id;
        }
        queryClient.invalidateQueries({ queryKey: ["courses"] });
      }
      const input = {
        course_id: finalCourseId || null,
        institution_id: institutionId || null,
        total_hours: Number(totalHours),
        started_at: startedAt || null,
        ended_at: endedAt || null,
        source: derivedSource,
        completion_status: completionStatus,
        memo: memo.trim() || null,
      };
      if (record) {
        await patchTrainingRecord(record.id, { trainee_id: trainees[0]!.id, ...input });
        return { created: 0, failed: [] as RegisterFailure[] };
      }
      if (singleTrainee) {
        // 1명 — 중복이면 확인 창을 띄우고 확인하면 강제 등록(기존 흐름)
        await dupConfirm.withConfirm((allowDuplicate) =>
          postTrainingRecord({ trainee_id: singleTrainee.id, ...input, allow_duplicate: allowDuplicate }),
        );
        return { created: 1, failed: [] as RegisterFailure[] };
      }
      // 여러 명 — 감리원마다 등록하고, 실패(중복·외부교육 한도 등)는 이름과 사유를 모아 알린다.
      // 확인 창을 감리원마다 띄우면 누구 건인지 알 수 없어 중복은 건너뛴다
      const failed: RegisterFailure[] = [];
      let created = 0;
      for (const t of trainees) {
        try {
          await postTrainingRecord({ trainee_id: t.id, ...input });
          created += 1;
        } catch (e) {
          failed.push({
            name: t.name,
            reason:
              e instanceof ApiError && e.code === "DUPLICATE_TRAINING_RECORD"
                ? "이미 같은 교육내역이 있어요"
                : toUserMessage(e),
          });
        }
      }
      return { created, failed };
    },
    onSuccess: ({ created, failed }) => {
      if (created > 0 || record) {
        queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      }
      if (record) {
        toast.success("내역을 수정했어요");
        onClose();
        return;
      }
      const failedText = failed.map((f) => `${f.name}(${f.reason})`).join(", ");
      if (failed.length === 0) {
        toast.success(created > 1 ? `내역을 ${created}명 등록했어요` : "내역을 등록했어요");
        onClose();
      } else if (created > 0) {
        // 일부 성공 — 다시 저장하면 성공한 감리원이 중복되므로 창을 닫고 실패 건을 알린다
        toast.warning(`${created}명 등록, ${failed.length}명은 등록하지 못했어요 — ${failedText}`, {
          autoClose: false,
        });
        onClose();
      } else {
        toast.error(`등록하지 못했어요 — ${failedText}`);
      }
    },
    onError: (e: Error) => {
      if (e instanceof DuplicateCancelledError) return;
      toast.error(toUserMessage(e));
    },
  });

  // 외부교육 최근 3년 한도(16시간) — 서버가 최종 판정하고, 여기선 저장 전에 미리 막는다
  const externalCap = useExternalCap({
    traineeId: singleTrainee?.id ?? null,
    institutionType,
    startedAt,
    totalHours,
    completionStatus,
    record,
  });
  const externalBlocked = externalCap.result?.blocked ?? false;

  // 시수는 필수·0 이상 — 비우면 서버가 422(예전엔 500), 음수는 외부교육 한도를 우회할 수 있었다
  const hoursValid = isValidHours(totalHours);
  // 과정을 고른 뒤(또는 수정 중·날짜 하나만 입력)부터 빈 기간을 알린다 — 열자마자 빨간 문구 X
  const periodMissing =
    (!!record || !!courseId || !!startedAt || !!endedAt) && (!startedAt || !endedAt);
  const totalHoursError = hoursError(totalHours, {
    label: "총 시수",
    required: hoursTouched || !!record,
  });
  const canSubmit = useMemo(
    () =>
      trainees.length > 0 &&
      !!institutionId &&
      !!courseId &&
      // 수강 기간 필수 — 기간 없는 이력은 확인서 발급이 잠기고 외부교육 한도 검사에서 빠진다
      !!startedAt &&
      !!endedAt &&
      hoursValid &&
      !mutation.isPending &&
      !externalBlocked,
    [
      trainees.length,
      institutionId,
      courseId,
      startedAt,
      endedAt,
      hoursValid,
      mutation.isPending,
      externalBlocked,
    ],
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
          label: record ? "수정" : trainees.length > 1 ? `${trainees.length}명 등록` : "등록",
          variant: "primary",
          isLoading: mutation.isPending,
          isDisabled: !canSubmit,
          onClick: () => mutation.mutate(),
        },
      ]}
    >
      {/* 중복 경고 — 포털로 뜨므로 위치는 무관 */}
      {dupConfirm.dialog}
      <div className="space-y-4 pt-1">
        {/* 감리원 — 수정 시 고정 */}
        <div className="space-y-1.5">
          <Label>감리원 <span className="text-danger">*</span></Label>
          {record ? (
            <p className="rounded-md border border-line bg-panel-2 px-3 py-2 text-13 text-ink">
              {trainees[0]?.certNo} {trainees[0]?.name}
            </p>
          ) : (
            <>
            {trainees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {trainees.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-md border border-accent-soft bg-accent-soft px-2 py-1 text-12 text-accent-ink"
                  >
                    {t.name}
                    {(t.seniorCertNo ?? t.certNo) && (
                      <span className="text-ink-3">{t.seniorCertNo ?? t.certNo}</span>
                    )}
                    <button
                      type="button"
                      aria-label={`${t.name} 선택 해제`}
                      className="ml-0.5 text-ink-3 hover:text-ink"
                      onClick={() => toggleTrainee(t)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div ref={traineeDropdownRef} className="relative">
              <SearchInput
                placeholder="클릭해서 성명으로 검색 · 여러 명 선택 가능"
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
                          aria-pressed={isSelected(t.id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-13 hover:bg-panel-2 ${
                            isSelected(t.id) ? "bg-accent-soft/60" : ""
                          }`}
                          // 여러 명을 이어서 고를 수 있게 목록을 닫지 않는다 — 다시 누르면 선택 해제
                          onClick={() => {
                            toggleTrainee(t);
                            setTraineeQuery(null);
                          }}
                        >
                          <input
                            type="checkbox"
                            readOnly
                            tabIndex={-1}
                            checked={isSelected(t.id)}
                            className="size-4 accent-[--color-accent] pointer-events-none"
                          />
                          <span className="font-medium text-ink">{t.name}</span>
                          <span className="ml-2 text-ink-3">
                            {t.seniorCertNo ?? t.certNo ?? t.traineeNo} · {t.phoneMasked}
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
                          aria-invalid={!!phoneError(newTraineePhone) || undefined}
                          onChange={(e) => setNewTraineePhone(e.target.value)}
                        />
                      </div>
                      {phoneError(newTraineePhone) && (
                        <p role="alert" className="text-11 text-danger">
                          {phoneError(newTraineePhone)}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={createTraineeMutation.isPending || !!phoneError(newTraineePhone)}
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
            {trainees.length > 1 && (
              <p className="text-11 text-ink-3">
                {trainees.length}명에게 같은 내역을 등록해요. 이미 같은 내역이 있거나 외부교육 한도를
                넘는 감리원은 저장할 때 제외하고 알려 드려요
              </p>
            )}
            </>
          )}
        </div>

        {/* 기관·과정 — 마스터 드롭다운, 없는 값은 그 자리에서 생성해 마스터와 연동 */}
        <div className="space-y-1.5">
          <Label>기관 <span className="text-danger">*</span></Label>
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
          <Label>과정 <span className="text-danger">*</span></Label>
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
            createLabel={(q) =>
              courseId === NEW_COURSE_ID ? `'${q}'(으)로 과정명 수정` : `'${q}' 새 과정으로 추가`
            }
            // 다시 열면 입력했던 과정명이 검색창에 남아 있어 이어서 고칠 수 있다
            keepSearchText
          />
          <p className="text-11 text-ink-3">
            {courseId === NEW_COURSE_ID
              ? "새 과정은 내역을 저장할 때 입력한 총 시수로 함께 등록돼요"
              : "과정을 선택하면 총 시수가 자동으로 채워져요. 없는 기관·과정은 검색어로 바로 추가할 수 있어요"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>
              시작일 <span className="text-danger">*</span>
            </Label>
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
            <Label>
              종료일 <span className="text-danger">*</span>
            </Label>
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
        {periodMissing && (
          <p role="alert" className="-mt-1.5 text-11 text-danger">
            {!startedAt && !endedAt
              ? "시작일과 종료일을 입력해 주세요"
              : !startedAt
                ? "시작일을 입력해 주세요"
                : "종료일을 입력해 주세요"}
          </p>
        )}

        <div className="space-y-1.5">
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
          {totalHoursError ? (
            <p role="alert" className="text-11 text-danger">
              {totalHoursError}
            </p>
          ) : (
            <p className="text-11 text-ink-3">입력한 총 시수가 이수 시수로 인정돼요</p>
          )}
          <ExternalHoursNotice
            summary={externalCap.summary}
            result={externalCap.result}
            isExternal={institutionType !== undefined && isExternalInstitutionType(institutionType)}
          />
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
