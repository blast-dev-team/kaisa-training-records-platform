export function PageHead({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div>
        <h1 className="text-[22px] font-semibold text-ink leading-none">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
