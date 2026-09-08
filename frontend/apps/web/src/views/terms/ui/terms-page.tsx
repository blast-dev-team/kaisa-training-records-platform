import { Link, useSearchParams } from "react-router";

import { CaretLeftIcon } from "@/src/shared/icon/caret-left";
import { cn } from "@/src/shared/utils/cn";

const TAB_ITEMS = [
  { key: "use", label: "이용약관" },
  { key: "privacy", label: "개인정보 수집·이용" },
  { key: "refund", label: "환불정책" },
  { key: "unique-info", label: "고유식별정보 처리" },
] as const;

type TermsTab = (typeof TAB_ITEMS)[number]["key"];
const DEFAULT_TAB: TermsTab = "use";

interface TermsArticle {
  heading?: string;
  paragraphs: string[];
}

interface TermsDocument {
  title: string;
  /** 예: "시행일자 2026.01.01 · 개정 이력 보기" — 확정된 문서에만 표기 */
  meta?: string;
  articles: TermsArticle[];
}

const TAB_CONTENT: Record<TermsTab, TermsDocument> = {
  use: {
    title: "이용약관",
    meta: "시행일자 2026.01.01 · 개정 이력 보기",
    articles: [
      {
        heading: "제1조 (목적)",
        paragraphs: [
          '본 약관은 대한검사교육협회(이하 "협회")가 운영하는 계속교육이력확인서 발급 서비스(이하 "서비스")의 이용 조건 및 절차, 협회와 이용자의 권리·의무에 관한 사항을 규정함을 목적으로 합니다.',
        ],
      },
      {
        heading: "제2조 (정의)",
        paragraphs: [
          '① "서비스"란 협회가 제공하는 계속교육이력확인서 온라인 발급 및 진위확인 서비스를 말합니다.',
          '② "이용자"란 본 약관에 따라 서비스를 이용하는 자를 말합니다.',
          '③ "확인서"란 협회가 발급하는 계속교육이력확인서를 말합니다.',
        ],
      },
      {
        heading: "제3조 (약관의 효력 및 변경)",
        paragraphs: [
          "① 본 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.",
          "② 협회는 관련 법령에 위배되지 않는 범위에서 약관을 개정할 수 있으며, 개정 시 적용일자 7일 전 공지합니다.",
        ],
      },
    ],
  },
  privacy: {
    title: "개인정보 수집·이용",
    articles: [
      { paragraphs: ["개인정보 수집 및 이용에 대한 안내 본문이 들어갑니다."] },
    ],
  },
  refund: {
    title: "환불정책",
    articles: [{ paragraphs: ["환불정책 본문이 들어갑니다."] }],
  },
  "unique-info": {
    title: "고유식별정보 처리",
    articles: [
      { paragraphs: ["고유식별정보 처리에 대한 안내 본문이 들어갑니다."] },
    ],
  },
};

function parseTab(value: string | null): TermsTab {
  const found = TAB_ITEMS.find((item) => item.key === value);
  return found?.key ?? DEFAULT_TAB;
}

/** 이용약관 — Figma 디자인(node 44:28) 반영. 좌측 탭(?tab=)으로 문서 전환 */
export function TermsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const content = TAB_CONTENT[tab];

  // 기본 탭은 URL에서 키를 생략해 기본 주소와 공유
  const selectTab = (key: TermsTab) => {
    const next = new URLSearchParams(searchParams);
    if (key === DEFAULT_TAB) next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-[60px] pb-12 pt-8">
      <Link
        to="/"
        className="flex items-center gap-2 self-start text-gray-700"
        aria-label="이전 페이지로 돌아가기"
      >
        <CaretLeftIcon className="size-8" />
        <span className="text-[28px] font-bold leading-tight text-gray-900">
          약관
        </span>
      </Link>

      <div className="flex gap-8">
        <nav className="flex w-40 shrink-0 flex-col">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectTab(item.key)}
              className={cn(
                "cursor-pointer px-4 py-3 text-left text-sm transition-colors",
                tab === item.key
                  ? "bg-gray-900 font-semibold text-white"
                  : "font-normal text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-1 flex-col gap-5">
          <h1 className="text-[22px] font-bold leading-tight text-gray-900">
            {content.title}
          </h1>
          {content.meta && (
            <p className="text-[13px] text-gray-500">{content.meta}</p>
          )}
          {content.articles.map((article, index) => (
            <article key={article.heading ?? index}>
              {article.heading && (
                <h2 className="mb-5 text-base font-bold text-gray-900">
                  {article.heading}
                </h2>
              )}
              {article.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-sm leading-6 text-gray-700"
                >
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
