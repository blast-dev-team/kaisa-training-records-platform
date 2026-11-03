import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Search, Upload, UserPlus } from "lucide-react";
import { Dialog } from "@/src/shared/ui/dialog";
import { Button } from "@/src/shared/ui/button";
import { FileDropZone } from "@/src/shared/ui/file-drop-zone";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Pill } from "@/src/shared/ui/pill";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import {
  DuplicateCancelledError,
  useDuplicateConfirm,
} from "@/src/shared/ui/use-duplicate-confirm";
import { postTrainee, traineeQueries } from "@/src/entities/trainee";
import {
  postTrainingRecordImportConfirm,
  postTrainingRecordImportPreview,
  trainingRecordQueries,
  type TrainingRecordImportResult,
} from "@/src/entities/training-record";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** 프리뷰 1행 — 엑셀에서 읽은 값을 사용자가 고칠 수 있는 형태 */
interface ImportDraft {
  key: string;
  fileIndex: number;
  fileName: string;
  rowNumber: number;
  name: string;
  certNo: string;
  institution: string;
  subject: string;
  startDate: string;
  endDate: string;
  hoursTotal: string;
  traineeId: string | null;
  traineeName: string | null;
  institutionExists: boolean;
  courseExists: boolean;
  /** 같은 감리원·과정명·시작일 내역이 이미 있음 — 확정해도 서버가 건너뛰므로 포함 불가 */
  isDuplicate: boolean;
  errors: string[];
  include: boolean;
}

type Stage = "select" | "preview" | "result";

/** 감리원 매칭 관련 오류 — 감리원을 연결하면 사라져야 하는 것만. 날짜·기관 오류는 남긴다 */
const withoutTraineeErrors = (errors: string[]) => errors.filter((e) => !e.includes("감리원"));
/** 같은 사람 판별 키 — 공백 차이는 무시(감리원증번호 비교 기준과 동일) */
const sameKey = (v: string) => v.replace(/\s+/g, "");
type MatchingFilter = "all" | "matched" | "unmatched";

/** 미매칭 행 — 교육생 직접 추가용 폼 값 */
interface AddTraineeForm {
  name: string;
  birthDate: string;
  certNo: string;
  phone: string;
}

/** 교육내역 엑셀 일괄 등록 — 업로드 → 프리뷰(편집) → 확정 3단 */
export function TrainingRecordImportDialog({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSeqRef = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("select");
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [result, setResult] = useState<TrainingRecordImportResult | null>(null);
  const [matchingFilter, setMatchingFilter] = useState<MatchingFilter>("all");
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<AddTraineeForm>({
    name: "",
    birthDate: "",
    certNo: "",
    phone: "",
  });
  const [searchingKey, setSearchingKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) return;
    setFiles([]);
    setStage("select");
    setDrafts([]);
    setFileNames([]);
    setResult(null);
    setMatchingFilter("all");
    setAddingKey(null);
    fileSeqRef.current = 0;
  }, [isOpen]);

  const setDraft = (key: string, patch: Partial<ImportDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  /**
   * 미매칭 행에 감리원을 연결한다. 이름·감리원증번호가 같은 다른 미매칭 행도 같은 사람으로
   * 보고 함께 연결한다 — 한 사람의 교육 여러 건을 행마다 다시 찾지 않게.
   * 감리원 관련 오류만 지우고 날짜 등 다른 오류는 남겨 등록에서 빠지게 한다.
   * 교육생 등록 응답 뒤에 호출되므로 최신 state 에 적용한다(그 사이 편집을 덮지 않게).
   * @returns 함께 연결된 다른 행 수
   */
  const assignTrainee = (
    key: string,
    trainee: { id: string; name: string },
    certNo?: string,
  ): number => {
    const link = (rows: ImportDraft[]) => {
      const source = rows.find((d) => d.key === key);
      if (!source) return { rows, linkedOthers: 0 };
      const nameKey = sameKey(source.name);
      const certKey = sameKey(source.certNo);
      let linkedOthers = 0;
      const next = rows.map((d) => {
        const isSource = d.key === key;
        const isSamePerson =
          !isSource &&
          !d.traineeId &&
          nameKey !== "" &&
          sameKey(d.name) === nameKey &&
          sameKey(d.certNo) === certKey;
        if (!isSource && !isSamePerson) return d;
        if (isSamePerson) linkedOthers += 1;
        const errors = withoutTraineeErrors(d.errors);
        return {
          ...d,
          traineeId: trainee.id,
          traineeName: trainee.name,
          certNo: isSource && certNo !== undefined ? certNo : d.certNo,
          errors,
          include: errors.length === 0 && !d.isDuplicate,
        };
      });
      return { rows: next, linkedOthers };
    };
    setDrafts((prev) => link(prev).rows);
    // 토스트용 개수 — 렌더 시점 목록 기준(연결 대상 판정은 위 updater 가 최신 목록으로 다시 한다)
    return link(drafts).linkedOthers;
  };

  const previewMutation = useMutation({
    mutationFn: (f: File) => postTrainingRecordImportPreview(f),
    onSuccess: ({ rows }, f) => {
      const fi = fileSeqRef.current++;
      setFileNames((prev) => [...prev, f.name]);
      setDrafts((prev) => [
        ...prev,
        ...rows.map((r) => ({
          key: `${fi}-${r.row_number}`,
          fileIndex: fi,
          fileName: f.name,
          rowNumber: r.row_number,
          name: r.name ?? "",
          certNo: r.cert_no ?? "",
          institution: r.institution ?? "",
          subject: r.subject ?? "",
          startDate: r.start_date ?? "",
          endDate: r.end_date ?? "",
          hoursTotal: r.hours_total ?? "",
          traineeId: r.trainee_id ?? null,
          traineeName: r.trainee_name ?? null,
          institutionExists: r.institution_exists,
          courseExists: r.course_exists,
          isDuplicate: r.is_duplicate,
          errors: r.errors,
          // 감리원 미매칭·오류·중복 행은 기본 제외
          include: r.trainee_id !== null && r.errors.length === 0 && !r.is_duplicate,
        })),
      ]);
      setStage("preview");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewFiles = async (picked: File[]) => {
    for (const f of picked) {
      try {
        await previewMutation.mutateAsync(f);
      } catch {
        // onError에서 토스트 표시됨
      }
    }
  };

  // 미매칭 행 → 교육생 직접 추가 (이름·생년월일·증번호·전화)
  const dupConfirm = useDuplicateConfirm();
  const createTraineeMutation = useMutation({
    mutationFn: (vars: { key: string; form: AddTraineeForm }) =>
      dupConfirm.withConfirm((allowDuplicate) =>
        postTrainee({
          name: vars.form.name.trim(),
          birth_date: vars.form.birthDate || undefined,
          cert_no: vars.form.certNo.trim() || undefined,
          phone: vars.form.phone.trim() || undefined,
          allow_duplicate: allowDuplicate,
        }),
      ),
    onSuccess: (trainee, vars) => {
      const linkedOthers = assignTrainee(vars.key, trainee, vars.form.certNo);
      setAddingKey(null);
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      toast.success(
        linkedOthers > 0
          ? `'${trainee.name}' 감리원을 새로 등록하고 같은 사람의 다른 ${linkedOthers}행에도 연결했어요`
          : `'${trainee.name}' 감리원을 새로 등록하고 선택했어요`,
      );
    },
    onError: (e: Error) => {
      if (e instanceof DuplicateCancelledError) return;
      toast.error(e.message);
    },
  });

  // 미매칭 행 감리원 검색 — 이름 또는 감리원증번호로 검색
  const searchQ = searchQuery.trim();
  const { data: searchResults } = useQuery({
    ...traineeQueries.list({ q: searchQ, limit: 5 }),
    enabled: searchingKey !== null && searchQ.length >= 2,
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      const items = drafts
        .filter((d) => d.include && d.traineeId)
        .map((d) => ({
          row_number: d.rowNumber,
          name: d.name.trim(),
          cert_no: d.certNo.trim() || null,
          institution: d.institution.trim(),
          subject: d.subject.trim(),
          start_date: d.startDate || null,
          end_date: d.endDate || null,
          hours_total: d.hoursTotal || null,
          trainee_id: d.traineeId as string,
        }));
      return postTrainingRecordImportConfirm(items);
    },
    onSuccess: (data) => {
      setResult(data);
      setStage("result");
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      toast.success(`교육내역 ${data.created}건을 등록했어요`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matchedCount = drafts.filter((d) => d.traineeId).length;
  const duplicateCount = drafts.filter((d) => d.isDuplicate).length;
  const unmatchedCount = drafts.length - matchedCount;
  const filtered =
    matchingFilter === "all"
      ? drafts
      : drafts.filter((d) =>
          matchingFilter === "matched" ? d.traineeId : !d.traineeId,
        );

  const included = drafts.filter((d) => d.include && d.traineeId);
  const hasBlockingError = included.some((d) => !d.traineeId || d.errors.length > 0);

  const gridCols =
    "grid grid-cols-[36px_110px_170px_180px_180px_120px_110px_90px_auto] gap-1.5";

  const actions =
    stage === "preview"
      ? [
          { label: "취소", onClick: onClose },
          {
            label: `${included.length}건 등록`,
            variant: "primary" as const,
            isLoading: confirmMutation.isPending,
            isDisabled: included.length === 0 || hasBlockingError,
            onClick: () => confirmMutation.mutate(),
          },
        ]
      : [
          {
            label: stage === "result" ? "닫기" : "취소",
            variant: "secondary" as const,
            onClick: onClose,
          },
        ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title="교육내역 엑셀 등록"
      description={
        stage === "select"
          ? "헤더가 교육생명·감리원증번호·교육기관명·과목명·시작일자·종료일자·교육시간인 엑셀(.xlsx)을 올려요 — 기관이 매칭되면 내부 교육, 아니면 외부 교육으로 등록돼요"
          : undefined
      }
      actions={actions}
    >
      {/* 중복 경고 — 포털로 뜨므로 위치는 무관 */}
      {dupConfirm.dialog}
      {stage === "select" && (
        <div className="space-y-3">
          <FileDropZone
            multiple
            onClick={() => fileInputRef.current?.click()}
            onFiles={setFiles}
          >
            {files.length === 0
              ? "클릭하거나 엑셀 파일을 끌어다 놓으세요"
              : files.length === 1
                ? files[0]?.name
                : `${files[0]?.name} 외 ${files.length - 1}개`}
          </FileDropZone>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setFiles(picked);
              e.target.value = "";
            }}
          />
          <Button
            className="w-full"
            disabled={files.length === 0 || previewMutation.isPending}
            onClick={() => previewFiles(files)}
          >
            <Upload className="size-4" />
            {previewMutation.isPending
              ? "읽는 중..."
              : files.length > 1
                ? `${files.length}개 파일 읽기`
                : "파일 읽기"}
          </Button>
        </div>
      )}

      {stage === "preview" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["all", "matched", "unmatched"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`rounded-full px-3 py-1 text-12 font-medium border ${
                    matchingFilter === f
                      ? "bg-accent-soft border-accent-soft text-accent"
                      : "bg-panel border-line text-ink-2"
                  }`}
                  onClick={() => setMatchingFilter(f)}
                >
                  {f === "all"
                    ? `전체 ${drafts.length}`
                    : f === "matched"
                      ? `매칭 ${matchedCount}`
                      : `미매칭 ${unmatchedCount}`}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-12 text-ink-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={
                  included.length > 0 &&
                  included.length === drafts.filter((d) => d.traineeId && !d.isDuplicate).length
                }
                onChange={(e) =>
                  setDrafts((prev) =>
                    prev.map((d) => ({
                      ...d,
                      // 미매칭 행은 교육생 추가 전까지, 중복 행은 항상 체크 불가
                      include: d.traineeId && !d.isDuplicate ? e.target.checked : false,
                    })),
                  )
                }
              />
              전체 포함
            </label>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <div className="min-w-[1150px] space-y-1.5">
              <div className={`${gridCols} sticky top-0 z-10 items-center bg-panel py-1 px-2.5`}>
                <span />
                <Label className="text-11 text-ink-3">
                  교육생명<span className="text-danger">*</span>
                </Label>
                <Label className="text-11 text-ink-3">감리원증번호</Label>
                <Label className="text-11 text-ink-3">
                  교육기관명<span className="text-danger">*</span>
                </Label>
                <Label className="text-11 text-ink-3">
                  과목명<span className="text-danger">*</span>
                </Label>
                <Label className="text-11 text-ink-3">시작일자</Label>
                <Label className="text-11 text-ink-3">종료일자</Label>
                <Label className="text-11 text-ink-3">교육시간</Label>
                <Label className="text-11 text-ink-3">상태</Label>
              </div>
              <div className="space-y-1.5">
                {filtered.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <div
                      className={`${gridCols} items-center rounded-lg border border-line px-2.5 py-2 ${
                        d.include ? "" : "opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-accent disabled:opacity-40"
                        disabled={!d.traineeId || d.isDuplicate}
                        checked={d.include}
                        onChange={(e) => setDraft(d.key, { include: e.target.checked })}
                      />
                      {/* 매칭된 행 — 감리원·기관·과정 정보는 수정 불가 */}
                      <Input disabled value={d.name} onChange={() => {}} />
                      <Input disabled value={d.certNo} onChange={() => {}} />
                      <Input disabled value={d.institution} onChange={() => {}} />
                      <Input disabled value={d.subject} onChange={() => {}} />
                      <Input
                        disabled={!d.include}
                        value={d.startDate}
                        onChange={(e) => setDraft(d.key, { startDate: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        value={d.endDate}
                        onChange={(e) => setDraft(d.key, { endDate: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        value={d.hoursTotal}
                        onChange={(e) => setDraft(d.key, { hoursTotal: e.target.value })}
                      />
                      <span className="flex flex-wrap items-center gap-1">
                        {d.traineeId ? (
                          <Pill tone="ok">매칭</Pill>
                        ) : (
                          <Pill tone="warn">미매칭</Pill>
                        )}
                        {d.isDuplicate && <Pill tone="danger">이미 등록됨</Pill>}
                        {!d.institutionExists && <Pill tone="info">기관 신규</Pill>}
                        {!d.courseExists && <Pill tone="info">과정 신규</Pill>}
                      </span>
                    </div>
                    {/* 신규 생성 표시 + 오류 — 행 아래 라인 */}
                    {d.errors.length > 0 && (
                      <p className="pl-10 text-11 text-danger">{d.errors.join(" · ")}</p>
                    )}
                    {!d.traineeId && addingKey !== d.key && (
                      <p className="flex items-center gap-2 pl-10">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAddForm({
                              name: d.name,
                              birthDate: "",
                              certNo: d.certNo,
                              phone: "",
                            });
                            setAddingKey(d.key);
                            setSearchingKey(null);
                          }}
                        >
                          <UserPlus className="size-3.5" /> 교육생 직접 추가
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchQuery(d.name);
                            setSearchingKey(d.key);
                            setAddingKey(null);
                          }}
                        >
                          <Search className="size-3.5" /> 기존 감리원 검색
                        </Button>
                      </p>
                    )}
                    {!d.traineeId && addingKey === d.key && (
                      <div className="ml-10 flex items-end gap-2 rounded-lg border border-line bg-bg p-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-11 text-ink-3">성명 *</Label>
                          <Input
                            value={addForm.name}
                            onChange={(e) =>
                              setAddForm((p) => ({ ...p, name: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-11 text-ink-3">생년월일</Label>
                          <DateField
                            ariaLabel={`생년월일 ${d.key}`}
                            value={addForm.birthDate}
                            onChange={(v) => setAddForm((p) => ({ ...p, birthDate: v }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-11 text-ink-3">감리원증번호</Label>
                          <Input
                            value={addForm.certNo}
                            onChange={(e) =>
                              setAddForm((p) => ({ ...p, certNo: e.target.value }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-11 text-ink-3">전화번호</Label>
                          <Input
                            value={addForm.phone}
                            onChange={(e) =>
                              setAddForm((p) => ({ ...p, phone: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          className="mb-0.5"
                          disabled={!addForm.name.trim() || createTraineeMutation.isPending}
                          onClick={() =>
                            createTraineeMutation.mutate({ key: d.key, form: addForm })
                          }
                        >
                          {createTraineeMutation.isPending ? "등록 중..." : "등록"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mb-0.5"
                          onClick={() => setAddingKey(null)}
                        >
                          취소
                        </Button>
                      </div>
                    )}
                    {!d.traineeId && searchingKey === d.key && (
                      <div className="ml-10 space-y-1 rounded-lg border border-line bg-bg p-3">
                        <Input
                          placeholder="이름 또는 감리원증번호로 검색"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          autoFocus
                        />
                        {searchQ.length >= 2 && (searchResults?.items ?? []).map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-left text-13 hover:bg-panel-2"
                            onClick={() => {
                              const linkedOthers = assignTrainee(d.key, t);
                              setSearchingKey(null);
                              if (linkedOthers > 0) {
                                toast.success(
                                  `'${t.name}' 감리원을 같은 사람의 다른 ${linkedOthers}행에도 연결했어요`,
                                );
                              }
                            }}
                          >
                            <span className="font-medium text-ink">{t.name}</span>
                            <span className="text-ink-3">{t.traineeNo}</span>
                            <span className="text-ink-3">{t.certNo}</span>
                            <span className="text-ink-3">{t.supervisorGrade ?? "—"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-12 text-ink-3">
            감리원이 매칭된 행만 등록돼요 — 미매칭 행은 '교육생 직접 추가'로 감리원을 등록한 뒤 포함할 수 있어요.
            {duplicateCount > 0 &&
              ` 같은 감리원·과정명·시작일 내역이 이미 있는 ${duplicateCount}행은 등록에서 빠져요.`}
            마스터에 없는 기관·과정은 등록 시 자동 생성돼요.
          </p>
        </div>
      )}

      {stage === "result" && result && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg bg-ok-soft px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ok-ink">{result.created}</p>
              <p className="text-12 text-ok-ink">등록</p>
            </div>
            <div className="flex-1 rounded-lg bg-panel-2 px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ink">{result.skipped}</p>
              <p className="text-12 text-ink-3">중복 제외</p>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="rounded-lg border border-danger-soft bg-danger-soft/40 px-3 py-2">
              <p className="mb-1 text-12 font-medium text-danger">
                등록 못한 행 {result.failed.length}건
              </p>
              <ul className="space-y-0.5 text-12 text-danger">
                {result.failed.map((f) => (
                  <li key={f.row_number}>
                    {f.row_number}행 — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
