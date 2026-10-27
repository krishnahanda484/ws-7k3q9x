import { RotateCcw } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useDecision } from '../../hooks/decision'
import type { Metadata } from '../../types/api'
import { ukDateTime, ukZone } from '../../utils/time'
import { InfoTip } from '../ui'

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

function Field({ label, tip, children }: { label: string; tip?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}{tip && <InfoTip text={tip} />}</label>
      {children(id)}
    </div>
  )
}
const input = 'h-9 rounded-md border border-line bg-white px-2 text-sm text-ink'

/** Decision context: delivery date, cutoff (UK local), optional delivery period. */
export function DecisionBar({ meta }: { meta: Metadata | null }) {
  const { decision: d, set, setDate, reset, params } = useDecision()
  const min = meta?.window_start_date ?? '2026-01-01'
  const max = meta?.window_end_date ?? '2026-01-31'
  const zone = ukZone(params.cutoff)
  return (
    <section aria-label="Decision context" className="border-b border-line bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Delivery date" tip="The UK calendar day the electricity will be delivered. Limited to the cached January 2026 window.">
          {(id) => <input id={id} type="date" className={input} min={min} max={max} value={d.date}
            onChange={(e) => e.target.value >= min && e.target.value <= max && setDate(e.target.value)} />}
        </Field>
        <Field label={`Decision cutoff date (UK)`} tip="Only forecasts published at or before this moment are used. Anything published later is ignored to avoid look-ahead bias.">
          {(id) => <input id={id} type="date" className={input} value={d.cutoffDate} max={d.date} onChange={(e) => e.target.value && set({ cutoffDate: e.target.value })} />}
        </Field>
        <Field label={`Cutoff time (${zone})`}>
          {(id) => <input id={id} type="time" step={60} className={input} value={d.cutoffTime} onChange={(e) => e.target.value && set({ cutoffTime: e.target.value })} />}
        </Field>
        <Field label="Period from" tip="Optional: restrict the analysis to part of the delivery day (UK local time).">
          {(id) => (
            <select id={id} className={input} value={d.periodFrom} onChange={(e) => set({ periodFrom: e.target.value })}>
              <option value="">00:00 (day start)</option>
              {HALF_HOURS.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <Field label="Period to">
          {(id) => (
            <select id={id} className={input} value={d.periodTo} onChange={(e) => set({ periodTo: e.target.value })}>
              <option value="">24:00 (day end)</option>
              {HALF_HOURS.slice(1).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm text-muted hover:bg-canvas hover:text-ink">
          <RotateCcw size={14} /> Reset
        </button>
        <p className="tnum basis-full text-xs text-muted lg:ml-auto lg:basis-auto">
          Times are UK local ({zone}). Cutoff = {ukDateTime(params.cutoff)} = {params.cutoff.replace('T', ' ').replace('Z', ' UTC')}
        </p>
      </div>
    </section>
  )
}
