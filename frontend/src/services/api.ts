import type {
  AccuracyResponse, ApiErrorBody, Health, Metadata, ProcurementResponse, ProfileResponse, VintagesResponse,
} from '../types/api'

// Empty in dev/Docker (same-origin /api proxy); set to the hosted backend URL on Vercel.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`
  let res: Response
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'Cannot reach the WindSight API. Check that the backend is running and reachable.')
  }
  if (!res.ok) {
    let body: ApiErrorBody | null = null
    try { body = await res.json() } catch { /* non-JSON error */ }
    throw new ApiError(res.status, body?.error.code ?? 'http_error', body?.error.message ?? `Request failed (HTTP ${res.status}).`)
  }
  return res.json() as Promise<T>
}

export interface DecisionParams {
  date: string
  cutoff: string // ISO instant (UTC)
  periodFrom?: string
  periodTo?: string
}

export const api = {
  health: (s?: AbortSignal) => get<Health>('/api/health', {}, s),
  metadata: (s?: AbortSignal) => get<Metadata>('/api/metadata', {}, s),
  profile: (p: DecisionParams, s?: AbortSignal) =>
    get<ProfileResponse>('/api/analysis/profile', { date: p.date, cutoff: p.cutoff, period_from: p.periodFrom, period_to: p.periodTo }, s),
  vintages: (p: DecisionParams, s?: AbortSignal) =>
    get<VintagesResponse>('/api/analysis/vintages', { date: p.date, cutoff: p.cutoff }, s),
  accuracy: (start: string, end: string, daysBefore: number, cutoffTime: string, s?: AbortSignal) =>
    get<AccuracyResponse>('/api/analysis/accuracy', { start, end, cutoff_days_before: daysBefore, cutoff_time: cutoffTime }, s),
  procurement: (p: DecisionParams, demandMw: number, s?: AbortSignal) =>
    get<ProcurementResponse>('/api/analysis/procurement-sensitivity',
      { date: p.date, cutoff: p.cutoff, demand_mw: demandMw, period_from: p.periodFrom, period_to: p.periodTo }, s),
}
