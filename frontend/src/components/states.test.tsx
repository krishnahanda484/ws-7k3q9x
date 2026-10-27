import { render, screen } from '@testing-library/react'
import { Async } from './ui'
import { ApiError } from '../services/api'

const base = { reload: () => {} }

describe('Async state wrapper', () => {
  it('shows loading state', () => {
    render(<Async state={{ ...base, data: null, error: null, loading: true }}>{() => <p>content</p>}</Async>)
    expect(screen.getByRole('status')).toBeTruthy()
  })
  it('shows an error with a retry button and never the content', () => {
    render(<Async state={{ ...base, data: 'x', error: new ApiError(0, 'network', 'Cannot reach'), loading: false }}>{() => <p>content</p>}</Async>)
    expect(screen.getByRole('alert').textContent).toContain('Cannot reach')
    expect(screen.queryByText('content')).toBeNull()
    expect(screen.getByText('Retry')).toBeTruthy()
  })
  it('renders content when data is present', () => {
    render(<Async state={{ ...base, data: 'hello', error: null, loading: false }}>{(d) => <p>{d}</p>}</Async>)
    expect(screen.getByText('hello')).toBeTruthy()
  })
  it('renders the empty state when provided', () => {
    render(<Async state={{ ...base, data: 'hello', error: null, loading: false }} empty={() => <p>nothing here</p>}>{() => <p>content</p>}</Async>)
    expect(screen.getByText('nothing here')).toBeTruthy()
  })
})
