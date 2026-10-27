import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'

export interface ApiState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/** Runs `fn` whenever `key` changes (key must encode every input), cancels stale requests,
 *  and keeps the previous data visible while a refetch is in flight. */
export function useApi<T>(fn: (signal: AbortSignal) => Promise<T>, key: string, enabled = true): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    fnRef.current(ctrl.signal)
      .then((d) => { setData(d); setError(null) })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return
        setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', 'Unexpected error.'))
        setData(null)
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false) })
    return () => ctrl.abort()
  }, [key, enabled, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, reload }
}
