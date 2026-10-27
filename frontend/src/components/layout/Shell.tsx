import { BarChart3, BookOpen, Database, GitBranch, LayoutDashboard, Wind, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ApiState } from '../../hooks/useApi'
import type { Health, Metadata } from '../../types/api'
import { ukDate, ukDateTime } from '../../utils/time'

export type PageId = 'overview' | 'explorer' | 'accuracy' | 'methodology'

export const NAV: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'explorer', label: 'Forecast Explorer', icon: GitBranch },
  { id: 'accuracy', label: 'Accuracy Analysis', icon: BarChart3 },
  { id: 'methodology', label: 'Data & Methodology', icon: BookOpen },
]

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  const c = ok == null ? 'bg-slate-400' : ok ? 'bg-emerald-500' : 'bg-red-500'
  return <span className="inline-flex items-center gap-1.5"><i className={`inline-block size-2 rounded-full ${c}`} />{label}</span>
}

export function DataStatus({ health, meta }: { health: ApiState<Health>; meta: ApiState<Metadata> }) {
  const apiOk = health.error ? false : health.data ? health.data.status === 'ok' : null
  const m = meta.data
  const real = m?.data_mode === 'elexon_cached'
  const windowEnd = m?.window_end_date
  const latestFc = m?.latest_forecast_publish_utc
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300" aria-label="Data and API status">
      <StatusDot ok={apiOk} label={apiOk == null ? 'API: checking' : apiOk ? 'API online' : health.error ? 'API unreachable' : 'API degraded: no data loaded'} />
      {m && (
        <>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${real ? 'bg-emerald-900/60 text-emerald-200' : 'bg-amber-500 text-black'}`}>
            {real ? 'REAL ELEXON DATA · CACHED' : `DEMO / FIXTURE DATA (${m.data_mode})`}
          </span>
          <span title={`Extract taken ${ukDateTime(m.extracted_at_utc)}`}>Extracted {ukDate(m.extracted_at_utc)}</span>
          <span>Window {m.window_start_date} → {windowEnd}</span>
          {latestFc && <span>Latest forecast in cache: {ukDateTime(latestFc)}</span>}
        </>
      )}
    </div>
  )
}

export function Shell({ page, onNav, status, controls, children }: {
  page: PageId; onNav: (p: PageId) => void; status: ReactNode; controls: ReactNode; children: ReactNode
}) {
  const title = NAV.find((n) => n.id === page)!.label
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="bg-navy text-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-3 lg:py-5">
          <span className="grid size-8 place-items-center rounded-md bg-navy-2 text-accent"><Wind size={18} /></span>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">WindSight</p>
            <p className="text-[11px] text-slate-400">UK Wind Forecast Intelligence</p>
          </div>
        </div>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-3 lg:pb-0">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onNav(id)} aria-current={page === id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${page === id ? 'bg-navy-2 font-semibold text-white' : 'text-slate-300 hover:bg-navy-2/60 hover:text-white'}`}>
              <Icon size={16} className={page === id ? 'text-accent' : ''} /> {label}
            </button>
          ))}
        </nav>
        <p className="hidden px-5 pt-8 text-[11px] leading-relaxed text-slate-400 lg:block">
          <Database size={12} className="mr-1 inline" />
          Source: Elexon BMRS FUELHH (actuals) and WINDFOR (forecasts). National GB wind only. No weather, demand or price data.
        </p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="bg-navy px-4 py-2.5 text-white sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">{title}</h1>
            {status}
          </div>
        </header>
        {controls}
        <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-2 text-[11px] leading-relaxed text-muted sm:px-6">
          Contains BMRS data © Elexon Limited, used under the Elexon open data licence. Built with AI assistance (Claude Code). Illustrative tools are not trading advice.
        </footer>
      </div>
    </div>
  )
}
