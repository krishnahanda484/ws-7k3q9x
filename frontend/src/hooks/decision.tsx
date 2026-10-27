import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { DecisionParams } from '../services/api'
import { addDays, diffDays, ukWallToUtcIso } from '../utils/time'

/** The user's decision context, in UK local time. Shared by every page. */
export interface Decision {
  date: string        // delivery date YYYY-MM-DD (UK)
  cutoffDate: string  // decision cutoff date (UK)
  cutoffTime: string  // decision cutoff time HH:mm (UK)
  periodFrom: string  // optional HH:mm within the delivery date ('' = from 00:00)
  periodTo: string    // optional HH:mm ('' = to end of day)
}

export const DEFAULT_DATE = '2026-01-15'
export const DEFAULT_CUTOFF_TIME = '09:00'

export const defaultDecision = (date = DEFAULT_DATE): Decision => ({
  date, cutoffDate: addDays(date, -1), cutoffTime: DEFAULT_CUTOFF_TIME, periodFrom: '', periodTo: '',
})

interface Ctx {
  decision: Decision
  set: (patch: Partial<Decision>) => void
  /** Move the delivery date and keep the cutoff the same number of days before it. */
  setDate: (date: string) => void
  reset: () => void
  params: DecisionParams
  cutoffDaysBefore: number
}

const DecisionContext = createContext<Ctx | null>(null)

export function DecisionProvider({ children }: { children: ReactNode }) {
  const [decision, setDecision] = useState<Decision>(defaultDecision())
  const value = useMemo<Ctx>(() => {
    const periodFrom = decision.periodFrom ? ukWallToUtcIso(decision.date, decision.periodFrom) : undefined
    const periodTo = decision.periodTo ? ukWallToUtcIso(decision.date, decision.periodTo) : undefined
    return {
      decision,
      set: (patch) => setDecision((d) => ({ ...d, ...patch })),
      setDate: (date) => setDecision((d) => ({ ...d, date, cutoffDate: addDays(date, -diffDays(d.date, d.cutoffDate)) })),
      reset: () => setDecision(defaultDecision()),
      params: { date: decision.date, cutoff: ukWallToUtcIso(decision.cutoffDate, decision.cutoffTime), periodFrom, periodTo },
      cutoffDaysBefore: Math.max(0, diffDays(decision.date, decision.cutoffDate)),
    }
  }, [decision])
  return <DecisionContext.Provider value={value}>{children}</DecisionContext.Provider>
}

export function useDecision(): Ctx {
  const c = useContext(DecisionContext)
  if (!c) throw new Error('useDecision outside DecisionProvider')
  return c
}
