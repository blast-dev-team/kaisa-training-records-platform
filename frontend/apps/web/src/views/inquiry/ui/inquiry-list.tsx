import { useState } from "react";

import { Chip } from "@/src/shared/ui";
import { cn } from "@/src/shared/utils/cn";

import { categoryLabel, type Inquiry } from "../api/inquiry-api";

/** 서버 timestamptz → 로컬(KST) 'YYYY.MM.DD' — 문자열 slice 금지(하루 어긋남) */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** 내 문의 목록 — 행을 누르면 문의 내용과 답변이 펼쳐진다 */
export function InquiryList({ items }: { items: Inquiry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-solid border-gray-200 bg-white px-4 py-12 text-center text-14 text-gray-500">
        아직 남긴 문의가 없어요. 궁금한 점이 있으면 새 문의를 남겨 주세요
      </div>
    );
  }

  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border border-solid border-gray-200 bg-white">
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <li key={item.id} className="border-b border-solid border-gray-200 last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left mobile:flex-wrap mobile:gap-2 mobile:px-4"
            >
              <Chip shape="square" color={item.status === "answered" ? "green" : "gray"}>
                {item.status === "answered" ? "답변 완료" : "답변 대기"}
              </Chip>
              <span className="shrink-0 text-13 text-gray-500">{categoryLabel(item.category)}</span>
              <span className="min-w-0 flex-1 truncate text-15 font-semibold text-gray-900 mobile:basis-full">
                {item.title}
              </span>
              <span className="shrink-0 text-13 text-gray-500">{formatDate(item.createdAt)}</span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-4 bg-gray-50 px-5 py-5 mobile:px-4">
                <p className="text-14 leading-[1.7] whitespace-pre-wrap text-gray-800">
                  {item.content}
                </p>
                <div
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-solid px-4 py-4",
                    item.answer ? "border-primary-200 bg-white" : "border-gray-200 bg-white",
                  )}
                >
                  <p className="text-13 font-semibold text-primary-700">
                    협회 답변{item.answeredAt ? ` · ${formatDate(item.answeredAt)}` : ""}
                  </p>
                  <p className="text-14 leading-[1.7] whitespace-pre-wrap text-gray-800">
                    {item.answer ?? "답변을 준비하고 있어요. 조금만 기다려 주세요"}
                  </p>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
