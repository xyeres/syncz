import { collect, fail, failAll, ok, type Reason, type Result } from './result'

describe('Result', () => {
  it('ok wraps a value', () => {
    const r = ok(42)
    expect(r).toEqual({ ok: true, value: 42 })
  })

  it('fail carries exactly one reason with its code and message', () => {
    const r = fail('SPL-1', 'Shares must total 100%')
    expect(r).toEqual({ ok: false, reasons: [{ code: 'SPL-1', message: 'Shares must total 100%' }] })
  })

  it('failAll carries every given reason', () => {
    const reasons: Reason[] = [
      { code: 'SPL-6', message: 'Name this split' },
      { code: 'SPL-3', message: 'Too small' },
    ]
    const r = failAll(reasons)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons).toEqual(reasons)
  })

  it('narrows on ok so value and reasons are type-safe', () => {
    const r: Result<number> = ok(1)
    if (r.ok) {
      expect(r.value).toBe(1)
      // @ts-expect-error a success has no reasons
      expect(r.reasons).toBeUndefined()
    }
  })

  describe('collect', () => {
    it('collects all reasons: merges reasons from several failures, in order', () => {
      const reasons = collect(
        fail('SPL-6', 'a'),
        ok('fine'),
        failAll([
          { code: 'SPL-3', message: 'b' },
          { code: 'SPL-1', message: 'c' },
        ]),
        fail('COL-1', 'd'),
      )
      expect(reasons).toEqual([
        { code: 'SPL-6', message: 'a' },
        { code: 'SPL-3', message: 'b' },
        { code: 'SPL-1', message: 'c' },
        { code: 'COL-1', message: 'd' },
      ])
    })

    it('returns no reasons when every check is ok', () => {
      expect(collect(ok(1), ok(undefined), ok('x'))).toEqual([])
    })

    it('returns no reasons for no checks', () => {
      expect(collect()).toEqual([])
    })
  })
})
