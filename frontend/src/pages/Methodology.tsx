import type { ReactNode } from 'react'
import { Callout, Card, ErrorBlock, Loading } from '../components/ui'
import type { ApiState } from '../hooks/useApi'
import type { Metadata } from '../types/api'
import { ukDateTime } from '../utils/time'

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid gap-1 border-b border-line/60 py-2 text-sm sm:grid-cols-[220px_1fr]"><dt className="font-medium text-muted">{k}</dt><dd className="min-w-0 break-words">{children}</dd></div>
)
const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-canvas px-1.5 py-0.5 text-[13px]">{children}</code>

export function Methodology({ meta }: { meta: ApiState<Metadata> }) {
  if (meta.error) return <ErrorBlock error={meta.error} onRetry={meta.reload} />
  const m = meta.data
  if (!m) return <Loading />
  const q = m.quality as Record<string, number | Record<string, number>>
  const real = m.data_mode === 'elexon_cached'
  return (
    <>
      <Callout tone={real ? 'good' : 'caution'} title={real ? 'Real Elexon data (cached extract)' : 'Development fixture - not real observations'}>
        {m.data_description} The app reads this extract at start-up; no request is made to Elexon while you browse.
      </Callout>

      <Card title="Data provenance" kind="measured">
        <dl>
          <Row k="Actuals (measured)"><Code>FUELHH</Code> half-hourly generation outturn, <Code>fuelType = WIND</Code>. MW averaged over 30 minutes. <span className="text-muted">{m.sources.actuals}</span></Row>
          <Row k="Forecasts"><Code>WINDFOR</Code> national wind forecast, hourly delivery periods, every publication retained (vintages). MW. <span className="text-muted">{m.sources.forecasts}</span></Row>
          <Row k="Delivery window">{m.window_start_date} to {m.window_end_date} (UK delivery dates)</Row>
          <Row k="Extracted at">{ukDateTime(m.extracted_at_utc)} - refresh with <Code>python -m app.data.refresh</Code></Row>
          <Row k="Volume">{m.actual_intervals.toLocaleString('en-GB')} half-hourly actuals · {m.forecast_rows.toLocaleString('en-GB')} forecast rows · {m.forecast_publications} publications</Row>
          <Row k="Licence">{m.licence}</Row>
        </dl>
      </Card>

      <Card title="Data-quality checks on the cached extract" kind="derived">
        <dl>
          {Object.entries(q).filter(([, v]) => typeof v === 'number').map(([k, v]) => <Row key={k} k={k.replaceAll('_', ' ')}><span className="tnum">{String(v)}</span></Row>)}
          {(['actuals_ingest', 'forecasts_ingest'] as const).map((k) => q[k] && (
            <Row key={k} k={k.replace('_', ' ')}><span className="tnum">{Object.entries(q[k] as Record<string, number>).map(([a, b]) => `${a.replaceAll('_', ' ')}: ${b}`).join(' · ')}</span></Row>
          ))}
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Forecast cutoff & vintage selection">
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>For delivery hour <em>t</em> and cutoff <em>C</em>, eligible forecasts satisfy <Code>publishTime ≤ C</Code> (a forecast published exactly at C is eligible).</li>
            <li>The one with the greatest <Code>publishTime</Code> is selected: f*(t, C) = f(t, p*), p* = max&#123;p ≤ C&#125;. Nothing published after C is ever used.</li>
            <li>Different hours can come from different publications because each WINDFOR publication covers a rolling horizon. Hours with no eligible publication are left blank.</li>
            <li>Timestamps are stored and compared in UTC and displayed in Europe/London.</li>
            <li>Back-tests apply a <em>rolling</em> rule (“N days before at HH:mm UK”) so each delivery day is judged on information it would really have had.</li>
          </ul>
        </Card>
        <Card title="Metric definitions" kind="derived">
          <ul className="space-y-1.5 text-sm leading-relaxed">
            <li>Error eᵢ = ŷᵢ − yᵢ (forecast − actual). <strong>Positive = over-forecast, negative = under-forecast.</strong></li>
            <li><strong>MAE</strong> = mean |eᵢ| · <strong>RMSE</strong> = √mean eᵢ² · <strong>Bias</strong> = mean eᵢ</li>
            <li><strong>MAPE</strong> = 100 · mean |eᵢ / yᵢ| over intervals with yᵢ ≠ 0; zero actuals are excluded and counted. MAE/RMSE remain the primary metrics.</li>
            <li>Pairing: exact timestamp match between a FUELHH half-hour and a WINDFOR hour. Missing values are never zero-filled or interpolated; duplicate pairs are removed.</li>
            <li><strong>MW vs MWh:</strong> all series are average power (MW). Energy = MW × hours (30-min value × 0.5 h).</li>
          </ul>
        </Card>
      </div>

      <Card title="Illustrative procurement model" kind="illustrative">
        <p className="text-sm leading-relaxed">
          R̂ = max(0, D − Ŵ), R = max(0, D − W), E_R = R − R̂, where D is a demand value entered by the user. The model assumes demand is met only by wind and an unspecified residual source.
          It excludes prices, interconnectors, thermal plant, storage, contract positions and demand forecast error, so it cannot produce a buy quantity or savings estimate.
          A real trading recommendation would additionally need half-hourly demand forecasts, market prices/liquidity, plant availability and the utility's hedge position.
        </p>
      </Card>

      <Card title="Known limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>National GB wind only: no regional detail, weather, demand or price data (by design of the brief).</li>
          <li>WINDFOR is hourly, FUELHH half-hourly: only on-the-hour timestamps can be paired; :30 actuals are shown but unpaired.</li>
          <li>The two datasets may differ in scope (e.g. forecast of total wind vs metered/BM-visible outturn). A persistent over-forecast bias in January 2026 is reported as observed, not explained.</li>
          <li>One month (January 2026) is a short sample; results are not evidence of performance in other seasons.</li>
          <li>The historical P10–P90 band is empirical and based on few days early in the month; it is not a calibrated prediction interval.</li>
          <li>Publication times are taken exactly as provided by Elexon. A published timestamp is treated as the moment the forecast became available to the desk.</li>
        </ul>
      </Card>
    </>
  )
}
