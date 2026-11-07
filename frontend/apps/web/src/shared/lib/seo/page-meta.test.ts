import { describe, expect, it } from "vitest";

import { getPageMeta, SITE_NAME } from "./page-meta";

describe("getPageMeta", () => {
  it("홈은 협회명이 앞에 오는 사이트 제목을 쓴다", () => {
    expect(getPageMeta("/").title).toBe(SITE_NAME);
    expect(getPageMeta("/").canonical).toBe("https://edu.kaisa.or.kr/");
  });

  it("공개 페이지는 '페이지명 | 정보시스템감리협회' 제목과 자기 canonical 을 갖는다", () => {
    const meta = getPageMeta("/verification-no-auth");
    expect(meta.title).toBe("확인서 진위확인 | 정보시스템감리협회");
    expect(meta.canonical).toBe("https://edu.kaisa.or.kr/verification-no-auth");
    expect(meta.description).toContain("정보시스템감리협회");
  });

  it("끝 슬래시가 붙어도 같은 페이지로 본다", () => {
    expect(getPageMeta("/inquiry/").title).toBe("문의하기 | 정보시스템감리협회");
  });

  it("모르는 경로는 홈 메타로 돌아간다", () => {
    expect(getPageMeta("/payment/complete").title).toBe(SITE_NAME);
  });
});
