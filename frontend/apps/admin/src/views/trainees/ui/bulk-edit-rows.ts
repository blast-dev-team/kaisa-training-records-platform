import type { Trainee, TraineeBulkUpdateItem } from "@/src/entities/trainee";
import { emailError } from "@/src/shared/utils/email";
import { phoneError } from "@/src/shared/utils/phone";

/** 모달 안 한 사람의 입력 상태 */
export interface RowDraft {
  name: string;
  birthDate: string;
  phone: string;
  email: string;
  certNo: string;
  seniorCertNo: string;
  memo: string;
}

export const EMPTY_ROW: RowDraft = {
  name: "",
  birthDate: "",
  phone: "",
  email: "",
  certNo: "",
  seniorCertNo: "",
  memo: "",
};

export function toRowDraft(t: Trainee): RowDraft {
  return {
    name: t.name,
    birthDate: t.birthDate ?? "",
    phone: "", // 전화는 원문 미보유(마스킹만 응답) — 입력할 때만 바꾼다
    email: t.email ?? "",
    certNo: t.certNo ?? "",
    seniorCertNo: t.seniorCertNo ?? "",
    memo: t.memo ?? "",
  };
}

/** 사용자가 바꾼 칸만 담는다 — 열 때 값을 통째로 보내면 그사이 다른 화면에서 고친 값을 되돌린다.
 *  전화·이메일·증번호는 빈 값 = 기존 유지, 메모는 비우면 지움 */
export function buildBulkItems(
  trainees: Trainee[],
  rows: Record<string, RowDraft>,
): TraineeBulkUpdateItem[] {
  return trainees
    .map((t) => {
      const row = rows[t.id];
      const item: TraineeBulkUpdateItem = { id: t.id };
      if (!row) return item;
      if (row.name.trim() && row.name.trim() !== t.name) item.name = row.name.trim();
      if (row.birthDate && row.birthDate !== (t.birthDate ?? "")) item.birth_date = row.birthDate;
      if (row.phone.trim()) item.phone = row.phone.trim();
      if (row.email.trim() && row.email.trim() !== (t.email ?? "")) item.email = row.email.trim();
      if (row.certNo.trim() && row.certNo.trim() !== (t.certNo ?? ""))
        item.cert_no = row.certNo.trim();
      if (row.seniorCertNo.trim() && row.seniorCertNo.trim() !== (t.seniorCertNo ?? ""))
        item.senior_cert_no = row.seniorCertNo.trim();
      if (row.memo.trim() !== (t.memo ?? "")) item.memo = row.memo.trim() || null;
      return item;
    })
    .filter((item) => Object.keys(item).length > 1);
}

export type RowIssueField = "name" | "phone" | "email" | "certNo";
export interface RowIssue {
  field: RowIssueField;
  message: string;
}

/** 증번호 비교 키 — 서버(normalize_cert_no)처럼 공백을 모두 뺀다 */
const certKey = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "");

/** 저장 후 그 사람이 갖게 될 증번호 — 빈 칸은 기존 유지라 원래 번호가 남는다 */
function effectiveCertNos(t: Trainee, row: RowDraft): string[] {
  return [row.certNo.trim() || t.certNo, row.seniorCertNo.trim() || t.seniorCertNo]
    .map(certKey)
    .filter(Boolean);
}

/** 이 창에서 증번호를 새로 입력했는지 — 미리 채운 원래 번호 그대로면 바꾸지 않은 것 */
function certChanged(t: Trainee, row: RowDraft): boolean {
  const cert = row.certNo.trim();
  const senior = row.seniorCertNo.trim();
  return (!!cert && cert !== (t.certNo ?? "")) || (!!senior && senior !== (t.seniorCertNo ?? ""));
}

/**
 * 저장 전 검증 — 사람별 문제 목록(문제 없는 사람은 키가 없다).
 * 다른 감리원(이 모달 밖)과의 증번호 중복은 서버만 알 수 있어 저장 응답으로 표시한다.
 */
export function validateRows(
  trainees: Trainee[],
  rows: Record<string, RowDraft>,
): Record<string, RowIssue[]> {
  const issues: Record<string, RowIssue[]> = {};
  const add = (id: string, issue: RowIssue) => {
    (issues[id] ??= []).push(issue);
  };
  for (const t of trainees) {
    const row = rows[t.id];
    if (!row) continue;
    if (!row.name.trim()) add(t.id, { field: "name", message: "성명을 입력해 주세요" });
    const phone = phoneError(row.phone);
    if (phone) add(t.id, { field: "phone", message: phone });
    const email = emailError(row.email);
    if (email) add(t.id, { field: "email", message: email });
  }
  // 모달 안에서 두 사람이 같은 증번호를 갖게 되는 경우 — 한쪽이라도 번호를 바꾼 때만 본다
  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      const a = trainees[i]!;
      const b = trainees[j]!;
      const ra = rows[a.id];
      const rb = rows[b.id];
      if (!ra || !rb) continue;
      if (!certChanged(a, ra) && !certChanged(b, rb)) continue;
      const bNos = new Set(effectiveCertNos(b, rb));
      if (!effectiveCertNos(a, ra).some((no) => bNos.has(no))) continue;
      add(a.id, { field: "certNo", message: `감리원증번호가 ${rb.name.trim() || b.name}님과 같아요` });
      add(b.id, { field: "certNo", message: `감리원증번호가 ${ra.name.trim() || a.name}님과 같아요` });
    }
  }
  return issues;
}
