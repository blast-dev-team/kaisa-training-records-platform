export function Badge({
  variant = 'default',
  className = '',
  children,
}: {
  variant?: 'default' | 'secondary' | 'outline'
  className?: string
  children: React.ReactNode
}) {
  const baseClasses = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium'

  const variantClasses = {
    default: 'bg-accent text-white',
    secondary: 'bg-panel-2 text-ink-2 border border-line',
    outline: 'border border-line text-ink-2 bg-transparent',
  }

  return (
    <span className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  )
}
