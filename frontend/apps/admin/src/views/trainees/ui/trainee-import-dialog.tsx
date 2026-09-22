import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";
import { Pill } from "@/src/shared/ui/pill";
import { Button } from "@/src/shared/ui/button";
import {
  postTraineeImportConfirm,
  postTraineeImportPreview,
  traineeQueries,
  type TraineeImportConfirmItem,
  type TraineeImportResult,
} from "@/src/entities/trainee";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** 프리뷰 1행 — 엑셀에서 읽은 값을 사용자가 고칠 수 있는 형태 */
interface ImportDraft {
  /** 파일이 여러 개면 행번호가 겹치므로 파일 인덱스를 섞은 key */
  key: string;
  fileIndex: number;
  fileName: string;
  rowNumber: number;
  name: string;
  phone: string;
  birthDate: string;
  certNo: string;
  supervisorGrade: string;
  certIssuedDate: string;
  isDuplicate: boolean;
  duplicateOfName: string | null;
  errors: string[];
  include: boolean;
}

type Stage = "select" | "preview" | "result";

/** 엑셀로 교육생 일괄 등록 — 업로드 → 프리뷰(편집) → 확정 3단. 프리뷰에서 파일 추가 가능 */
export function TraineeImportDialog({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileSeqRef = useRef(0);
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("select");
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [result, setResult] = useState<TraineeImportResult | null>(null);

  useEffect(() => {
    if (isOpen) return;
    // 닫힐 때 초기화 — 다음 열림이 깨끗한 상태에서 시작하게
    setFiles([]);
    setStage("select");
    setDrafts([]);
    setFileNames([]);
    setResult(null);
    fileSeqRef.current = 0;
  }, [isOpen]);

  const setDraft = (key: string, patch: Partial<ImportDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const previewMutation = useMutation({
    mutationFn: (f: File) => postTraineeImportPreview(f),
    onSuccess: ({ rows }, f) => {
      const fi = fileSeqRef.current++;
      setFileNames((prev) => [...prev, f.name]);
      // 기존 프리뷰 뒤에 이어 붙인다 — 여러 파일을 한 번에 확인·편집·등록
      setDrafts((prev) => [
        ...prev,
        ...rows.map((r) => ({
          key: `${fi}-${r.row_number}`,
          fileIndex: fi,
          fileName: f.name,
          rowNumber: r.row_number,
          name: r.name ?? "",
          phone: r.phone ?? "",
          birthDate: r.birth_date ?? "",
          certNo: r.cert_no ?? "",
          supervisorGrade: r.supervisor_grade ?? "",
          certIssuedDate: r.cert_issued_date ?? "",
          isDuplicate: r.is_duplicate,
          duplicateOfName: r.duplicate_of_name,
          errors: r.errors,
          // 중복·오류 행은 기본 제외 — 사용자가 확인하고 다시 포함시킨다
          include: !r.is_duplicate && r.errors.length === 0,
        })),
      ]);
      setStage("preview");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** 여러 파일을 순서대로 읽어 프리뷰에 누적 — 파일 순서를 유지하기 위해 직렬 처리 */
  const previewFiles = async (picked: File[]) => {
    for (const f of picked) {
      try {
        await previewMutation.mutateAsync(f);
      } catch {
        // onError에서 토스트 표시됨 — 실패한 파일은 건너뛰고 다음 파일 계속
      }
    }
  };

  /** select 단계에서는 선택만, preview 단계에서는 바로 읽어 누적한다 */
  const onFilesPicked = (picked: File[]) => {
    if (picked.length === 0) return;
    if (stage === "select") setFiles(picked);
    else previewFiles(picked);
  };

  const confirmMutation = useMutation({
    mutationFn: () => {
      const items: TraineeImportConfirmItem[] = drafts
        .filter((d) => d.include && d.name.trim())
        .map((d) => ({
          row_number: d.rowNumber,
          name: d.name.trim(),
          phone: d.phone.trim() || null,
          birth_date: d.birthDate || null,
          cert_no: d.certNo.trim() || null,
          supervisor_grade: d.supervisorGrade.trim() || null,
          cert_issued_date: d.certIssuedDate || null,
        }));
      return postTraineeImportConfirm(items);
    },
    onSuccess: (data) => {
      setResult(data);
      setStage("result");
      queryClient.invalidateQueries({ queryKey: traineeQueries.all() });
      toast.success(`감리원 ${data.created}명을 등록했어요`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const included = drafts.filter((d) => d.include);
  const hasBlockingError = included.some((d) => !d.name.trim() || d.errors.length > 0);
  const duplicateCount = drafts.filter((d) => d.isDuplicate).length;

  const gridCols = "grid grid-cols-[36px_120px_120px_150px_200px_100px_140px_72px] gap-1.5";

  const actions =
    stage === "preview"
      ? [
          { label: "취소", onClick: onClose },
          {
            label: `${included.length}명 등록`,
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
      title="감리원 엑셀 등록"
      description={
        stage === "select"
          ? "헤더가 감리원명·전화번호·생년월일·감리원증번호·감리원등급명·감리원증발급일자인 엑셀(.xlsx)을 올려요"
          : undefined
      }
      actions={actions}
    >
      {stage === "select" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-10 text-ink-3 transition-colors hover:border-accent hover:text-accent"
          >
            <FileSpreadsheet className="size-8" />
            <span className="text-sm">
              {files.length === 0
                ? "클릭해서 엑셀 파일 선택 (여러 개 선택 가능)"
                : files.length === 1
                  ? files[0]?.name
                  : `${files[0]?.name} 외 ${files.length - 1}개`}
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            multiple
            className="hidden"
            onChange={(e) => onFilesPicked(Array.from(e.target.files ?? []))}
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
            <p className="text-[12px] text-ink-3">
              파일 {fileNames.length}개 · 총 {drafts.length}행 · 중복 {duplicateCount}행
              {duplicateCount > 0 && " (중복은 기본 제외 — 포함하려면 체크)"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[12px] text-accent hover:underline"
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? "읽는 중..." : "엑셀 추가"}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  className="accent-accent"
                  checked={included.length === drafts.length}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((d) => ({ ...d, include: e.target.checked })))
                  }
                />
                전체 포함
              </label>
            </div>
          </div>
          {/* 스크롤은 이 컨테이너 하나 — 헤더는 sticky 로 고정 */}
          <div className="max-h-[60vh] overflow-auto">
            <div className="min-w-[880px] space-y-1.5">
              <div className={`${gridCols} sticky top-0 z-10 items-center bg-panel py-1 px-2.5`}>
                <span />
                <Label className="text-[11px] text-ink-3">감리원명 *</Label>
                <Label className="text-[11px] text-ink-3">전화번호</Label>
                <Label className="text-[11px] text-ink-3">생년월일</Label>
                <Label className="text-[11px] text-ink-3">감리원증번호</Label>
                <Label className="text-[11px] text-ink-3">등급</Label>
                <Label className="text-[11px] text-ink-3">발급일자</Label>
                <Label className="text-[11px] text-ink-3">상태</Label>
              </div>
              <div className="space-y-1.5">
                {drafts.map((d, i) => (
                  <div key={d.key} className="space-y-1">
                    {/* 파일 경계 — 파일별 헤더로 묶어 어느 엑셀에서 온 행인지 보인다 */}
                    {(i === 0 || drafts[i - 1]?.fileIndex !== d.fileIndex) && (
                      <div className="flex items-center gap-1.5 pt-2">
                        <FileSpreadsheet className="size-3 shrink-0 text-ink-3" />
                        <span className="truncate text-[11px] font-medium text-ink-2">
                          {d.fileName}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-3">
                          {drafts.filter((x) => x.fileIndex === d.fileIndex).length}행
                        </span>
                      </div>
                    )}
                    <div
                      className={`${gridCols} items-center rounded-lg border border-line px-2.5 py-2 ${
                        d.include ? "" : "opacity-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={d.include}
                        onChange={(e) => setDraft(d.key, { include: e.target.checked })}
                      />
                      {/* 체크 안 한 행은 편집 잠금 — 포함할 행만 고친다 */}
                      <Input
                        disabled={!d.include}
                        value={d.name}
                        onChange={(e) => setDraft(d.key, { name: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        value={d.phone}
                        onChange={(e) => setDraft(d.key, { phone: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        type="date"
                        value={d.birthDate}
                        onChange={(e) => setDraft(d.key, { birthDate: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        value={d.certNo}
                        onChange={(e) => setDraft(d.key, { certNo: e.target.value })}
                      />
                      <Input
                        disabled={!d.include}
                        value={d.supervisorGrade}
                        onChange={(e) =>
                          setDraft(d.key, {
                            supervisorGrade: e.target.value,
                          })
                        }
                      />
                      <Input
                        disabled={!d.include}
                        type="date"
                        value={d.certIssuedDate}
                        onChange={(e) =>
                          setDraft(d.key, {
                            certIssuedDate: e.target.value,
                          })
                        }
                      />
                      {d.isDuplicate ? (
                        <Pill tone="warn">중복</Pill>
                      ) : d.errors.length > 0 ? (
                        <Pill tone="danger">오류</Pill>
                      ) : (
                        <Pill tone="ok">신규</Pill>
                      )}
                    </div>
                    {(d.errors.length > 0 || d.duplicateOfName) && (
                      <p className="pl-10 text-[11px] text-danger">
                        {d.duplicateOfName && `기존 감리원(${d.duplicateOfName})과 중복이에요`}
                        {d.errors.length > 0 && ` · ${d.errors.join(" · ")}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === "result" && result && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 rounded-lg bg-ok-soft px-4 py-3 text-center">
              <p className="text-xl font-semibold text-ok-ink">{result.created}</p>
              <p className="text-[12px] text-ok-ink">등록</p>
            </div>
            <div className="flex-1 rounded-lg bg-panel-2 px-4 py-3 text-center">
              <p className="text-xl font-semibold text-ink">{result.skipped}</p>
              <p className="text-[12px] text-ink-3">중복 제외</p>
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="rounded-lg border border-danger-soft bg-danger-soft/40 px-3 py-2">
              <p className="mb-1 text-[12px] font-medium text-danger">
                등록 못한 행 {result.failed.length}건
              </p>
              <ul className="space-y-0.5 text-[12px] text-danger">
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
