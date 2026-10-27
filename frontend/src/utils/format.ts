export const fmtMw = (v: number | null | undefined, digits = 0): string =>
  v == null ? '-' : v.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtSigned = (v: number | null | undefined, digits = 0): string =>
  v == null ? '-' : `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`

export const fmtPct = (v: number | null | undefined, digits = 1): string => (v == null ? '-' : `${v.toFixed(digits)}%`)

export const biasLabel = (bias: number | null | undefined): string =>
  bias == null ? '' : bias > 0 ? 'over-forecast' : bias < 0 ? 'under-forecast' : 'unbiased'
