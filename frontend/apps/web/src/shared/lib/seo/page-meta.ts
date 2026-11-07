/** 검색결과·탭에 보일 페이지별 제목/설명 — 사이트링크 이름도 이 제목에서 뽑힌다 */

export const SITE_NAME = "정보시스템감리협회 교육내역 서비스";
const ORIGIN = "https://edu.kaisa.or.kr";
const BRAND = "정보시스템감리협회";

const DEFAULT_DESCRIPTION =
  "(사)정보시스템감리협회(KAISA) 교육내역 조회·진위확인·교육이수 확인서 발급 서비스";

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
}

/** 경로 → [페이지명, 설명]. 없는 경로는 홈 메타를 쓴다 */
const PAGES: Record<string, [string, string]> = {
  "/verification-no-auth": [
    "확인서 진위확인",
    "정보시스템감리협회에서 발급한 교육이수 확인서의 문서번호로 진위 여부를 확인할 수 있어요.",
  ],
  "/inquiry": [
    "문의하기",
    "정보시스템감리협회 교육내역·확인서 발급에 대해 문의를 남기고 답변을 확인할 수 있어요.",
  ],
  "/terms": ["이용약관", "정보시스템감리협회 교육내역 서비스 이용약관과 개인정보처리방침이에요."],
  "/training-history": ["교육이력 조회", DEFAULT_DESCRIPTION],
  "/payment-history": ["발급·결제 내역", DEFAULT_DESCRIPTION],
  "/verify": ["확인서 진위확인", DEFAULT_DESCRIPTION],
  "/inquiries": ["내 문의", DEFAULT_DESCRIPTION],
};

export function getPageMeta(pathname: string): PageMeta {
  const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  const page = PAGES[path];
  if (!page) {
    return { title: SITE_NAME, description: DEFAULT_DESCRIPTION, canonical: `${ORIGIN}/` };
  }
  const [name, description] = page;
  return { title: `${name} | ${BRAND}`, description, canonical: `${ORIGIN}${path}` };
}
