import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import { useDecision } from '../hooks/decision'
import { api } from '../services/api'
import { fmtMw, fmtSigned } from '../utils/format'
import { ResidualChart } from './charts/ResidualChart'
import { Kpi } from './metrics/Kpi'
import { Async, Callout, Card, InfoTip } from './ui'

const EXAMPLE_DEMAND = 20000

/** Illustrative procurement sensitivity. Demand is entered by the user; nothing here is a recommendation. */
export function ProcurementPanel() {
  const { params } = useDecision()
  const [raw, setRaw] = useState('')
  const demand = raw.trim() === '' ? NaN : Number(raw)
  const valid = Number.isFinite(demand) && demand >= 0 && demand <= 100000
  const key = `${params.date}|${params.cutoff}|${params.periodFrom}|${params.periodTo}|${demand}`
  const state = useApi((s) => api.procurement(params, demand, s), key, valid)

  return (
    <Card title="Procurement implications: sensitivity to wind forecast error" kind="illustrative"
      subtitle="Simplified what-if: demand is supplied only by wind and an unspecified residual source.">
      <Callout tone="caution" title="Illustrative only - not a procurement requirement or trading recommendation">
        Demand below is a figure <strong>you</strong> enter; the app has no demand, price, thermal-plant or contract data. Residual requirement = max(0, D − wind).
      </Callout>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="demand" className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Assumed demand D (MW)<InfoTip text="Your assumption for the load to be met over the selected period, held constant. Enter any value; there is no default." />
          </label>
          <input id="demand" inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="e.g. 20000"
            aria-invalid={raw !== '' && !valid} className="h-9 w-40 rounded-md border border-line px-2 text-sm tnum" />
        </div>
        <button onClick={() => setRaw(String(EXAMPLE_DEMAND))} className="h-9 rounded-md border border-line px-3 text-sm text-muted hover:bg-canvas hover:text-ink">
          Fill example ({EXAMPLE_DEMAND.toLocaleString('en-GB')} MW, arbitrary)
        </button>
        {raw !== '' && !valid && <p role="alert" className="flex items-center gap-1 text-sm text-bad"><AlertTriangle size={14} /> Enter a number between 0 and 100,000 MW.</p>}
      </div>

      {!valid ? (
        <p className="mt-4 text-sm text-muted">Enter an assumed demand to see the forecast-implied residual requirement and how wind forecast error changes it.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <Async state={state} height={120}>{(d) => {
            const s = d.summary
            const retro = d.mode !== 'prospective' && (s.paired_intervals ?? 0) > 0
            return (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi kind="illustrative" label="Forecast residual (mean)" value={fmtMw(s.forecast_residual_mean_mw)} unit="MW" tip="R̂ = max(0, D − forecast wind), averaged over the forecast hours in the period." sub={`peak ${fmtMw(s.forecast_residual_peak_mw)} MW`} />
                  {retro ? <>
                    <Kpi kind="illustrative" label="Actual residual (mean, hindsight)" value={fmtMw(s.paired_actual_residual_mean_mw)} unit="MW" tip="R = max(0, D − actual wind) over the same paired hours. Only known retrospectively." sub={`${s.paired_intervals} paired hours`} />
                    <Kpi kind="illustrative" label="Residual error E_R (mean)" value={fmtSigned(s.residual_error_mean_mw)} unit="MW" tip="E_R = R − R̂. Positive: more power was needed than the forecast implied." sub={(s.residual_error_mean_mw ?? 0) > 0 ? 'forecast implied too little' : (s.residual_error_mean_mw ?? 0) < 0 ? 'forecast implied too much' : 'no net error'} />
                    <Kpi kind="illustrative" label="Mean |E_R| / peak |E_R|" value={`${fmtMw(s.residual_error_mean_abs_mw)} / ${fmtMw(s.residual_error_max_abs_mw)}`} unit="MW" tip="Typical and worst hourly miss of the residual requirement." sub={`wind MAE was ${fmtMw(s.wind_mae_mw)} MW`} />
                  </> : (
                    <div className="col-span-2 lg:col-span-3"><Callout tone="info">Actual wind output is not available for this selection, so no hindsight comparison is shown. Only the forecast-implied residual is displayed.</Callout></div>
                  )}
                </div>
                {retro && (
                  <p className="text-sm text-ink/80">
                    With D = {fmtMw(d.demand_mw)} MW, the wind forecast error moved the residual requirement by {fmtSigned(s.residual_error_mean_mw)} MW on average
                    (mean absolute {fmtMw(s.residual_error_mean_abs_mw)} MW). Where demand exceeds both forecast and actual wind, E_R equals the wind forecast error with its sign flipped;
                    where wind covers demand in both, the error has no effect. This is a sensitivity illustration, not a quantity to buy.
                  </p>
                )}
                <ResidualChart data={d} />
              </>
            )
          }}</Async>
        </div>
      )}
    </Card>
  )
}
