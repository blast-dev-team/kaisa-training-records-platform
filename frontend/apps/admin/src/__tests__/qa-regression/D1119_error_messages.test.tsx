// 2026-11-19 결정 회귀 — 상황별 시수 오류 문구(FE 사전 방어), 사용자용 오류 문구, 과정 기관 변경
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";

const patchCourse = vi.fn(async (_id: string, i: Record<string, unknown>) => ({ id: "c1", ...i }));
const getLinks = vi.fn(async (...args: [string]) => { void args; return { sessionCount: 3, recordCount: 12 }; });
const getSpy = vi.fn(async (path: string, ...rest: unknown[]) => ({ ...(void rest, {}),
  data: {
    items: path === "/institutions" ? [{ id: "i2", name: "기관B", institution_type: "external" }] : [],
    total: 1, page: 1, limit: 30, total_pages: 1,
  },
}));
vi.mock("@/src/entities/institution/api/patch-course", () => ({
  patchCourse: (a: string, b: Record<string, unknown>) => patchCourse(a, b),
}));
vi.mock("@/src/entities/institution/api/get-course-links", () => ({
  getCourseLinks: (a: string) => getLinks(a),
}));
vi.mock("@/src/shared/api", async (orig) => {
  const m = await orig<Record<string, unknown>>();
  return { ...m, apiClient: { get: (p: string, c: unknown) => getSpy(p, c) } };
});
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { hoursError } from "@/src/shared/utils/hours";
import { toUserMessage, friendlyServerMessage, NETWORK_ERROR_MESSAGE } from "@/src/shared/lib/friendly-error";
import { CourseFormDialog } from "@/src/views/institutions/ui/course-form-dialog";
import { CourseSessionFormDialog } from "@/src/views/course-sessions/ui/course-session-form-dialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const wrap = (el: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{el}</QueryClientProvider>);

describe("시수 상황별 문구 — BE 와 같은 문장", () => {
  it("음수 / 상한 초과 / 숫자 아님 / 필수 빈 값", () => {
    expect(hoursError("-8", { label: "총 시수" })).toBe("총 시수는 0 이상이어야 해요");
    expect(hoursError("1000000", { label: "총 시수" })).toBe("총 시수는 999,999.99 이하로 입력해 주세요");
    expect(hoursError("abc", { label: "총 시수" })).toBe("총 시수는 숫자로 입력해 주세요");
    expect(hoursError("", { label: "총 시수", required: true })).toBe("총 시수를 입력해 주세요");
    expect(hoursError("", { label: "총 시수" })).toBeNull();
    expect(hoursError("8.5", { label: "총 시수" })).toBeNull();
  });

  it("일정 등록 폼 — 음수 시수는 서버 전송 전에 문구와 함께 막힌다", async () => {
    wrap(<CourseSessionFormDialog isOpen onClose={() => {}} session={null} />);
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "-8" } });
    expect(await screen.findByText("총 시수는 0 이상이어야 해요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "등록 후 감리원 연결" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("과정 폼 — 음수 시수 문구 + 저장 불가", async () => {
    wrap(<CourseFormDialog isOpen onClose={() => {}} course={null} />);
    fireEvent.change(screen.getByPlaceholderText("예: 8"), { target: { value: "-1" } });
    expect(await screen.findByText("총 시수는 0 이상이어야 해요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "등록" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("사용자용 오류 문구 — 영문 원문 비노출", () => {
  it("한국어 서버 문구는 그대로, 영문·빈 문구는 상태별 안내", () => {
    expect(friendlyServerMessage("총 시수는 0 이상이어야 해요", 422)).toBe("총 시수는 0 이상이어야 해요");
    expect(friendlyServerMessage("Internal server error", 502)).toContain("서버가 잠시 응답하지 않아요");
    expect(friendlyServerMessage("Invalid value", 422)).toBe("입력값을 확인해 주세요");
    expect(friendlyServerMessage(undefined, undefined)).toBe(NETWORK_ERROR_MESSAGE);
    expect(toUserMessage(new TypeError("Cannot read properties of undefined"), "PDF 생성에 실패했어요")).toBe("PDF 생성에 실패했어요");
    expect(toUserMessage(new Error("교육생을 찾을 수 없어요"))).toBe("교육생을 찾을 수 없어요");
  });

  it("axios 인터셉터 — 게이트웨이 영문 응답·네트워크 끊김을 한국어로 바꾼다", async () => {
    const { apiClient: real } = await vi.importActual<typeof import("@/src/shared/api/instance")>("@/src/shared/api/instance");
    const handler = (real.interceptors.response as unknown as { handlers: { rejected: (e: unknown) => Promise<unknown> }[] }).handlers[0]!.rejected;
    const gw = new AxiosError("Request failed", "ERR_BAD_RESPONSE", { url: "/x", headers: new AxiosHeaders() }, null, {
      status: 502, data: { message: "Internal server error" }, statusText: "", headers: {}, config: { headers: new AxiosHeaders() },
    });
    await expect(handler(gw)).rejects.toMatchObject({ message: expect.stringContaining("서버가 잠시 응답하지 않아요") });
    const net = new AxiosError("Network Error", "ERR_NETWORK", { url: "/x", headers: new AxiosHeaders() });
    await expect(handler(net)).rejects.toMatchObject({ message: NETWORK_ERROR_MESSAGE, code: "NETWORK_ERROR" });
  });
});

describe("과정 기관 변경 — 허용 + 연결 일정·이력 안내 + 확인", () => {
  const course = {
    id: "c1", institutionId: "i1", institutionName: "기관A", institutionType: "internal" as const,
    sessionNameId: null, sessionName: null, isExternal: false, name: "과정A", courseCode: null,
    description: null, totalHours: 8, category: null, isActive: true, createdAt: "",
  };

  it("기관 선택이 열려 있고, 바꾸면 연결 건수를 보여 준 뒤 확인을 거쳐 institution_id 를 보낸다", async () => {
    wrap(<CourseFormDialog isOpen onClose={() => {}} course={course} />);
    fireEvent.click(screen.getByRole("button", { name: /기관A/ }));
    fireEvent.click(await screen.findByText("기관B"));
    expect(await screen.findByText(/일정 3건, 교육이력 12건/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    // 바로 저장하지 않고 확인 창
    expect(await screen.findByText("교육기관을 변경할까요?")).toBeTruthy();
    expect(patchCourse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "변경" }));
    await waitFor(() => expect(patchCourse).toHaveBeenCalled());
    expect(patchCourse.mock.calls[0]![1]).toMatchObject({ institution_id: "i2" });
  });

  it("기관을 그대로 두면 확인 창 없이 저장", async () => {
    wrap(<CourseFormDialog isOpen onClose={() => {}} course={course} />);
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    await waitFor(() => expect(patchCourse).toHaveBeenCalled());
    expect(screen.queryByText("교육기관을 변경할까요?")).toBeNull();
    expect(getLinks).not.toHaveBeenCalled();
  });
});
