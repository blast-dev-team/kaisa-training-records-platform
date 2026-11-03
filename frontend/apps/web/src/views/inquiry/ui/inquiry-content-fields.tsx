import { Dropdown, TextArea, TextField } from "@/src/shared/ui";

import {
  CONTENT_MAX,
  INQUIRY_CATEGORY_OPTIONS,
  type InquiryCategory,
  TITLE_MAX,
} from "../api/inquiry-api";

export interface InquiryContentValue {
  category: InquiryCategory | "";
  title: string;
  content: string;
}

export const EMPTY_CONTENT: InquiryContentValue = { category: "", title: "", content: "" };

export const isContentFilled = (v: InquiryContentValue) =>
  v.category !== "" && v.title.trim() !== "" && v.content.trim() !== "";

/** 문의 유형·제목·내용 — 회원·비회원 작성 폼 공통 */
export function InquiryContentFields({
  value,
  onChange,
}: {
  value: InquiryContentValue;
  onChange: (next: InquiryContentValue) => void;
}) {
  return (
    <>
      <Dropdown
        label="문의 유형"
        essential
        placeholder="문의 유형을 골라 주세요"
        options={INQUIRY_CATEGORY_OPTIONS}
        value={value.category}
        onChange={(v) => {
          if (typeof v === "string") onChange({ ...value, category: v as InquiryCategory });
        }}
      />
      <TextField
        label="제목"
        essential
        maxLength={TITLE_MAX}
        placeholder="문의 제목을 입력해 주세요"
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
      />
      <TextArea
        label="내용"
        essential
        letterLimit={CONTENT_MAX}
        // 기본 120px 은 2,000자 문의를 쓰기에 좁다. 박스는 래퍼(items-start) 안에서
        // 내용 폭으로 줄어들므로 w-full 로 폼 폭을 채운다
        boxClassName="h-80 w-full mobile:h-60"
        maxLength={CONTENT_MAX}
        placeholder="궁금한 점을 자세히 적어 주시면 더 정확하게 답변드릴 수 있어요"
        value={value.content}
        onChange={(e) => onChange({ ...value, content: e.target.value })}
      />
    </>
  );
}
