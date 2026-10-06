import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { FileSpreadsheet, Pencil, Upload } from "lucide-react";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Label } from "@/src/shared/ui/label";
import { Pill } from "@/src/shared/ui/pill";
import { Button } from "@/src/shared/ui/button";
import {
  GRADE_IMPORT_CATEGORY_META,
  postTraineeGradeImportConfirm,
  postTraineeGradeImportPreview,
  postTraineeGradeImportRematch,
  traineeQueries,
  type GradeImportCategory,
  type GradeImportPreviewResult,
  type GradeImportRematchInput,
  type GradeImportResult,
  type GradeImportRowResult,
} from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = "select" | "preview" | "result";

/** 프리뷰 행 + 사용자 포함 여부. block 행은 제외 고정이다.
 * idx 는 drafts 배열 기준 위치 — 평생·연간 시트가 행번호를 공유해 유일 key 로 쓴다 */
interface GradeDraft {
  idx: number;
  row: GradeImportRowResult;
  include: boolean;
}

/** 행 편집 값 — 사유(CERT_COLLISION·NOT_FOUND·생년 오타 등)에 맞게 고쳐 재매칭한다 */
interface EditState {
  idx: number;
  name: string;
  birthDate: string;
  certNo: string;
  expiresAt: string;
  email: string;
  phone: string;
}

const GRADE_KIND_LABEL = {
  lifetime: "평생",
  annual: "연간",
} as const;

const SEVERITY_TONE = {
  block: "danger",
  warn: "warn",
  info: "ok",
} as const;

/** 연락처 셀 — 클릭하면 이메일·전화를 바로 입력해 재매칭한다(교육생 빈 값만 반영).
 * 이미 등록된 연락처가 있으면 사유만 보여 주고 입력받지 않는다. */
function ContactCell({
  idx,
  row,
  isPending,
  onSubmit,
  onOpenChange,
}: {
  idx: number;
  row: GradeImportRowResult;
  isPending: boolean;
  onSubmit: (idx: number, email: string, phone: string) => void;
  onOpenChange: (idx: number, open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const filled = Boolean(row.email || row.phone);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange(idx, v);
  };

  if (row.contact_skip_reason) {
    return <span className="text-11 text-ink-3">{row.contact_skip_reason}</span>;
  }
  if (open) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          autoFocus
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          placeholder="전화번호 (숫자만)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onSubmit(idx, email.trim(), phone.trim());
            }}
            disabled={isPending}
          >
            {isPending ? "적용 중..." : "적용"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="text-left text-11 text-info underline decoration-dotted hover:text-accent"
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      {filled ? (
        <>
          {row.email && "이메일 "}
          {row.phone && "전화 "}입력됨 — 수정
        </>
      ) : (
        "연락처 입력 +"
      )}
    </button>
  );
}

/** 요약 카드 필터 — 카테고리 칩과 별개 축으로 함께 적용된다 */
type SummaryFilter = "total" | "lifetime" | "annual" | "included" | "blocked" | null;

/** 엑셀 회원등급 일괄 적용 — 협회 명부 업로드 → 매칭 리포트 확인 → 확정 3단.
 *
 * 차단(block) 행은 제외 고정, 경고(warn) 행은 기본 포함이지만 끌 수 있다.
 * 연락처는 교육생 빈 값만 채워진다(리포트에 채워질 값이 그대로 보인다).
 */
export function GradeImportDialog({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [drafts, setDrafts] = useState<GradeDraft[]>([]);
  const [preview, setPreview] = useState<GradeImportPreviewResult | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<GradeImportCategory | null>(null);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>(null);
  const [result, setResult] = useState<GradeImportResult | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [contactEditingIdx, setContactEditingIdx] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) return;
    // 닫힐 때 초기화 — 다음 열림이 깨끗한 상태에서 시작하게
    setFile(null);
    setStage("select");
    setDrafts([]);
    setPreview(null);
    setCategoryFilter(null);
    setSummaryFilter(null);
    setResult(null);
    setEditing(null);
    setContactEditingIdx(null);
  }, [isOpen]);

  const previewMutation = useMutation({
    mutationFn: (f: File) => postTraineeGradeImportPreview(f),
    onSuccess: (data) => {
      setPreview(data);
      setDrafts(data.rows.map((row, idx) => ({ idx, row, include: row.default_include })));
      setStage("preview");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rematchMutation = useMutation({
    mutationFn: (p: { idx: number; body: GradeImportRematchInput }) =>
      postTraineeGradeImportRematch(p.body),
    onSuccess: (newRow, p) => {
      setDrafts((prev) =>
        prev.map((d) =>
          d.idx === p.idx ? { ...d, row: newRow, include: newRow.default_include } : d,
        ),
      );
      setEditing(null);
      setContactEditingIdx(null);
      if (newRow.severity === "block") {
        toast.error(
          `여전히 매칭되지 않았어요 — ${newRow.categories
            .map((c) => GRADE_IMPORT_CATEGORY_META[c]?.label ?? c)
            .join(", ")}`,
        );
      } else if (newRow.contact_skip_reason) {
        toast.error(newRow.contact_skip_reason);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** 연락처 셀 제출 — 행의 다른 값은 그대로 두고 연락처만 바꿔 재매칭 */
  const handleContactSubmit = (idx: number, email: string, phone: string) => {
    const d = drafts.find((x) => x.idx === idx);
    if (!d) return;
    rematchMutation.mutate({
      idx,
      body: {
        row_number: d.row.row_number,
        name: d.row.name,
        birth_date: d.row.birth_date,
        cert_no: d.row.cert_no,
        grade_kind: d.row.grade_kind,
        grade_expires_at: d.row.grade_expires_at,
        email: email || null,
        phone: phone || null,
      },
    });
  };

  const confirmMutation = useMutation({
    mutationFn: () =>
      postTraineeGradeImportConfirm(
        drafts
          .filter((d) => d.include && d.row.trainee_id)
          .map((d) => ({
            row_number: d.row.row_number,
            trainee_id: d.row.trainee_id ?? "",
            grade_code: d.row.grade_kind,
            grade_expires_at: d.row.grade_expires_at,
            email: d.row.email,
            phone: d.row.phone,
            include: true,
          })),
      ),
    onSuccess: (data) => {
      setResult(data);
      setStage("result");
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      toast.success(`등급 ${data.grade_updated}명을 적용했어요`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const included = drafts.filter((d) => d.include);

  /** 행에 걸린 카테고리 목록 — 필터 옵션으로 쓴다(건수 많은 순) */
  const presentCategories = useMemo(() => {
    const counts = new Map<GradeImportCategory, number>();
    for (const d of drafts)
      for (const c of d.row.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [drafts]);

  const visibleDrafts = useMemo(() => {
    let list = drafts;
    if (categoryFilter) list = list.filter((d) => d.row.categories.includes(categoryFilter));
    if (summaryFilter === "lifetime") list = list.filter((d) => d.row.grade_kind === "lifetime");
    else if (summaryFilter === "annual") list = list.filter((d) => d.row.grade_kind === "annual");
    else if (summaryFilter === "included") list = list.filter((d) => d.include);
    else if (summaryFilter === "blocked") list = list.filter((d) => d.row.severity === "block");
    return list;
  }, [drafts, categoryFilter, summaryFilter]);

  /** idx 는 drafts 배열 기준 위치 — 필터로 걸러진 목록 순서와 다르다 */
  const toggleInclude = (idx: number, include: boolean) =>
    setDrafts((prev) =>
      prev.map((d) => (d.idx === idx && d.row.severity !== "block" ? { ...d, include } : d)),
    );

  const gridCols = "grid grid-cols-[36px_90px_100px_190px_120px_170px_190px_150px] gap-1.5";

  const actions =
    stage === "preview"
      ? [
          { label: "취소", onClick: onClose },
          {
            label: `${included.length}명 적용`,
            variant: "primary" as const,
            isLoading: confirmMutation.isPending,
            isDisabled: included.length === 0,
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
      title="엑셀 회원등급 적용"
      description={
        stage === "select"
          ? "협회 회원명부 엑셀(.xlsx)을 올리면 기존 감리원과 대조해 등급 적용 리포트를 만들어요"
          : undefined
      }
      actions={actions}
    >
      {stage === "select" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-panel-2 px-4 py-3 text-12 text-ink-2">
            <p className="font-medium text-ink">지원 형식</p>
            <p>· 시트 분리형 — 평생·연간 시트가 나뉜 명부 (시트명으로 판별)</p>
            <p>· 단일 시트 — `회원구분` 컬럼으로 판별</p>
            <p className="mt-1 text-ink-3">
              연간은 납부일 기준 1년(최근 납부일+1년)으로 만료일이 계산되고, 이메일·전화번호는 비어
              있는 감리원에만 채워져요
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-10 text-ink-3 transition-colors hover:border-accent hover:text-accent cursor-pointer"
          >
            <FileSpreadsheet className="size-8" />
            <span className="text-14">{file ? file.name : "클릭해서 엑셀 파일 선택"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            className="w-full"
            disabled={!file || previewMutation.isPending}
            onClick={() => file && previewMutation.mutate(file)}
          >
            <Upload className="size-4" />
            {previewMutation.isPending ? "읽는 중..." : "파일 읽기"}
          </Button>
        </div>
      )}

      {stage === "preview" && preview && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {(
              [
                ["total", preview.summary.total, "총 행", "bg-panel-2", "text-ink", "text-ink-3"],
                [
                  "lifetime",
                  preview.summary.lifetime,
                  "평생",
                  "bg-panel-2",
                  "text-ink",
                  "text-ink-3",
                ],
                ["annual", preview.summary.annual, "연간", "bg-panel-2", "text-ink", "text-ink-3"],
                [
                  "included",
                  included.length,
                  "적용 예정",
                  "bg-ok-soft",
                  "text-ok-ink",
                  "text-ok-ink",
                ],
                [
                  "blocked",
                  preview.summary.blocked,
                  "차단",
                  "bg-danger-soft/40",
                  "text-danger",
                  "text-danger",
                ],
              ] as const
            ).map(([key, count, label, bg, numColor, labelColor]) => {
              const active = summaryFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSummaryFilter(summaryFilter === key ? null : (key as SummaryFilter))
                  }
                  className={`flex-1 rounded-lg px-3 py-2 text-center transition-colors ${bg} ${
                    active ? "ring-2 ring-accent" : "hover:opacity-80"
                  }`}
                >
                  <p className={`text-16 font-semibold ${numColor}`}>{count}</p>
                  <p className={`text-11 ${labelColor}`}>{label}</p>
                </button>
              );
            })}
          </div>

          {preview.warnings.map((w) => (
            <p key={w} className="text-12 text-warn">
              ⚠ {w}
            </p>
          ))}

          <div className="flex flex-wrap items-center gap-1.5 py-1">
            <button type="button" onClick={() => setCategoryFilter(null)}>
              <Pill tone={categoryFilter === null ? "accent" : "default"}>
                전체 {drafts.length}
              </Pill>
            </button>
            {presentCategories.map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              >
                <Pill
                  tone={categoryFilter === cat ? GRADE_IMPORT_CATEGORY_META[cat].tone : "default"}
                >
                  {GRADE_IMPORT_CATEGORY_META[cat].label} {count}
                </Pill>
              </button>
            ))}
          </div>

          {/* 스크롤은 이 컨테이너 하나 — 헤더는 sticky 로 고정 */}
          <div className="max-h-[55vh] overflow-auto">
            <div className="min-w-[1080px] space-y-1.5">
              <div className={`${gridCols} sticky top-0 z-10 items-center bg-panel py-1 px-2.5`}>
                <span />
                <Label className="text-11 text-ink-3">성명</Label>
                <Label className="text-11 text-ink-3">생년월일</Label>
                <Label className="text-11 text-ink-3">감리원증번호</Label>
                <Label className="text-11 text-ink-3">적용 등급</Label>
                <Label className="text-11 text-ink-3">매칭 교육생</Label>
                <Label className="text-11 text-ink-3">연락처</Label>
                <Label className="text-11 text-ink-3">판정</Label>
              </div>
              <div className="space-y-1.5">
                {visibleDrafts.map(({ idx, row, include }) =>
                  editing?.idx === idx ? (
                    /* 행 편집 폼 — 사유에 맞게 이름·생년·증번호·만료일을 고치고 재매칭 */
                    <div
                      key={`edit-${idx}`}
                      className="rounded-lg border border-accent bg-panel-2 px-3 py-2.5"
                    >
                      <p className="mb-2 text-11 font-medium text-ink-2">
                        행 수정 후 재매칭 — 고친 값으로 다시 판정해요
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-11 text-ink-3">성명</Label>
                          <Input
                            className="bg-white"
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-11 text-ink-3">생년월일</Label>
                          <DateField
                            className="bg-white"
                            ariaLabel={`생년월일 수정 ${idx}`}
                            value={editing.birthDate}
                            onChange={(v) => setEditing({ ...editing, birthDate: v })}
                          />
                        </div>
                        <div>
                          <Label className="text-11 text-ink-3">감리원증번호</Label>
                          <Input
                            className="bg-white"
                            value={editing.certNo}
                            onChange={(e) => setEditing({ ...editing, certNo: e.target.value })}
                          />
                        </div>
                        {row.grade_kind === "annual" && (
                          <div>
                            <Label className="text-11 text-ink-3">연간 만료일 직접 지정</Label>
                            <DateField
                              className="bg-white"
                              ariaLabel={`연간 만료일 ${idx}`}
                              value={editing.expiresAt}
                              onChange={(v) => setEditing({ ...editing, expiresAt: v })}
                            />
                          </div>
                        )}
                        <div>
                          <Label className="text-11 text-ink-3">이메일</Label>
                          <Input
                            className="bg-white"
                            value={editing.email}
                            onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-11 text-ink-3">전화번호</Label>
                          <Input
                            className="bg-white"
                            value={editing.phone}
                            onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setEditing(null)}
                          disabled={rematchMutation.isPending}
                        >
                          취소
                        </Button>
                        <Button
                          onClick={() => {
                            const original = drafts.find((d) => d.idx === editing.idx);
                            rematchMutation.mutate({
                              idx: editing.idx,
                              body: {
                                row_number: original?.row.row_number ?? editing.idx,
                                name: editing.name.trim() || null,
                                birth_date: editing.birthDate || null,
                                cert_no: editing.certNo.trim() || null,
                                grade_kind: original?.row.grade_kind ?? "lifetime",
                                grade_expires_at: editing.expiresAt || null,
                                email: editing.email.trim() || null,
                                phone: editing.phone.trim() || null,
                              },
                            });
                          }}
                          disabled={rematchMutation.isPending}
                        >
                          {rematchMutation.isPending ? "재매칭 중..." : "재매칭"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div key={`${idx}-${row.row_number}`} className="space-y-1">
                      <div
                        className={`group relative ${gridCols} items-center rounded-lg border border-line px-2.5 py-2 transition-colors hover:bg-panel-2 ${
                          include ? "" : "opacity-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-accent disabled:cursor-not-allowed"
                          checked={include}
                          disabled={row.severity === "block"}
                          title={
                            row.severity === "block" ? "차단 행은 적용할 수 없어요" : undefined
                          }
                          onChange={(e) => toggleInclude(idx, e.target.checked)}
                        />
                        <span
                          className="bg-white truncate text-13 text-ink"
                          title={row.name ?? undefined}
                        >
                          {row.name ?? "—"}
                        </span>
                        <span className="text-12 text-ink-2">{row.birth_date ?? "—"}</span>
                        <span
                          className="truncate text-12 text-ink-2"
                          title={row.cert_no ?? undefined}
                        >
                          {row.cert_no ?? "—"}
                        </span>
                        <span className="text-12 text-ink">
                          {GRADE_KIND_LABEL[row.grade_kind]}
                          {row.grade_kind === "annual" && row.grade_expires_at && (
                            <span className="block text-11 text-ink-3">
                              ~{row.grade_expires_at}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-12">
                          {row.trainee_name ? (
                            <>
                              <span className="text-ink">{row.trainee_name}</span>
                              <span className="block text-11 text-ink-3">
                                {row.trainee_current_grade ?? "등급 없음"}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </span>
                        <span className="truncate text-11 text-ink-2">
                          <ContactCell
                            key={`${idx}-${row.email ?? ""}-${row.phone ?? ""}-${row.contact_skip_reason ?? ""}`}
                            idx={idx}
                            row={row}
                            isPending={rematchMutation.isPending}
                            onSubmit={handleContactSubmit}
                            onOpenChange={(i, open) => setContactEditingIdx(open ? i : null)}
                          />
                        </span>
                        <span className="flex flex-wrap items-center gap-1">
                          <Pill tone={SEVERITY_TONE[row.severity]}>
                            {row.is_highlighted ? "표시행·" : ""}
                            {GRADE_KIND_LABEL[row.grade_kind]}
                          </Pill>
                          {row.categories.map((cat) => (
                            <Pill key={cat} tone={GRADE_IMPORT_CATEGORY_META[cat].tone}>
                              {GRADE_IMPORT_CATEGORY_META[cat].label}
                            </Pill>
                          ))}
                        </span>
                        {/* hover 오버레이 — 배경은 가리되 아래 요소 클릭은 통과시킨다.
                          편집 폼·연락처 입력이 열린 행은 오버레이를 숨긴다 */}
                        {row.severity !== "info" &&
                          editing?.idx !== idx &&
                          contactEditingIdx !== idx && (
                            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-lg bg-panel/60 group-hover:flex">
                              <Button
                                variant="outline"
                                size="sm"
                                className="pointer-events-auto"
                                onClick={() =>
                                  setEditing({
                                    idx,
                                    name: row.name ?? "",
                                    birthDate: row.birth_date ?? "",
                                    certNo: row.cert_no ?? "",
                                    expiresAt: row.grade_expires_at ?? "",
                                    email: row.email ?? "",
                                    phone: row.phone ?? "",
                                  })
                                }
                              >
                                <Pencil className="size-3.5" /> 편집 · 재매칭
                              </Button>
                            </div>
                          )}
                      </div>
                      {row.contact_skip_reason && (
                        <p className="pl-10 text-11 text-ink-3">
                          연락처: {row.contact_skip_reason}
                        </p>
                      )}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === "result" && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-ok-soft px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ok-ink">{result.grade_updated}</p>
              <p className="text-12 text-ok-ink">등급 적용</p>
            </div>
            <div className="rounded-lg bg-panel-2 px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ink">{result.unchanged}</p>
              <p className="text-12 text-ink-3">변경 없음</p>
            </div>
            <div className="rounded-lg bg-panel-2 px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ink">{result.contact_filled}</p>
              <p className="text-12 text-ink-3">연락처 채움</p>
            </div>
            <div className="rounded-lg bg-panel-2 px-4 py-3 text-center">
              <p className="text-20 font-semibold text-ink">{result.skipped}</p>
              <p className="text-12 text-ink-3">제외</p>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="rounded-lg border border-danger-soft bg-danger-soft/40 px-3 py-2">
              <p className="mb-1 text-12 font-medium text-danger">
                적용 못한 행 {result.failed.length}건
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
