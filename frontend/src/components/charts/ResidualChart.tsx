import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcurementResponse } from '../../types/api'
import { fmtMw, fmtSigned } from '../../utils/format'
import { ukDateTime, ukDay, ukTime } from '../../utils/time'
import { AXIS, ChartFrame, COLORS, LegendItem, NoChartData, TooltipBox } from './common'

export function ResidualChart({ data }: { data: ProcurementResponse }) {
  const rows = useMemo(() => data.points
    .filter((p) => p.forecast_residual_mw != null || p.actual_residual_mw != null)
    .map((p) => ({ ...p, ts: Date.parse(p.t) })), [data])
  // only hourly points carry a forecast; draw the forecast line through them without bridging real gaps
  return (
    <ChartFrame title="Illustrative residual requirement" unit={`MW above ${fmtMw(data.demand_mw)} MW assumed demand`}
      range={ukDay(Date.parse(data.delivery_date + 'T12:00:00Z'))} height={280}
      legend={<>
        <LegendItem color={COLORS.forecast} label="Residual implied by forecast  max(0, D − forecast)" dot />
        {data.mode !== 'prospective' && <LegendItem color={COLORS.actual} label="Residual implied by actual  max(0, D − actual)" />}
      </>}>
      {!rows.length ? <NoChartData /> : (
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => ukTime(t)} {...AXIS} minTickGap={32} />
            <YAxis {...AXIS} width={52} tickFormatter={(x: number) => x.toLocaleString('en-GB')} label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 11 }} />
            <Tooltip isAnimationActive={false} content={({ active, payload }) => {
              const r = payload?.[0]?.payload as (typeof rows)[number] | undefined
              if (!active || !r) return null
              return <TooltipBox title={ukDateTime(r.ts)} rows={[
                { label: 'Forecast residual', value: r.forecast_residual_mw == null ? 'n/a' : `${fmtMw(r.forecast_residual_mw)} MW`, color: COLORS.forecast },
                { label: 'Actual residual', value: r.actual_residual_mw == null ? 'n/a' : `${fmtMw(r.actual_residual_mw)} MW`, color: COLORS.actual },
                { label: 'Residual error (R − R̂)', value: r.residual_error_mw == null ? 'n/a' : `${fmtSigned(r.residual_error_mw)} MW` },
              ]} />
            }} />
            <Line dataKey="forecast_residual_mw" stroke={COLORS.forecast} strokeWidth={2} dot={{ r: 2.5, fill: COLORS.forecast, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
            {data.mode !== 'prospective' && <Line dataKey="actual_residual_mw" stroke={COLORS.actual} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  )
}
