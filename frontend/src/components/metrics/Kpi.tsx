import type { ReactNode } from 'react'
import { InfoTip, KindBadge, type Kind } from '../ui'

export type Tone = 'neutral' | 'good' | 'caution' | 'bad'
const TONE: Record<Tone, string> = { neutral: 'text-ink', good: 'text-good', caution: 'text-caution', bad: 'text-bad' }

export function Kpi({ label, value, unit, sub, kind, tip, tone = 'neutral' }: {
  label: string; value: string; unit?: string; sub?: ReactNode; kind: Kind; tip?: string; tone?: Tone
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}{tip && <InfoTip text={tip} />}</span>
        <KindBadge kind={kind} />
      </div>
      <div className={`tnum mt-2 text-2xl font-semibold leading-none ${TONE[tone]}`}>
        {value}{unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  )
}
