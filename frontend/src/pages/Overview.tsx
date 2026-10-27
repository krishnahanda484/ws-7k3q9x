import { Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { ProfileChart } from '../components/charts/ProfileChart'
import { Kpi, type Tone } from '../components/metrics/Kpi'
import { ProcurementPanel } from '../components/ProcurementPanel'
import { Async, Callout, Card, KindBadge } from '../components/ui'
import { useDecision } from '../hooks/decision'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import type { Metrics } from '../types/api'
import { biasLabel, fmtMw, fmtPct, fmtSigned } from '../utils/format'
import { ukStamp } from '../utils/time'

/** UI heuristic only: MAE as share of mean actual. <10% green, 10-20% amber, >20% red. */
function maeTone(m: Metrics): Tone {
  const r = m.nmae_pct_of_mean_actual
  return r == null ? 'neutral' : r < 10 ? 'good' : r < 20 ? 'caution' : 'bad'
}

export function Overview() {
  const { params, decision } = useDecision()
  const [band, setBand] = useState(true)
  const key = `${params.date}|${params.cutoff}|${params.periodFrom}|${params.periodTo}`
  const state = useApi((s) => api.profile(params, s), key)

  return (
    <>
      <Async state={state} height={420}>{(p) => {
        const m = p.metrics_selected_period
        const f = p.forecast
        const retro = p.mode !== 'prospective'
        const hist = p.history?.metrics
        const tone = m.n ? maeTone(m) : 'neutral'
        return (
          <>
            <div className="flex gap-3 rounded-lg border border-line bg-white p-4">
              <Lightbulb className="mt-0.5 shrink-0 text-forecast" size={18} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Decision-support insight <span className="ml-1 font-normal normal-case">(generated from the calculated values below)</span></p>
                <p className="mt-1 text-sm leading-relaxed">{p.insight}</p>
              </div>
            </div>

            {p.mode === 'prospective' && <Callout tone="info" title="Prospective view">No observed generation exists for this selection yet, so only the forecast available at the cutoff is shown. Historical accuracy below indicates likely forecast reliability.</Callout>}
            {f.intervals_missing > 0 && <Callout tone="caution" title="Partial forecast coverage">{f.intervals_missing} of {f.intervals_expected} delivery hours have no forecast published by the cutoff. They are left blank, not estimated.</Callout>}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi kind="forecast" label="Forecast wind (mean)" value={fmtMw(f.mean_mw)} unit="MW"
                tip="Mean of the forecast MW for each delivery hour, using the latest publication at or before the cutoff." sub={`range ${fmtMw(f.min_mw)}–${fmtMw(f.max_mw)} MW · ${f.intervals} h`} />
              <Kpi kind="measured" label="Actual wind (mean)" value={retro ? fmtMw(p.actual.mean_mw) : 'n/a'} unit={retro ? 'MW' : undefined}
                tip="Mean outturn over all 30-minute settlement periods in the period (FUELHH). Observed after the decision; shown for retrospective analysis only."
                sub={retro ? `${p.actual.intervals} half-hours observed` : 'not yet observed'} />
              <Kpi kind="derived" label="Bias (forecast − actual)" value={m.n ? fmtSigned(m.bias_mw) : 'n/a'} unit={m.n ? 'MW' : undefined}
                tip="Mean error. Positive = over-forecast (forecast above outturn), negative = under-forecast." tone={m.n ? tone : 'neutral'}
                sub={m.n ? `${biasLabel(m.bias_mw)} · ${m.overforecast_count} over / ${m.underforecast_count} under` : 'needs actuals'} />
              <Kpi kind="derived" label="Valid forecast/actual pairs" value={String(m.n)}
                tip="Hours where both an eligible forecast and a measured actual exist at the same timestamp. Half-hours without a forecast are not paired."
                sub={`of ${f.intervals_expected} hours in period`} />
              <Kpi kind="derived" label="MAE" value={m.n ? fmtMw(m.mae_mw) : 'n/a'} unit={m.n ? 'MW' : undefined} tone={tone}
                tip="Mean absolute error = mean(|forecast − actual|). Colour: MAE relative to mean actual, <10% green, 10–20% amber, >20% red (a display heuristic)."
                sub={m.n ? `${fmtPct(m.nmae_pct_of_mean_actual)} of mean actual` : undefined} />
              <Kpi kind="derived" label="RMSE" value={m.n ? fmtMw(m.rmse_mw) : 'n/a'} unit={m.n ? 'MW' : undefined}
                tip="Root mean squared error. Larger than MAE when misses are uneven." sub={m.n ? `P90 abs error ${fmtMw(m.abs_error_p90_mw)} MW` : undefined} />
              <Kpi kind="derived" label="MAPE" value={m.mape_pct == null ? 'n/a' : fmtPct(m.mape_pct)}
                tip="Mean of |error/actual|. Zero-actual intervals are excluded (undefined); n shown is after exclusion. Use MAE/RMSE as primary metrics."
                sub={m.n ? `n=${m.mape_n}${m.mape_excluded_zero_actuals ? `, ${m.mape_excluded_zero_actuals} zero-actual excluded` : ''}` : undefined} />
              <Kpi kind="forecast" label="Forecast published" value={f.latest_publish_time_utc ? ukStamp(f.latest_publish_time_utc) : 'none'}
                tip="Publication time of the most recent forecast used for this period (UK local). Different hours may come from different publications."
                sub={f.latest_publish_time_utc ? `${f.publications_used.length} publication(s) used · cutoff ${p.cutoff_local}` : 'nothing published by cutoff'} />
            </div>

            <Card title="Generation profile" kind={retro ? undefined : 'forecast'}
              subtitle={`${p.delivery_date} (UK) · forecast fixed at the cutoff; actuals, where shown, were observed afterwards`}
              actions={p.uncertainty_band && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={band} onChange={(e) => setBand(e.target.checked)} /> Show historical P10–P90 band
                </label>
              )}>
              <ProfileChart profile={p} showBand={band} cutoffMs={Date.parse(p.cutoff)} />
              {p.uncertainty_band && band && (
                <p className="mt-2 text-xs text-muted">
                  <KindBadge kind="derived" /> Band = forecast + empirical P10 ({fmtSigned(p.uncertainty_band.p10_mw)} MW) to P90 ({fmtSigned(p.uncertainty_band.p90_mw)} MW) of (actual − forecast) over {p.uncertainty_band.history_start} to {p.uncertainty_band.history_end}
                  (n={p.uncertainty_band.n}), same cutoff rule, <strong>prior days only</strong>. It describes past errors; it is not a probabilistic forecast.
                </p>
              )}
              {!p.uncertainty_band && <p className="mt-2 text-xs text-muted">No historical uncertainty band: there are no preceding delivery days in the cached window.</p>}
            </Card>

            {hist && hist.n > 0 && (
              <Card title="Reference: accuracy of earlier days under the same cutoff rule" kind="derived"
                subtitle={`${p.history!.start_date} to ${p.history!.end_date} · all information would have been available before ${decision.date}`}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  {([['MAE', `${fmtMw(hist.mae_mw)} MW`], ['RMSE', `${fmtMw(hist.rmse_mw)} MW`], ['Bias', `${fmtSigned(hist.bias_mw)} MW (${biasLabel(hist.bias_mw)})`], ['Pairs', String(hist.n)]] as const).map(([k, v]) => (
                    <div key={k}><p className="text-xs text-muted">{k}</p><p className="tnum font-semibold">{v}</p></div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )
      }}</Async>

      <ProcurementPanel />
    </>
  )
}
