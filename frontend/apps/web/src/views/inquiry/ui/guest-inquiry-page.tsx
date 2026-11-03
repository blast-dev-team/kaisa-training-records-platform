import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

import { useAuthStore } from "@/src/shared/store/auth-store";
import { Button, Checkbox, Tab, TextField } from "@/src/shared/ui";

import {
  lookupGuestInquiries,
  postGuestInquiry,
  type Inquiry,
  type InquiryCategory,
} from "../api/inquiry-api";
import {
  EMPTY_CONTENT,
  InquiryContentFields,
  isContentFilled,
  type InquiryContentValue,
} from "./inquiry-content-fields";
import { InquiryList } from "./inquiry-list";

const PASSWORD_RE = /^[0-9]{6,20}$/;
const phoneDigits = (v: string) => v.replace(/\D/g, "");
const isPhoneValid = (v: string) => phoneDigits(v).length >= 9 && phoneDigits(v).length <= 11;

/**
 * 문의하기(비회원) — 로그인 없이 문의를 남기고, 성명·연락처·비밀번호로 답변을 확인한다.
 * 탭은 URL `?tab=lookup`(내 문의 조회) / 기본(문의 남기기). 로그인 상태면 회원 문의함으로 보낸다.
 */
export function GuestInquiryPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "lookup" ? "lookup" : "new";

  if (isAuthenticated) return <Navigate to="/inquiries" replace />;

  const setTab = (next: "new" | "lookup") => {
    const params = new URLSearchParams(searchParams);
    if (next === "lookup") params.set("tab", "lookup");
    else params.delete("tab");
    setSearchParams(params);
  };

  return (
    <section className="flex flex-1 flex-col bg-[#f9f9f7] font-sans">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-12 mobile:py-8">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-28 leading-normal font-bold text-gray-900 mobile:text-24">문의하기</h1>
          <p className="text-14 leading-[1.6] text-gray-600">
            로그인 없이 문의를 남길 수 있어요. 남길 때 정한 비밀번호로 답변을 확인해요.
            <br />
            본인인증으로 로그인하면 회원 정보가 자동으로 입력돼요.
          </p>
        </div>
        <div role="tablist" className="flex justify-center">
          <Tab selected={tab === "new"} onClick={() => setTab("new")}>
            문의 남기기
          </Tab>
          <Tab selected={tab === "lookup"} onClick={() => setTab("lookup")}>
            내 문의 조회
          </Tab>
        </div>
        {tab === "new" ? <GuestInquiryForm onLookup={() => setTab("lookup")} /> : <GuestLookup />}
      </div>
    </section>
  );
}

interface GuestAuthorValue {
  name: string;
  phone: string;
  certNo: string;
  email: string;
  password: string;
  passwordConfirm: string;
}

const EMPTY_AUTHOR: GuestAuthorValue = {
  name: "",
  phone: "",
  certNo: "",
  email: "",
  password: "",
  passwordConfirm: "",
};

function GuestInquiryForm({ onLookup }: { onLookup: () => void }) {
  const [author, setAuthor] = useState<GuestAuthorValue>(EMPTY_AUTHOR);
  const [content, setContent] = useState<InquiryContentValue>(EMPTY_CONTENT);
  const [agreed, setAgreed] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const passwordError = author.password !== "" && !PASSWORD_RE.test(author.password);
  const confirmError = author.passwordConfirm !== "" && author.passwordConfirm !== author.password;
  const phoneError = author.phone !== "" && !isPhoneValid(author.phone);
  const canSubmit =
    author.name.trim() !== "" &&
    isPhoneValid(author.phone) &&
    PASSWORD_RE.test(author.password) &&
    author.password === author.passwordConfirm &&
    isContentFilled(content) &&
    agreed;

  const mutation = useMutation({
    mutationFn: () =>
      postGuestInquiry({
        category: content.category as InquiryCategory,
        title: content.title.trim(),
        content: content.content.trim(),
        name: author.name.trim(),
        phone: phoneDigits(author.phone),
        certNo: author.certNo.trim(),
        email: author.email.trim(),
        password: author.password,
        privacyAgreed: agreed,
        website,
      }),
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-solid border-gray-200 bg-white px-8 py-12 text-center">
        <p className="text-20 font-semibold text-gray-900">문의가 접수됐어요</p>
        <p className="text-14 leading-[1.6] text-gray-600">
          답변이 등록되면 &lsquo;내 문의 조회&rsquo;에서
          <br />
          성명·연락처·비밀번호로 확인할 수 있어요.
        </p>
        <Button size="m" onClick={onLookup}>
          내 문의 조회하기
        </Button>
      </div>
    );
  }

  const set = (patch: Partial<GuestAuthorValue>) => setAuthor((prev) => ({ ...prev, ...patch }));

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-solid border-gray-200 bg-white p-8 mobile:p-5"
    >
      <p className="text-16 font-semibold text-gray-900">문의자 정보</p>
      <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
        <TextField
          label="성명"
          essential
          maxLength={50}
          autoComplete="name"
          value={author.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <TextField
          label="연락처"
          essential
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="01012345678"
          value={author.phone}
          error={phoneError}
          helperText={phoneError ? "연락처를 확인해 주세요" : undefined}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <TextField
          label="감리원증번호"
          maxLength={100}
          placeholder="선택 — 예: 정보시스템감리협회 제1234호"
          value={author.certNo}
          onChange={(e) => set({ certNo: e.target.value })}
        />
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="선택"
          value={author.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <TextField
          label="비밀번호"
          essential
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={20}
          placeholder="숫자 6자리 이상"
          value={author.password}
          error={passwordError}
          helperText={passwordError ? "숫자 6~20자리로 입력해 주세요" : "답변을 확인할 때 필요해요"}
          onChange={(e) => set({ password: e.target.value })}
        />
        <TextField
          label="비밀번호 확인"
          essential
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={20}
          value={author.passwordConfirm}
          error={confirmError}
          helperText={confirmError ? "비밀번호가 서로 달라요" : undefined}
          onChange={(e) => set({ passwordConfirm: e.target.value })}
        />
      </div>

      <InquiryContentFields value={content} onChange={setContent} />

      {/* 봇 차단용 숨은 칸 — 화면·보조기기 모두에서 숨긴다 */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)}>
          문의 답변을 위한 개인정보 수집·이용에 동의합니다. (필수)
        </Checkbox>
        <Link to="/terms?tab=privacy" className="text-14 font-semibold text-primary-700 underline">
          전문보기
        </Link>
      </div>

      {mutation.isError && (
        <p className="text-14 text-red-500">
          {mutation.error instanceof Error ? mutation.error.message : "문의를 접수하지 못했어요"}
        </p>
      )}
      <Button type="submit" size="l" fullWidth disabled={!canSubmit || mutation.isPending}>
        {mutation.isPending ? "접수하는 중..." : "문의 남기기"}
      </Button>
    </form>
  );
}

function GuestLookup() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [results, setResults] = useState<Inquiry[] | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      lookupGuestInquiries({ name: name.trim(), phone: phoneDigits(phone), password }),
    onSuccess: setResults,
    onError: () => setResults(null),
  });

  const canSubmit = name.trim() !== "" && isPhoneValid(phone) && password !== "";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-solid border-gray-200 bg-white p-8 mobile:p-5"
      >
        <TextField label="성명" essential value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="연락처"
          essential
          type="tel"
          inputMode="numeric"
          placeholder="01012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          label="비밀번호"
          essential
          type="password"
          inputMode="numeric"
          maxLength={20}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mutation.isError && (
          <p className="text-14 text-red-500">
            {mutation.error instanceof Error ? mutation.error.message : "조회하지 못했어요"}
          </p>
        )}
        <Button type="submit" size="l" fullWidth disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? "조회하는 중..." : "내 문의 조회"}
        </Button>
      </form>
      {results && <InquiryList items={results} />}
    </div>
  );
}
