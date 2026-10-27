import type { ReactNode } from 'react'
import { ukDay, ukTime } from '../../utils/time'
import { Empty } from '../ui'

export const COLORS = {
  actual: '#0f1c2b',
  forecast: '#2763c9',
  band: '#2763c9',
  error: '#b45309',
  over: '#b45309',
  under: '#2763c9',
  grid: '#e4e9ef',
  axis: '#55657a',
  vintage: '#9db4d6',
  good: '#1f7a55',
}

export const AXIS = { stroke: COLORS.axis, fontSize: 11, tickLine: false } as const

/** Time-axis tick: clock time for <= 2 day ranges, otherwise date. Always UK local. */
export function timeTick(spanMs: number) {
  return (v: number) => (spanMs <= 2 * 86400000 ? ukTime(v) : ukDay(v))
}

export function ChartFrame({ title, unit, range, children, height = 300, legend }: {
  title: string; unit: string; range: string; children: ReactNode; height?: number; legend?: ReactNode
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs text-muted">{unit} · {range} · UK local time</span>
      </figcaption>
      {legend && <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{legend}</div>}
      <div style={{ height }} className="w-full">{children}</div>
    </figure>
  )
}

export function LegendItem({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="8" aria-hidden>
        <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2.2" strokeDasharray={dashed ? '4 3' : undefined} />
        {dot && <circle cx="9" cy="4" r="2.6" fill={color} />}
      </svg>
      {label}
    </span>
  )
}

export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="tnum flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <i className="inline-block size-2 rounded-full" style={{ background: r.color }} />}{r.label}
          </span>
          <span className="font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

export const NoChartData = ({ children }: { children?: ReactNode }) => (
  <Empty title="No data for this selection">{children ?? 'Nothing to chart for the chosen dates and cutoff.'}</Empty>
)
