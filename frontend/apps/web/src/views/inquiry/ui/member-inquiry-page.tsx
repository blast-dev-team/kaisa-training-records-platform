import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { Button, Tab } from "@/src/shared/ui";

import {
  getMemberAuthor,
  getMyInquiries,
  postMyInquiry,
  type InquiryCategory,
} from "../api/inquiry-api";
import {
  EMPTY_CONTENT,
  InquiryContentFields,
  isContentFilled,
  type InquiryContentValue,
} from "./inquiry-content-fields";
import { InquiryList } from "./inquiry-list";

const QUERY_KEY = ["inquiries", "mine"] as const;

/**
 * 문의하기(회원) — 사이드바 메뉴. 탭은 URL `?tab=new`(새 문의 작성) / 기본(내 문의).
 * 문의자 정보(성명·감리원번호·연락처)는 회원 정보로 자동 입력되고 고칠 수 없다.
 */
export function MemberInquiryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "new" ? "new" : "list";
  const [notice, setNotice] = useState<string | null>(null);

  const setTab = (next: "list" | "new") => {
    const params = new URLSearchParams(searchParams);
    if (next === "new") params.set("tab", "new");
    else params.delete("tab");
    setSearchParams(params);
  };

  return (
    <section className="flex flex-col gap-6 mobile:gap-5">
      <h1 className="font-sans text-28 leading-normal font-bold text-gray-900 mobile:text-24">
        문의하기
      </h1>
      <div role="tablist" className="flex">
        <Tab selected={tab === "list"} onClick={() => setTab("list")}>
          내 문의
        </Tab>
        <Tab selected={tab === "new"} onClick={() => setTab("new")}>
          새 문의 작성
        </Tab>
      </div>
      {notice && tab === "list" && (
        <p className="rounded-lg bg-primary-50 px-4 py-3 text-14 text-primary-700">{notice}</p>
      )}
      {tab === "list" ? (
        <MyInquiries />
      ) : (
        <NewInquiryForm
          onDone={() => {
            setNotice("문의가 접수됐어요. 답변이 등록되면 이 목록에서 확인할 수 있어요");
            setTab("list");
          }}
        />
      )}
    </section>
  );
}

function MyInquiries() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getMyInquiries,
  });
  if (isLoading) {
    return (
      <div className="rounded-xl border border-solid border-gray-200 bg-white px-4 py-12 text-center text-14 text-gray-500">
        문의 내역을 불러오고 있어요
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-solid border-gray-200 bg-white px-4 py-12 text-14 text-gray-500">
        <p>{error instanceof Error ? error.message : "문제가 생겼어요. 잠시 후 다시 시도해 주세요"}</p>
        <Button variant="outlined" size="s" onClick={() => refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }
  return <InquiryList items={data ?? []} />;
}

function NewInquiryForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState<InquiryContentValue>(EMPTY_CONTENT);
  const author = useQuery({ queryKey: ["inquiries", "author"], queryFn: getMemberAuthor });

  const mutation = useMutation({
    mutationFn: () =>
      postMyInquiry({
        category: content.category as InquiryCategory,
        title: content.title.trim(),
        content: content.content.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setContent(EMPTY_CONTENT);
      onDone();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isContentFilled(content) || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-solid border-gray-200 bg-white p-8 mobile:p-5"
    >
      <div className="flex flex-col gap-2 rounded-lg bg-gray-50 px-4 py-4">
        <p className="text-13 font-semibold text-gray-700">문의자 정보 (회원 정보로 자동 입력)</p>
        {author.isLoading ? (
          <p className="text-14 text-gray-500">회원 정보를 불러오고 있어요</p>
        ) : author.data ? (
          <dl className="grid grid-cols-[88px_1fr] gap-y-1 text-14 text-gray-800">
            <dt className="text-gray-500">성명</dt>
            <dd>{author.data.name}</dd>
            <dt className="text-gray-500">자격증번호</dt>
            <dd>{author.data.certNo ?? "—"}</dd>
            <dt className="text-gray-500">연락처</dt>
            <dd>{author.data.phoneMasked ?? "—"}</dd>
          </dl>
        ) : (
          <p className="text-14 text-gray-500">회원 정보를 불러오지 못했어요. 문의는 그대로 남길 수 있어요</p>
        )}
        <p className="text-12 text-gray-500">회원 정보 변경이 필요하면 내용에 함께 적어 주세요</p>
      </div>

      <InquiryContentFields value={content} onChange={setContent} />

      {mutation.isError && (
        <p className="text-14 text-red-500">
          {mutation.error instanceof Error ? mutation.error.message : "문의를 접수하지 못했어요"}
        </p>
      )}
      <Button type="submit" size="l" fullWidth disabled={!isContentFilled(content) || mutation.isPending}>
        {mutation.isPending ? "접수하는 중..." : "문의 남기기"}
      </Button>
    </form>
  );
}
