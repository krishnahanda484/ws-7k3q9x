import { useState } from 'react'
import { AbsErrorChart, ActualVsForecastChart, ErrorHistogram, MaeByHourChart, ScatterPlot } from '../components/charts/AccuracyCharts'
import { Kpi } from '../components/metrics/Kpi'
import { MetricsTable } from '../components/metrics/MetricsTable'
import { Async, Callout, Card } from '../components/ui'
import { useDecision } from '../hooks/decision'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { biasLabel, fmtMw, fmtPct, fmtSigned } from '../utils/format'

export function AccuracyAnalysis({ windowStart, windowEnd }: { windowStart: string; windowEnd: string }) {
  const { decision, cutoffDaysBefore } = useDecision()
  const [start, setStart] = useState(windowStart)
  const [end, setEnd] = useState(windowEnd)
  const bad = start > end
  const key = `${start}|${end}|${cutoffDaysBefore}|${decision.cutoffTime}`
  const state = useApi((s) => api.accuracy(start, end, cutoffDaysBefore, decision.cutoffTime, s), key, !bad)
  const dateInput = 'h-9 rounded-md border border-line bg-white px-2 text-sm'

  return (
    <>
      <Card title="Evaluation set-up" kind="derived" subtitle="Back-test of the decision rule defined by the cutoff above, replayed for every delivery day in the range.">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ev-start" className="text-[11px] font-semibold uppercase tracking-wide text-muted">First delivery date</label>
            <input id="ev-start" type="date" className={dateInput} min={windowStart} max={windowEnd} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ev-end" className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last delivery date</label>
            <input id="ev-end" type="date" className={dateInput} min={windowStart} max={windowEnd} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} />
          </div>
          <p className="max-w-xl text-sm text-ink/80">
            Rule: for each delivery date use the forecast published at or before <strong>{decision.cutoffTime} UK time, {cutoffDaysBefore} day(s) earlier</strong>. Change the cutoff in the bar above to test another rule.
          </p>
        </div>
        {bad && <p role="alert" className="mt-2 text-sm text-bad">The first date must not be after the last date.</p>}
      </Card>

      {!bad && <Async state={state} height={420} empty={(d) => d.metrics.n === 0 ? (
        <Card><div className="py-6 text-center text-sm text-muted">No forecast/actual pairs exist for this range and cutoff rule ({String(d.coverage.forecast_hours_without_eligible_vintage)} forecast hours had no eligible publication).</div></Card>
      ) : null}>{(d) => {
        const m = d.metrics
        const c = d.coverage
        return (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi kind="derived" label="MAE" value={fmtMw(m.mae_mw)} unit="MW" sub={`${fmtPct(m.nmae_pct_of_mean_actual)} of mean actual`} tip="Mean |forecast − actual|." />
              <Kpi kind="derived" label="RMSE" value={fmtMw(m.rmse_mw)} unit="MW" tip="Root mean squared error." sub={`P95 abs error ${fmtMw(m.abs_error_p95_mw)} MW`} />
              <Kpi kind="derived" label="Bias" value={fmtSigned(m.bias_mw)} unit="MW" sub={`${biasLabel(m.bias_mw)} · ${fmtPct((m.overforecast_share ?? 0) * 100, 0)} of hours over`} tip="Mean of (forecast − actual). Positive = over-forecast." tone={Math.abs(m.bias_mw ?? 0) / (m.mean_actual_mw || 1) > 0.1 ? 'caution' : 'neutral'} />
              <Kpi kind="derived" label="MAPE" value={fmtPct(m.mape_pct)} sub={`n=${m.mape_n}${m.mape_excluded_zero_actuals ? `, ${m.mape_excluded_zero_actuals} zero actuals excluded` : ''}`} tip="Mean |error/actual| × 100; zero actuals excluded." />
              <Kpi kind="derived" label="Valid pairs" value={String(m.n)} sub={`${String(c.actual_intervals_without_forecast)} half-hour actuals unpaired`} tip="Hourly timestamps present in both datasets." />
            </div>

            <Callout tone="info" title="Reading these numbers">
              {d.sign_convention}. Mean actual in the paired sample is {fmtMw(m.mean_actual_mw)} MW vs mean forecast {fmtMw(m.mean_forecast_mw)} MW.
              {' '}A persistent bias of this size may partly reflect scope differences between the two Elexon datasets (WINDFOR is a national forecast; FUELHH reports metered outturn), not forecast skill alone - see Data &amp; Methodology.
            </Callout>

            <Card><ActualVsForecastChart data={d} /></Card>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card><AbsErrorChart data={d} /></Card>
              <Card><ErrorHistogram data={d} /></Card>
              <Card><MaeByHourChart data={d} /></Card>
              <Card><ScatterPlot data={d} /></Card>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title="Metrics summary" kind="derived" subtitle={`${d.start_date} to ${d.end_date} · MW unless stated`}><MetricsTable m={m} /></Card>
              <Card title="Error by delivery day" kind="derived" subtitle="Hindsight; one row per UK delivery date">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white"><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 font-medium">Date</th><th className="py-2 text-right font-medium">n</th><th className="py-2 text-right font-medium">MAE</th><th className="py-2 text-right font-medium">RMSE</th><th className="py-2 text-right font-medium">Bias</th>
                    </tr></thead>
                    <tbody>{d.by_day.map((r) => (
                      <tr key={r.date} className="border-b border-line/60">
                        <td className="tnum py-1.5">{r.date}</td><td className="tnum py-1.5 text-right text-muted">{r.n}</td>
                        <td className="tnum py-1.5 text-right">{fmtMw(r.mae_mw)}</td><td className="tnum py-1.5 text-right">{fmtMw(r.rmse_mw)}</td>
                        <td className={`tnum py-1.5 text-right ${(r.bias_mw ?? 0) > 0 ? 'text-caution' : 'text-forecast'}`}>{fmtSigned(r.bias_mw)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </Card>
            </div>
            <p className="text-xs text-muted">{String(c.note)} Energy note: MW values are averages. Converting a half-hour average to energy multiplies by 0.5 h (e.g. signed error total {fmtMw(m.total_signed_error_mwh_assuming_half_hour)} MWh under that assumption).</p>
          </>
        )
      }}</Async>}
    </>
  )
}
