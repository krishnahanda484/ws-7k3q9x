import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProfileResponse, VintagesResponse } from '../../types/api'
import { fmtMw } from '../../utils/format'
import { ukDateTime, ukDay, ukTime } from '../../utils/time'
import { AXIS, ChartFrame, COLORS, LegendItem, NoChartData, TooltipBox } from './common'

export function VintageChart({ v, profile, showLate, highlight }: {
  v: VintagesResponse; profile: ProfileResponse | null; showLate: boolean; highlight: string | null
}) {
  const { rows, vintages } = useMemo(() => {
    const byTs = new Map<number, Record<string, number | null>>()
    const vs = v.vintages.filter((x) => x.eligible || showLate)
    vs.forEach((x, i) => x.series.forEach((p) => {
      const ts = Date.parse(p.t)
      byTs.set(ts, { ...(byTs.get(ts) ?? { ts }), [`v${i}`]: p.mw })
    }))
    v.selected_series.forEach((p) => { const ts = Date.parse(p.t); byTs.set(ts, { ...(byTs.get(ts) ?? { ts }), selected: p.mw }) })
    profile?.points.forEach((p) => {
      if (p.actual_mw != null) { const ts = Date.parse(p.t); byTs.set(ts, { ...(byTs.get(ts) ?? { ts }), actual: p.actual_mw }) }
    })
    return { rows: [...byTs.values()].sort((a, b) => (a.ts as number) - (b.ts as number)), vintages: vs }
  }, [v, profile, showLate])

  const day = ukDay(Date.parse(v.delivery_date + 'T12:00:00Z'))
  return (
    <ChartFrame title="Forecast vintages for the delivery day" unit="MW" range={day} height={360}
      legend={<>
        <LegendItem color={COLORS.forecast} label="Selected: latest published by cutoff, per hour" />
        <LegendItem color={COLORS.vintage} label="Other eligible vintages" />
        {showLate && <LegendItem color="#c9d3df" label="Published after cutoff (NOT usable for this decision)" dashed />}
        <LegendItem color={COLORS.actual} label="Actual (measured, after the fact)" />
      </>}>
      {!rows.length ? <NoChartData>No forecast publications cover this delivery day.</NoChartData> : (
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => ukTime(t)} {...AXIS} minTickGap={32} />
            <YAxis {...AXIS} width={52} tickFormatter={(x: number) => x.toLocaleString('en-GB')} label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }} />
            <Tooltip isAnimationActive={false} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as Record<string, number | null> | undefined
              if (!active || !r) return null
              return <TooltipBox title={ukDateTime(r.ts as number)} rows={[
                { label: 'Selected forecast', value: r.selected == null ? 'none' : `${fmtMw(r.selected)} MW`, color: COLORS.forecast },
                { label: 'Actual', value: r.actual == null ? 'n/a' : `${fmtMw(r.actual)} MW`, color: COLORS.actual },
              ]} />
            }} />
            {vintages.map((x, i) => (
              <Line key={x.publish_time_utc} dataKey={`v${i}`} dot={false} isAnimationActive={false} connectNulls={false}
                stroke={x.publish_time_utc === highlight ? '#d97706' : x.eligible ? COLORS.vintage : '#c9d3df'}
                strokeDasharray={x.eligible ? undefined : '4 3'} strokeWidth={x.publish_time_utc === highlight ? 2.4 : 1} strokeOpacity={x.publish_time_utc === highlight ? 1 : 0.8} />
            ))}
            <Line dataKey="selected" stroke={COLORS.forecast} strokeWidth={2.6} dot={{ r: 2.5, fill: COLORS.forecast, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
            <Line dataKey="actual" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
