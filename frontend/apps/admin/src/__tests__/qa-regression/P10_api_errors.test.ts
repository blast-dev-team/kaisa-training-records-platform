// P10-1/2/3: shared/api instance + shared/lib/sentry error-handling contract
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/react", () => ({ captureException, addBreadcrumb: vi.fn(), init: vi.fn() }));

import { AxiosError } from "axios";
import { ApiError, apiClient } from "@/src/shared/api/instance";
import { captureQueryError } from "@/src/shared/lib/sentry";

function respond(status: number, data: unknown) {
  apiClient.defaults.adapter = async (config) => {
    const response = { data, status, statusText: "", headers: {}, config, request: {} };
    throw new AxiosError("bad status", "ERR_BAD_REQUEST", config, {}, response as never);
  };
}
afterEach(() => { captureException.mockClear(); vi.restoreAllMocks(); });

describe("P10 api error contract", () => {
  it("P10-1 captureQueryError must NOT send 4xx ApiError (what the interceptor rejects with) to Sentry", () => {
    captureQueryError(new ApiError({ code: "NOT_FOUND", message: "없음" }, 404));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("P10-2 422 VALIDATION_ERROR field errors survive into ApiError.fieldErrors", async () => {
    respond(422, { code: "VALIDATION_ERROR", message: "입력값을 확인해 주세요",
      errors: [{ field: "body.email", message: "value is not a valid email" }] });
    const err = (await apiClient.post("/trainees", {}).catch((e) => e)) as ApiError;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.fieldErrors).toEqual([{ field: "body.email", message: "value is not a valid email" }]);
  });

  it("P10-3 403 ACCOUNT_DISABLED (docs/admin/api.md: 안내 문구 후 로그아웃) leads to /login", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    respond(403, { code: "ACCOUNT_DISABLED", message: "비활성화된 계정이에요" });
    const err = (await apiClient.get("/trainees").catch((e) => e)) as ApiError;
    expect(err.code).toBe("ACCOUNT_DISABLED");
    // 수정 후: 차단 사유를 로그인 화면에 알리기 위해 ?reason=disabled 를 붙인다
    expect(String(replace.mock.calls[0]?.[0])).toMatch(/^\/login/);
  });
});
