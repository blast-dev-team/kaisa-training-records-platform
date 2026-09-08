import { Link, useSearchParams } from "react-router";
import { cn } from "@/src/shared/utils/cn";
import lnpLogo from "@/src/assets/lnp-logo.png";

const TAB_ITEMS = [
  { key: "use", label: "이용약관" },
  { key: "privacy", label: "개인정보 수집·이용" },
  { key: "refund", label: "환불정책" },
  { key: "unique-info", label: "고유식별 정보 처리" },
] as const;

type TermsTab = (typeof TAB_ITEMS)[number]["key"];
const DEFAULT_TAB: TermsTab = "use";

const TAB_CONTENT: Record<TermsTab, { title: string; paragraphs: string[] }> = {
  use: {
    title: "이용약관",
    paragraphs: ["이용약관 본문이 들어갑니다."],
  },
  privacy: {
    title: "개인정보 수집·이용",
    paragraphs: ["개인정보 수집 및 이용에 대한 안내 본문이 들어갑니다."],
  },
  refund: {
    title: "환불정책",
    paragraphs: ["환불정책 본문이 들어갑니다."],
  },
  "unique-info": {
    title: "고유식별 정보 처리",
    paragraphs: ["고유식별 정보 처리에 대한 안내 본문이 들어갑니다."],
  },
};

function parseTab(value: string | null): TermsTab {
  const found = TAB_ITEMS.find((item) => item.key === value);
  return found?.key ?? DEFAULT_TAB;
}

/** 이용약관 — 좌측 탭 선택에 따라 우측 고정 텍스트가 바뀌는 단일 페이지 */
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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-6">
          <Link to="/">
            <img src={lnpLogo} alt="KAISA" className="h-8" />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 gap-10 px-6 py-10">
        <nav className="flex w-52 shrink-0 flex-col gap-1">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectTab(item.key)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-sm font-semibold",
                tab === item.key
                  ? "bg-primary-50 text-primary-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="flex-1">
          <h1 className="text-xl font-bold text-ink">{content.title}</h1>
          <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
            {content.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
