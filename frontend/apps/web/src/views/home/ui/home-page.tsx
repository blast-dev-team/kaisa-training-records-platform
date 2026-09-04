export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold tracking-wide text-brand-700 uppercase">
        web
      </span>
      <h1 className="text-3xl font-bold text-ink">Kaisa</h1>
      <p className="text-ink-2">
        Vite + React SPA(FSD) 스캐폴드가 준비됐어요. <code>src/views</code> 부터 채워
        나가면 됩니다.
      </p>
    </main>
  );
}
