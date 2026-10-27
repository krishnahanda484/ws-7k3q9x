import type { Metrics } from '../../types/api'
import { biasLabel, fmtMw, fmtPct, fmtSigned } from '../../utils/format'
import { InfoTip } from '../ui'

export function MetricsTable({ m }: { m: Metrics }) {
  const rows: { label: string; value: string; n: number | string; tip: string }[] = [
    { label: 'MAE', value: `${fmtMw(m.mae_mw)} MW`, n: m.n, tip: 'Mean absolute error: average of |forecast - actual|.' },
    { label: 'RMSE', value: `${fmtMw(m.rmse_mw)} MW`, n: m.n, tip: 'Root mean squared error. Penalises large misses more than MAE.' },
    { label: 'Bias (mean error)', value: `${fmtSigned(m.bias_mw)} MW (${biasLabel(m.bias_mw)})`, n: m.n, tip: 'Mean of (forecast - actual). Positive = over-forecast, negative = under-forecast.' },
    { label: 'MAPE', value: m.mape_pct == null ? 'not defined' : fmtPct(m.mape_pct), n: m.mape_n, tip: 'Mean of |error / actual| x 100. Intervals with zero actual are excluded from this denominator; the sample size shown is after that exclusion.' },
    { label: 'MAE as % of mean actual', value: fmtPct(m.nmae_pct_of_mean_actual), n: m.n, tip: 'MAE divided by the mean actual generation of the same pairs (a ratio of means, not a mean of ratios).' },
    { label: 'Abs. error P50 / P90 / P95', value: `${fmtMw(m.abs_error_p50_mw)} / ${fmtMw(m.abs_error_p90_mw)} / ${fmtMw(m.abs_error_p95_mw)} MW`, n: m.n, tip: 'Percentiles of the absolute error distribution (linear interpolation).' },
    { label: 'Max absolute error', value: `${fmtMw(m.max_abs_error_mw)} MW`, n: m.n, tip: 'Largest single-interval miss.' },
    { label: 'Over- / under-forecast intervals', value: `${m.overforecast_count} / ${m.underforecast_count}`, n: m.n, tip: 'Count of intervals where forecast > actual / forecast < actual.' },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3 font-medium">Metric</th><th className="py-2 pr-3 font-medium">Value</th><th className="py-2 text-right font-medium">Sample (n)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-3">{r.label}<InfoTip text={r.tip} /></td>
              <td className="tnum py-2 pr-3 font-medium">{r.value}</td>
              <td className="tnum py-2 text-right text-muted">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
