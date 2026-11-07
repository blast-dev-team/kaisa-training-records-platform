import { useEffect } from "react";
import { useLocation } from "react-router";

import { getPageMeta } from "./page-meta";

function setMeta(selector: string, attr: "content" | "href", value: string) {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

/**
 * 라우트가 바뀔 때 title·description·canonical·og 태그를 그 페이지 값으로 맞춘다.
 * index.html 의 태그를 덮어쓰기만 한다 — 태그가 없으면 아무것도 하지 않는다.
 */
export function usePageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = getPageMeta(pathname);
    document.title = meta.title;
    setMeta('meta[name="description"]', "content", meta.description);
    setMeta('link[rel="canonical"]', "href", meta.canonical);
    setMeta('meta[property="og:title"]', "content", meta.title);
    setMeta('meta[property="og:description"]', "content", meta.description);
    setMeta('meta[property="og:url"]', "content", meta.canonical);
    setMeta('meta[name="twitter:title"]', "content", meta.title);
    setMeta('meta[name="twitter:description"]', "content", meta.description);
  }, [pathname]);
}
