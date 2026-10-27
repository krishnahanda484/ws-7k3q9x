import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProfileResponse } from '../../types/api'
import { fmtMw, fmtSigned } from '../../utils/format'
import { ukDateTime, ukDay, ukTime } from '../../utils/time'
import { AXIS, ChartFrame, COLORS, LegendItem, NoChartData, timeTick, TooltipBox } from './common'

interface Row {
  ts: number
  actual: number | null
  forecast: number | null
  error: number | null
  publish: string | null
  band: [number, number] | null
  [seg: string]: unknown
}

/** Split hourly forecast points into contiguous segments so a missing forecast hour breaks the line
 *  (no interpolation across real gaps). Within a segment the line joins consecutive hourly values. */
function buildRows(p: ProfileResponse) {
  const rows: Row[] = []
  let seg = -1
  let lastFcTs = -Infinity
  for (const pt of p.points) {
    const ts = Date.parse(pt.t)
    const row: Row = {
      ts, actual: pt.actual_mw, forecast: pt.forecast_mw, error: pt.error_mw, publish: pt.publish_time_utc,
      band: pt.band_low_mw != null && pt.band_high_mw != null ? [pt.band_low_mw, pt.band_high_mw] : null,
    }
    if (pt.forecast_mw != null) {
      if (ts - lastFcTs > 61 * 60000) seg += 1
      row[`fc${seg}`] = pt.forecast_mw
      lastFcTs = ts
    }
    rows.push(row)
  }
  return { rows, segs: seg + 1 }
}

export function ProfileChart({ profile, showBand, cutoffMs }: { profile: ProfileResponse; showBand: boolean; cutoffMs: number }) {
  const { rows, segs } = useMemo(() => buildRows(profile), [profile])
  const has = rows.some((r) => r.forecast != null || r.actual != null)
  const start = Date.parse(profile.window_start)
  const end = Date.parse(profile.window_end)
  const span = end - start
  const band = profile.uncertainty_band
  const retro = profile.mode !== 'prospective'

  return (
    <ChartFrame
      title="Wind generation profile"
      unit="MW"
      range={`${ukDay(start)} ${ukTime(start)}–${ukTime(end)}`}
      height={340}
      legend={<>
        <LegendItem color={COLORS.forecast} label={`Forecast (latest published by cutoff, hourly)`} dot />
        {retro && <LegendItem color={COLORS.actual} label="Actual outturn (measured after the decision, 30-min)" />}
        {showBand && band && <LegendItem color={COLORS.band} label={`Historical P10–P90 band (n=${band.n})`} />}
      </>}
    >
      {!has ? <NoChartData>No forecast was published by this cutoff and no actuals exist for this period.</NoChartData> : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={[start, end]} tickFormatter={timeTick(span)} {...AXIS} minTickGap={32} />
            <YAxis {...AXIS} width={52} tickFormatter={(v: number) => v.toLocaleString('en-GB')} label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }} />
            <Tooltip
              isAnimationActive={false}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as Row | undefined
                if (!active || !r) return null
                return <TooltipBox title={`${ukDay(r.ts)} ${ukDateTime(r.ts).slice(-9)}`} rows={[
                  { label: 'Forecast', value: r.forecast == null ? 'no forecast' : `${fmtMw(r.forecast)} MW`, color: COLORS.forecast },
                  { label: 'Actual', value: r.actual == null ? 'not available' : `${fmtMw(r.actual)} MW`, color: COLORS.actual },
                  { label: 'Error (fcst - actual)', value: r.error == null ? 'n/a' : `${fmtSigned(r.error)} MW` },
                  ...(r.publish ? [{ label: 'Forecast published', value: ukDateTime(r.publish) }] : []),
                ]} />
              }}
            />
            {showBand && band && <Area dataKey="band" type="linear" stroke="none" fill={COLORS.band} fillOpacity={0.13} connectNulls isAnimationActive={false} legendType="none" />}
            {Array.from({ length: segs }, (_, i) => (
              <Line key={i} dataKey={`fc${i}`} type="linear" stroke={COLORS.forecast} strokeWidth={2} dot={{ r: 2.5, fill: COLORS.forecast, strokeWidth: 0 }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            ))}
            {retro && <Line dataKey="actual" type="linear" stroke={COLORS.actual} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />}
            {cutoffMs > start && cutoffMs < end && <ReferenceLine x={cutoffMs} stroke={COLORS.error} strokeDasharray="4 3" label={{ value: 'cutoff', fill: COLORS.error, fontSize: 11, position: 'top' }} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
