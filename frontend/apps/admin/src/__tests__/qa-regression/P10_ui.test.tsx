// P10-4/5/6: shared/ui Dialog, DateField, Pagination edge cases
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Dialog } from "@/src/shared/ui/dialog";
import { DateField } from "@/src/shared/ui/date-picker/date-field";
import { Pagination } from "@/src/shared/ui/pagination";

afterEach(cleanup);

describe("P10 shared ui", () => {
  it("P10-4 ESC in a nested dialog (dup-confirm over form dialog) closes only the top dialog", () => {
    const closeForm = vi.fn();
    const closeDup = vi.fn();
    render(
      <Dialog isOpen onClose={closeForm} title="감리원 등록">
        <input aria-label="이름" />
        <Dialog isOpen onClose={closeDup} title="이미 등록된 것 같아요" />
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeDup).toHaveBeenCalledTimes(1);
    expect(closeForm).not.toHaveBeenCalled();
  });

  it("P10-5 ESC inside an open DateField popover (in a dialog) closes the popover, not the dialog", () => {
    const closeForm = vi.fn();
    render(
      <Dialog isOpen onClose={closeForm} title="교육 내역 등록">
        <DateField ariaLabel="교육일" value="2026-10-16" onChange={() => {}} />
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "달력 열기" }));
    fireEvent.keyDown(screen.getByLabelText("교육일"), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "이전 달" })).toBeNull(); // popover closed
    expect(closeForm).not.toHaveBeenCalled(); // form dialog (and its input) must survive
  });

  it("P10-6 Pagination with page > totalPages still offers the last page and disables Next", () => {
    render(<Pagination page={5} totalPages={4} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "4" })).toBeTruthy();
    expect((screen.getByTitle("다음") as HTMLButtonElement).disabled).toBe(true);
  });
});
