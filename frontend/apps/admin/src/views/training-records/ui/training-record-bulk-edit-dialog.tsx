import { toUserMessage } from "@/src/shared/lib/friendly-error";
import { hoursError } from "@/src/shared/utils/hours";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "react-toastify";
import { AppTable } from "@/src/shared/ui/app-table";
import { Button } from "@/src/shared/ui/button";
import { Dialog } from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Select } from "@/src/shared/ui/select";
import { SearchableSelect, fetchOptions } from "@/src/shared/ui/searchable-select";
import {
  patchTrainingRecordBulk,
  trainingRecordQueries,
  COMPLETION_STATUS_LABELS,
  type TrainingRecord,
  type TrainingRecordBulkUpdateItem,
} from "@/src/entities/training-record";
import { buildUpdates, rowsMissingCourse, toRow, type EditRow, invalidHoursRows } from "./training-record-bulk-edit-rows";

const INSTITUTION_TYPE_HINT: Record<string, string> = { internal: "사내", external: "외부" };

/** 기관 선택 옵션 — 등록 폼과 같은 매핑 (보조 표기: 사내/외부) */
const institutionOptionsFetcher = fetchOptions("/institutions", {}, (i) => ({
  value: i.id as string,
  label: i.name as string,
  hint: INSTITUTION_TYPE_HINT[(i.institution_type as string) ?? ""],
}));

/** 과정 선택 옵션 — 기관을 고른 행은 그 기관의 과정만 보여 준다 */
const courseOptionsFetcherFor = (institutionId: string | null) =>
  fetchOptions("/courses", institutionId ? { institution_id: institutionId } : {}, (c) => ({
    value: c.id as string,
    label: c.name as string,
    hint: institutionId ? undefined : (c.institution_name as string | undefined),
  }));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  records: TrainingRecord[];
  /** 저장 성공 후 — 부모에서 선택 해제 */
  onSaved: () => void;
}


export function TrainingRecordBulkEditDialog({ isOpen, onClose, records, onSaved }: Props) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const originals = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  useEffect(() => {
    if (isOpen) setRows(records.map(toRow));
  }, [isOpen, records]);

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (updates: TrainingRecordBulkUpdateItem[]) => patchTrainingRecordBulk(updates),
    onSuccess: (res) => {
      toast.success(`${res.updated}건을 수정했어요`);
      queryClient.invalidateQueries({ queryKey: trainingRecordQueries.all() });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(toUserMessage(e)),
  });

  const setField = (id: string, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  /** 기관 변경 — 과정은 기관에 딸리므로 새 기관의 과정을 다시 고르게 비운다(원래 기관으로 되돌리면 원래 과정 복원) */
  const changeInstitution = (row: EditRow, institutionId: string | null, label?: string) => {
    const orig = originals.get(row.id);
    if (orig && institutionId === orig.institutionId) {
      setField(row.id, {
        institutionId,
        institutionName: orig.institutionName ?? "",
        courseId: orig.courseId,
        courseName: orig.courseName,
      });
      return;
    }
    setField(row.id, { institutionId, institutionName: label ?? "", courseId: null, courseName: "" });
  };

  const handleSave = () => {
    const badHours = invalidHoursRows(rows);
    if (badHours.length > 0) {
      // 첫 번째 잘못된 행의 구체적인 사유(음수·숫자 아님·상한 초과)를 함께 알린다
      toast.error(
        `${hoursError(badHours[0]?.totalHours, { label: "총 시수" })} (${badHours.length}건)`,
      );
      return;
    }
    const missing = rowsMissingCourse(rows, originals);
    if (missing.length > 0) {
      toast.error(`기관을 바꾼 ${missing.length}건은 그 기관의 과정을 선택해 주세요`);
      return;
    }
    const updates = buildUpdates(rows, originals);
    if (updates.length === 0) {
      toast.info("변경된 내용이 없어요");
      return;
    }
    mutation.mutate(updates);
  };

  // 셀 안이 입력 칸이라 폭이 곧 보이는 글자 수다 — 기관·과정은 넉넉히, 헤더 드래그로 더 넓힐 수 있다
  const columns: ColumnDef<EditRow, unknown>[] = [
    {
      id: "trainee",
      header: "감리원",
      meta: { width: 110 },
      cell: ({ row: { original: row } }) => (
        <span title={row.traineeName ?? undefined}>{row.traineeName ?? "—"}</span>
      ),
    },
    {
      id: "institution",
      header: "기관",
      meta: { width: 220 },
      cell: ({ row: { original: row } }) => (
        <SearchableSelect
          className="w-full"
          value={row.institutionId}
          onChange={(v, option) => changeInstitution(row, v, option?.label)}
          fetchPage={institutionOptionsFetcher}
          placeholder={row.institutionName || "기관 선택"}
          disableCreate
          queryKeyPrefix={["options", "bulk-institutions"]}
          selectedLabel={row.institutionName}
          portal
          panelMinWidth={360}
        />
      ),
    },
    {
      id: "course",
      header: "과정",
      meta: { width: 340 },
      cell: ({ row: { original: row } }) => (
        <SearchableSelect
          className="w-full"
          value={row.courseId}
          onChange={(v, option) =>
            setField(row.id, { courseId: v, courseName: option?.label ?? row.courseName })
          }
          fetchPage={courseOptionsFetcherFor(row.institutionId)}
          placeholder={row.courseName || "과정 선택"}
          disableCreate
          queryKeyPrefix={["options", "bulk-courses", row.institutionId ?? "all"]}
          selectedLabel={row.courseName}
          // 모달 안 스크롤 테이블에 잘리지 않게 body 포털로 띄운다
          portal
          panelMinWidth={480}
        />
      ),
    },
    {
      id: "startedAt",
      header: "시작일",
      meta: { width: 160 },
      cell: ({ row: { original: row } }) => (
        <DateField
          ariaLabel={`교육 시작일 ${row.id}`}
          className="text-13"
          value={row.startedAt}
          onChange={(v) => {
            setField(row.id, { startedAt: v });
            if (v && row.endedAt && v > row.endedAt) setField(row.id, { endedAt: v });
          }}
        />
      ),
    },
    {
      id: "endedAt",
      header: "종료일",
      meta: { width: 160 },
      cell: ({ row: { original: row } }) => (
        <DateField
          ariaLabel={`교육 종료일 ${row.id}`}
          className="text-13"
          value={row.endedAt}
          onChange={(v) => {
            setField(row.id, { endedAt: v });
            if (v && row.startedAt && v < row.startedAt) setField(row.id, { startedAt: v });
          }}
        />
      ),
    },
    {
      id: "totalHours",
      header: "총시수",
      meta: { width: 90 },
      cell: ({ row: { original: row } }) => (
        <Input
          type="number"
          step="0.5"
          min="0"
          className="h-8 w-full px-2 text-right text-13"
          value={row.totalHours}
          onChange={(e) => setField(row.id, { totalHours: e.target.value })}
        />
      ),
    },
    {
      id: "memo",
      header: "메모",
      meta: { width: 200 },
      cell: ({ row: { original: row } }) => (
        <Input
          className="h-8 w-full px-2 text-13"
          value={row.memo}
          placeholder="메모 없음"
          onChange={(e) => setField(row.id, { memo: e.target.value })}
        />
      ),
    },
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`이력 일괄 수정 (${records.length}건)`}
      description="날짜·총 시수는 비우면 변경하지 않고, 메모는 비우면 지워져요. 기관을 바꾸면 그 기관의 과정을 다시 골라 주세요. 변경한 행만 반영됩니다."
      size="3xl"
      actions={[
        { label: "취소", onClick: onClose },
        { label: "저장", isLoading: mutation.isPending, onClick: handleSave },
      ]}
    >
      <AppTable<EditRow>
        columns={columns}
        data={rows}
        dense
        fixedLayout
        columnDividers
      />
    </Dialog>
  );
}
