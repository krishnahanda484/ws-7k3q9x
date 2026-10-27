import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Area } from 'recharts'
import type { AccuracyResponse } from '../../types/api'
import { fmtMw, fmtSigned } from '../../utils/format'
import { ukDateTime, ukDay } from '../../utils/time'
import { AXIS, ChartFrame, COLORS, LegendItem, NoChartData, timeTick, TooltipBox } from './common'

type Props = { data: AccuracyResponse }
const rangeLabel = (d: AccuracyResponse) => `${d.start_date} to ${d.end_date}`
const yFmt = (v: number) => v.toLocaleString('en-GB')
const MW = { value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 } as const

function useSeries(d: AccuracyResponse) {
  return d.points.map((p) => ({ ...p, ts: Date.parse(p.t) }))
}

/** Break the line where consecutive pairs are > 1h apart (e.g. a missing hour) instead of bridging it. */
function withGaps<T extends { ts: number }>(rows: T[]): (T | { ts: number })[] {
  const out: (T | { ts: number })[] = []
  rows.forEach((r, i) => {
    if (i > 0 && r.ts - rows[i - 1].ts > 61 * 60000) out.push({ ts: rows[i - 1].ts + 3600000 })
    out.push(r)
  })
  return out
}

const timeAxis = (rows: { ts: number }[]) => {
  const lo = rows[0].ts, hi = rows[rows.length - 1].ts
  return <XAxis dataKey="ts" type="number" scale="time" domain={[lo, hi]} tickFormatter={timeTick(hi - lo)} {...AXIS} minTickGap={40} />
}

export function ActualVsForecastChart({ data }: Props) {
  const rows = withGaps(useSeries(data)) as ReturnType<typeof useSeries>
  return (
    <ChartFrame title="Actual vs forecast" unit="MW" range={rangeLabel(data)} height={280}
      legend={<><LegendItem color={COLORS.actual} label="Actual (measured)" /><LegendItem color={COLORS.forecast} label="Forecast available at cutoff" /></>}>
      {!rows.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            {timeAxis(rows)}
            <YAxis {...AXIS} width={52} tickFormatter={yFmt} label={MW} />
            <Tooltip isAnimationActive={false} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r || r.actual_mw == null) return null
              return <TooltipBox title={ukDateTime(r.ts)} rows={[
                { label: 'Actual', value: `${fmtMw(r.actual_mw)} MW`, color: COLORS.actual },
                { label: 'Forecast', value: `${fmtMw(r.forecast_mw)} MW`, color: COLORS.forecast },
                { label: 'Error', value: `${fmtSigned(r.error_mw)} MW` },
                { label: 'Published', value: ukDateTime(r.publish_time_utc) },
              ]} />
            }} />
            <Line dataKey="actual_mw" stroke={COLORS.actual} strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line dataKey="forecast_mw" stroke={COLORS.forecast} strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}

export function AbsErrorChart({ data }: Props) {
  const rows = withGaps(useSeries(data)) as ReturnType<typeof useSeries>
  const mae = data.metrics.mae_mw
  return (
    <ChartFrame title="Absolute error over time" unit="MW |forecast - actual|" range={rangeLabel(data)} height={240}
      legend={<LegendItem color={COLORS.error} label="Absolute error" />}>
      {!rows.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            {timeAxis(rows)}
            <YAxis {...AXIS} width={52} tickFormatter={yFmt} label={MW} />
            <Tooltip isAnimationActive={false} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r || r.abs_error_mw == null) return null
              return <TooltipBox title={ukDateTime(r.ts)} rows={[{ label: 'Absolute error', value: `${fmtMw(r.abs_error_mw)} MW` }, { label: 'Signed error', value: `${fmtSigned(r.error_mw)} MW` }]} />
            }} />
            <Area dataKey="abs_error_mw" stroke={COLORS.error} fill={COLORS.error} fillOpacity={0.18} strokeWidth={1.2} dot={false} isAnimationActive={false} />
            {mae != null && <ReferenceLine y={mae} stroke={COLORS.axis} strokeDasharray="4 3" label={{ value: `MAE ${fmtMw(mae)}`, position: 'insideTopRight', fill: COLORS.axis, fontSize: 11 }} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}

export function ErrorHistogram({ data }: Props) {
  const bins = data.error_histogram.map((b) => ({ ...b, label: `${fmtSigned(b.bin_start_mw)} to ${fmtSigned(b.bin_end_mw)}`, mid: (b.bin_start_mw + b.bin_end_mw) / 2 }))
  const m = data.metrics
  return (
    <ChartFrame title="Signed error distribution" unit="count of intervals by error bucket (MW)" range={rangeLabel(data)} height={260}
      legend={<><LegendItem color={COLORS.over} label="Over-forecast (error > 0)" /><LegendItem color={COLORS.under} label="Under-forecast (error < 0)" /></>}>
      {!bins.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="mid" {...AXIS} tickFormatter={(v: number) => fmtSigned(v)} interval="preserveStartEnd" minTickGap={20} />
            <YAxis {...AXIS} width={40} allowDecimals={false} />
            <Tooltip isAnimationActive={false} cursor={{ fill: '#eef2f7' }} content={({ active, payload }) => {
              const b = payload?.[0]?.payload as (typeof bins)[number] | undefined
              if (!active || !b) return null
              return <TooltipBox title={`${b.label} MW`} rows={[{ label: 'Intervals', value: `${b.count}` }, { label: 'Share', value: `${((b.count / m.n) * 100).toFixed(1)}%` }]} />
            }} />
            <ReferenceLine x={bins.find((b) => b.bin_start_mw === 0)?.mid} stroke={COLORS.axis} />
            <Bar dataKey="count" isAnimationActive={false}>
              {bins.map((b) => <Cell key={b.bin_start_mw} fill={b.mid >= 0 ? COLORS.over : COLORS.under} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}

export function MaeByHourChart({ data }: Props) {
  const rows = data.by_hour.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))
  return (
    <ChartFrame title="MAE by hour of day" unit="MW" range={rangeLabel(data)} height={260}
      legend={<LegendItem color={COLORS.forecast} label="MAE per UK local delivery hour" />}>
      {!rows.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="label" {...AXIS} interval={2} />
            <YAxis {...AXIS} width={52} tickFormatter={yFmt} label={MW} />
            <Tooltip isAnimationActive={false} cursor={{ fill: '#eef2f7' }} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r) return null
              return <TooltipBox title={`Delivery hour ${r.label}`} rows={[
                { label: 'MAE', value: `${fmtMw(r.mae_mw)} MW` }, { label: 'RMSE', value: `${fmtMw(r.rmse_mw)} MW` },
                { label: 'Bias', value: `${fmtSigned(r.bias_mw)} MW` }, { label: 'Pairs (n)', value: `${r.n}` },
              ]} />
            }} />
            <Bar dataKey="mae_mw" fill={COLORS.forecast} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}

export function ScatterPlot({ data }: Props) {
  const pts = data.points
  const max = pts.length ? Math.ceil(Math.max(...pts.map((p) => Math.max(p.actual_mw, p.forecast_mw))) / 1000) * 1000 : 0
  return (
    <ChartFrame title="Forecast vs actual" unit="MW (dashed line: perfect forecast)" range={rangeLabel(data)} height={300}
      legend={<LegendItem color={COLORS.forecast} label="One point per hourly pair" dot />}>
      {!pts.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 6, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} />
            <XAxis type="number" dataKey="actual_mw" name="Actual" domain={[0, max]} {...AXIS} tickFormatter={yFmt} label={{ value: 'Actual (MW)', position: 'insideBottom', offset: -10, fill: COLORS.axis, fontSize: 11 }} />
            <YAxis type="number" dataKey="forecast_mw" name="Forecast" domain={[0, max]} {...AXIS} width={52} tickFormatter={yFmt} label={{ value: 'Forecast (MW)', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }} />
            <Tooltip isAnimationActive={false} cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as AccuracyResponse['points'][number] | undefined
              if (!active || !r) return null
              return <TooltipBox title={`${ukDay(r.t)} ${ukDateTime(r.t).slice(-9)}`} rows={[
                { label: 'Actual', value: `${fmtMw(r.actual_mw)} MW` }, { label: 'Forecast', value: `${fmtMw(r.forecast_mw)} MW` }, { label: 'Error', value: `${fmtSigned(r.error_mw)} MW` },
              ]} />
            }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={COLORS.axis} strokeDasharray="5 4" />
            <Scatter data={pts} fill={COLORS.forecast} fillOpacity={0.55} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
