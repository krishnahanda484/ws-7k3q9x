import { useEffect, useState } from 'react'
import { DecisionBar } from './components/layout/DecisionBar'
import { DataStatus, Shell, NAV, type PageId } from './components/layout/Shell'
import { Callout } from './components/ui'
import { DecisionProvider } from './hooks/decision'
import { useApi } from './hooks/useApi'
import { AccuracyAnalysis } from './pages/AccuracyAnalysis'
import { ForecastExplorer } from './pages/ForecastExplorer'
import { Methodology } from './pages/Methodology'
import { Overview } from './pages/Overview'
import { api } from './services/api'

const pageFromHash = (): PageId => {
  const h = window.location.hash.replace('#', '') as PageId
  return NAV.some((n) => n.id === h) ? h : 'overview'
}

function Inner() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const health = useApi((s) => api.health(s), 'health')
  const meta = useApi((s) => api.metadata(s), 'meta', health.data?.data_loaded === true)

  useEffect(() => {
    const on = () => setPage(pageFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const nav = (p: PageId) => { window.location.hash = p; setPage(p) }

  const down = health.error
  const noData = health.data && !health.data.data_loaded

  return (
    <Shell page={page} onNav={nav} status={<DataStatus health={health} meta={meta} />} controls={<DecisionBar meta={meta.data} />}>
      {down && <Callout tone="caution" title="Cannot reach the API">{down.message} Nothing below is shown from stand-in data.</Callout>}
      {noData && <Callout tone="caution" title="Backend is running but has no data loaded">{health.data?.detail}</Callout>}
      {!down && !noData && health.data && (
        <>
          {page === 'overview' && <Overview />}
          {page === 'explorer' && <ForecastExplorer />}
          {page === 'accuracy' && meta.data && <AccuracyAnalysis windowStart={meta.data.window_start_date} windowEnd={meta.data.window_end_date} />}
          {page === 'methodology' && <Methodology meta={meta} />}
        </>
      )}
    </Shell>
  )
}

export default function App() {
  return <DecisionProvider><Inner /></DecisionProvider>
}
