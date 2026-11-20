// P13 forms: institution/course code clear, inactive master offered, bulk-edit hours, session-form hours
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const patchInst = vi.fn(async (_id: string, i: Record<string, unknown>) => ({ id: "i1", ...i }));
const patchCourse = vi.fn(async (_id: string, i: Record<string, unknown>) => ({ id: "c1", ...i }));
const patchBulk = vi.fn(async (_b: unknown) => 1);
const postSession = vi.fn(async (b: Record<string, unknown>) => ({ id: "s9", ...b }));
const getSpy = vi.fn(async (_path: string, _cfg: { params: Record<string, unknown> }) => ({
  data: { items: [], total: 0, page: 1, limit: 30, total_pages: 0 },
}));
vi.mock("@/src/entities/institution/api/patch-institution", () => ({ patchInstitution: (a: string, b: Record<string, unknown>) => patchInst(a, b) }));
vi.mock("@/src/entities/institution/api/patch-course", () => ({ patchCourse: (a: string, b: Record<string, unknown>) => patchCourse(a, b) }));
vi.mock("@/src/entities/course-session/api/patch-course-session-bulk", () => ({ patchCourseSessionBulk: (b: unknown) => patchBulk(b) }));
vi.mock("@/src/entities/course-session/api/post-course-session", () => ({ postCourseSession: (b: Record<string, unknown>) => postSession(b) }));
vi.mock("@/src/shared/api", async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return { ...m, apiClient: { get: (p: string, c: { params: Record<string, unknown> }) => getSpy(p, c) } };
});
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { InstitutionFormDialog } from "@/src/views/institutions/ui/institution-form-dialog";
import { CourseFormDialog } from "@/src/views/institutions/ui/course-form-dialog";
import { CourseSessionBulkEditDialog } from "@/src/views/course-sessions/ui/course-session-bulk-edit-dialog";
import { CourseSessionFormDialog } from "@/src/views/course-sessions/ui/course-session-form-dialog";
import type { CourseSession } from "@/src/entities/course-session";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const wrap = (el: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>);
/** axios 가 실제로 보내는 JSON 본문 (undefined 키는 사라진다) */
const wire = (o: unknown) => JSON.parse(JSON.stringify(o));
const sess: CourseSession = {
  id: "s1", courseId: "c1", courseName: "과정A", institutionId: "i1", institutionName: "기관A",
  institutionType: "internal", source: "internal", scheduleNo: null, startedAt: "2026-10-01",
  endedAt: "2026-10-02", totalHours: 8, recognizedHours: 8, isActive: true, memo: null,
  enrolledCount: 0, createdAt: "", updatedAt: "",
};

describe("P13 forms", () => {
  it("P13-1 clearing institution code on edit must send institution_code:null", async () => {
    wrap(<InstitutionFormDialog isOpen onClose={() => {}} institution={{ id: "i1", name: "기관A", institutionCode: "OLD", institutionType: "external", isActive: true, createdAt: "" }} />);
    fireEvent.change(screen.getByPlaceholderText("선택"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() => expect(patchInst).toHaveBeenCalled());
    expect(wire(patchInst.mock.calls[0]![1])).toHaveProperty("institution_code", null);
  });

  it("P13-2 clearing course code on edit must send course_code:null", async () => {
    wrap(<CourseFormDialog isOpen onClose={() => {}} course={{ id: "c1", institutionId: "i1", institutionName: "기관A", institutionType: "external", sessionNameId: null, sessionName: null, isExternal: true, name: "과정A", courseCode: "OLD", description: null, totalHours: 8, category: null, isActive: true, createdAt: "" }} />);
    fireEvent.change(screen.getByDisplayValue("OLD"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() => expect(patchCourse).toHaveBeenCalled());
    expect(wire(patchCourse.mock.calls[0]![1])).toHaveProperty("course_code", null);
  });

  it("P13-4 session form institution/course pickers must request only active (사용중) masters", async () => {
    wrap(<CourseSessionFormDialog isOpen onClose={() => {}} session={null} />);
    fireEvent.click(screen.getByRole("button", { name: "기관 검색 · 선택" }));
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    const [path, cfg] = getSpy.mock.calls[0]!;
    expect(path).toBe("/institutions");
    expect(cfg.params.is_active).toBe(true);
  });

  it("P13-5a bulk edit must not send total_hours:null when hours cleared", async () => {
    wrap(<CourseSessionBulkEditDialog isOpen onClose={() => {}} sessions={[sess]} onDone={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("8"), { target: { value: "" } });
    // 수정 후: 빈 시수는 '변경 없음'이라 저장 대상 건수에서 빠진다(라벨이 0개가 될 수 있다)
    const btn = screen.getByRole("button", { name: /개 저장$/ }) as HTMLButtonElement;
    if (!btn.disabled) fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 30));
    const items = (patchBulk.mock.calls[0]?.[0] as { items: Record<string, unknown>[] } | undefined)?.items ?? [];
    expect(items.some((i) => "total_hours" in i && i.total_hours === null)).toBe(false);
  });

  it("P13-5b bulk edit save must be disabled for negative hours", async () => {
    wrap(<CourseSessionBulkEditDialog isOpen onClose={() => {}} sessions={[sess]} onDone={() => {}} />);
    fireEvent.change(screen.getByDisplayValue("8"), { target: { value: "-8" } });
    expect((screen.getByRole("button", { name: /개 저장$/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("P13-5c session create must not submit negative total_hours", async () => {
    getSpy.mockImplementation((async (path: string) => ({ data: {
      items: path === "/institutions" ? [{ id: "i1", name: "기관A", institution_type: "internal" }] : [{ id: "c1", name: "과정A" }],
      total: 1, page: 1, limit: 30, total_pages: 1 } })) as never);
    wrap(<CourseSessionFormDialog isOpen onClose={() => {}} session={null} />);
    fireEvent.click(screen.getByRole("button", { name: "기관 검색 · 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: /기관A/ }));
    fireEvent.click(screen.getByRole("button", { name: "과정 검색 · 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: /과정A/ }));
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "-8" } });
    const btn = screen.getByRole("button", { name: "등록 후 감리원 연결" }) as HTMLButtonElement;
    if (!btn.disabled) fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 30));
    expect(postSession.mock.calls[0]?.[0]?.total_hours ?? 0).toBeGreaterThanOrEqual(0);
  });
});
