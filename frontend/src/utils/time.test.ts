import { addDays, diffDays, ukTime, ukWallToUtcIso } from './time'
import { fmtSigned, biasLabel } from './format'

describe('UK local <-> UTC', () => {
  it('winter (GMT) is identity', () => {
    expect(ukWallToUtcIso('2026-01-14', '09:00')).toBe('2026-01-14T09:00:00Z')
  })
  it('summer (BST) is one hour behind UTC', () => {
    expect(ukWallToUtcIso('2026-06-15', '09:00')).toBe('2026-06-15T08:00:00Z')
  })
  it('renders UTC instants as UK local clock time', () => {
    expect(ukTime('2026-06-15T08:00:00Z')).toBe('09:00')
    expect(ukTime('2026-01-15T08:00:00Z')).toBe('08:00')
  })
})

describe('date arithmetic', () => {
  it('shifts across month boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })
  it('keeps cutoff offset when the delivery date moves', () => {
    expect(diffDays('2026-01-15', '2026-01-14')).toBe(1)
  })
})

describe('formatting', () => {
  it('signs errors and labels bias direction', () => {
    expect(fmtSigned(1234.4)).toBe('+1,234')
    expect(fmtSigned(-50)).toBe('-50')
    expect(fmtSigned(null)).toBe('-')
    expect(biasLabel(10)).toBe('over-forecast')
    expect(biasLabel(-10)).toBe('under-forecast')
  })
})
