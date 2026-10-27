import { AlertTriangle, Info, Loader2, Inbox } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { ApiError } from '../services/api'

export type Kind = 'measured' | 'forecast' | 'derived' | 'illustrative'

const KIND_STYLE: Record<Kind, string> = {
  measured: 'bg-slate-900 text-white',
  forecast: 'bg-blue-100 text-blue-900',
  derived: 'bg-slate-200 text-slate-800',
  illustrative: 'bg-amber-100 text-amber-900',
}
const KIND_LABEL: Record<Kind, string> = {
  measured: 'Measured', forecast: 'Forecast', derived: 'Derived', illustrative: 'Illustrative',
}

/** Explicit provenance tag: measured vs forecast vs derived metric vs illustrative scenario. */
export function KindBadge({ kind }: { kind: Kind }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>
}

export function Card({ title, subtitle, kind, actions, children, className = '' }: {
  title?: string; subtitle?: ReactNode; kind?: Kind; actions?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`rounded-lg border border-line bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">{title}{kind && <KindBadge kind={kind} />}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function InfoTip({ text }: { text: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button" aria-describedby={open ? id : undefined} aria-label="Definition"
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="ml-1 rounded text-muted hover:text-ink"
      ><Info size={13} /></button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-5 z-30 w-64 -translate-x-1/2 rounded-md bg-navy px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg">{text}</span>
      )}
    </span>
  )
}

export function Loading({ label = 'Loading data', height = 160 }: { label?: string; height?: number }) {
  return (
    <div role="status" style={{ minHeight: height }} className="flex items-center justify-center gap-2 text-sm text-muted">
      <Loader2 className="animate-spin" size={16} /> {label}...
    </div>
  )
}

export function ErrorBlock({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-red-200 bg-bad-bg p-4 text-sm text-bad">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{error.status === 0 ? 'API unreachable' : error.code === 'outside_data_window' ? 'Outside the data window' : 'Request failed'}</p>
        <p className="mt-0.5 text-ink">{error.message}</p>
        {onRetry && <button onClick={onRetry} className="mt-2 rounded border border-bad px-2 py-1 text-xs font-medium hover:bg-white">Retry</button>}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center text-sm text-muted">
      <Inbox size={22} /> <p className="font-medium text-ink">{title}</p>{children && <p className="max-w-md">{children}</p>}
    </div>
  )
}

/** Wrapper that renders loading / error / empty / content consistently. */
export function Async<T>({ state, empty, children, height }: {
  state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void }
  empty?: (d: T) => ReactNode | null
  children: (d: T) => ReactNode
  height?: number
}) {
  if (state.error) return <ErrorBlock error={state.error} onRetry={state.reload} />
  if (!state.data) return state.loading ? <Loading height={height} /> : null
  const e = empty?.(state.data)
  return (
    <div className={state.loading ? 'opacity-60 transition-opacity' : ''} aria-busy={state.loading}>
      {e ?? children(state.data)}
    </div>
  )
}

export function Callout({ tone, title, children }: { tone: 'info' | 'caution' | 'good'; title?: string; children: ReactNode }) {
  const t = { info: 'border-blue-200 bg-blue-50', caution: 'border-amber-300 bg-caution-bg', good: 'border-emerald-200 bg-good-bg' }[tone]
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${t}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-ink/90">{children}</div>
    </div>
  )
}
