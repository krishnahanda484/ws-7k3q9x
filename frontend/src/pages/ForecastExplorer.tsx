import { useState } from 'react'
import { VintageChart } from '../components/charts/VintageChart'
import { Async, Callout, Card, InfoTip } from '../components/ui'
import { useDecision } from '../hooks/decision'
import { useApi } from '../hooks/useApi'
import { api } from '../services/api'
import { fmtMw } from '../utils/format'
import { ukDateTime } from '../utils/time'

export function ForecastExplorer() {
  const { params } = useDecision()
  const [showLate, setShowLate] = useState(false)
  const [hi, setHi] = useState<string | null>(null)
  const key = `${params.date}|${params.cutoff}`
  const v = useApi((s) => api.vintages(params, s), key)
  const prof = useApi((s) => api.profile({ date: params.date, cutoff: params.cutoff }, s), key)

  return (
    <>
      <Callout tone="info" title="How the forecast is chosen">
        WINDFOR is re-published several times a day. For each delivery hour the app takes the publication with the greatest publish time that is <strong>at or before</strong> the decision cutoff.
        Later publications are shown only on request and are never used for the decision.
      </Callout>
      <Async state={v} height={420}>{(d) => (
        <>
          <Card title={`Forecast vintages · delivery ${d.delivery_date}`} kind="forecast"
            subtitle={`${d.total_publications} publications cover this day; ${d.eligible_publications} were published by the cutoff (${ukDateTime(d.cutoff)}).`}
            actions={<label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showLate} onChange={(e) => setShowLate(e.target.checked)} /> Show vintages published after cutoff</label>}>
            <VintageChart v={d} profile={prof.data} showLate={showLate} highlight={hi} />
            <p className="mt-3 text-xs text-muted">{d.explanation}</p>
          </Card>

          <Card title="Publications" subtitle="Hover a row to highlight its line. 'Used for' = delivery hours where this publication is the selected one." kind="forecast">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">Published (UK)</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 text-right font-medium">Lead<InfoTip text="Hours between publication and 00:00 UK of the delivery day. Negative = published after the day had started." /></th>
                    <th className="py-2 pr-3 text-right font-medium">Hours covered</th>
                    <th className="py-2 pr-3 text-right font-medium">Mean (MW)</th>
                    <th className="py-2 pr-3 text-right font-medium">Used for</th>
                    <th className="py-2 text-right font-medium">MAE vs actual (MW)<InfoTip text="Hindsight accuracy of this single publication on this day. Not available to a decision-maker at the time." /></th>
                  </tr>
                </thead>
                <tbody>
                  {d.vintages.map((x) => (
                    <tr key={x.publish_time_utc} onMouseEnter={() => setHi(x.publish_time_utc)} onMouseLeave={() => setHi(null)}
                      className={`border-b border-line/60 ${x.eligible ? '' : 'text-muted'} ${hi === x.publish_time_utc ? 'bg-amber-50' : ''}`}>
                      <td className="tnum py-1.5 pr-3">{ukDateTime(x.publish_time_utc)}</td>
                      <td className="py-1.5 pr-3">{x.eligible
                        ? <span className="rounded bg-good-bg px-1.5 py-0.5 text-xs font-medium text-good">eligible</span>
                        : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">after cutoff</span>}</td>
                      <td className="tnum py-1.5 pr-3 text-right">{x.lead_hours_before_day_start?.toFixed(1)} h</td>
                      <td className="tnum py-1.5 pr-3 text-right">{x.intervals}</td>
                      <td className="tnum py-1.5 pr-3 text-right">{fmtMw(x.mean_mw)}</td>
                      <td className="tnum py-1.5 pr-3 text-right font-medium">{x.selected_intervals || '-'}</td>
                      <td className="tnum py-1.5 text-right">{x.mae_mw == null ? '-' : fmtMw(x.mae_mw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}</Async>
    </>
  )
}
