import { OK, collect, fail, failAll, failIf, ok, type Reason, type Result } from './result'
import { OWNER_ID } from './ids'
import { ALEX, SAM } from './test-fixtures'

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

  describe('Reason.partyId', () => {
    it('SPL-3 fail(code, message, partyId) carries the party the reason is about', () => {
      const r = fail('SPL-3', 'Give c-alex at least 0.10% or remove them', ALEX)
      expect(r).toEqual({
        ok: false,
        reasons: [{ code: 'SPL-3', message: 'Give c-alex at least 0.10% or remove them', partyId: ALEX }],
      })
    })

    it('SPL-4 fail accepts the owner as the party', () => {
      const r = fail('SPL-4', 'Your share must be 0% or at least 0.10%', OWNER_ID)
      expect(r.ok ? undefined : r.reasons[0]?.partyId).toBe(OWNER_ID)
    })

    it('SPL-1 a reason without a party has no partyId key (exactOptionalPropertyTypes)', () => {
      const r = fail('SPL-1', 'Shares must total 100%')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(Object.keys(r.reasons[0] ?? {}).sort()).toEqual(['code', 'message'])
    })

    it('SPL-3 failIf(failed, code, message, partyId) carries the party when it fails', () => {
      const r = failIf(true, 'SPL-3', 'Too small', SAM)
      expect(r).toEqual({ ok: false, reasons: [{ code: 'SPL-3', message: 'Too small', partyId: SAM }] })
      expect(failIf(false, 'SPL-3', 'Too small', SAM)).toEqual(OK)
    })

    it('SPL-6 failIf without a party has no partyId key', () => {
      const r = failIf(true, 'SPL-6', 'Name this split')
      if (!r.ok) expect('partyId' in (r.reasons[0] ?? {})).toBe(false)
      expect(r.ok).toBe(false)
    })

    it('SPL-3 collect keeps partyId on the reasons it gathers', () => {
      const reasons = collect(fail('SPL-3', 'a', ALEX), fail('SPL-1', 'b'))
      expect(reasons.map((r) => ('partyId' in r ? r.partyId : null))).toEqual([ALEX, null])
    })

    it('SPL-3 partyId is a PartyId, not a plain string (compile time)', () => {
      const compileOnly = () =>
        // @ts-expect-error partyId must be a branded PartyId
        fail('SPL-3', 'Too small', 'c-alex')
      const typed: Reason = { code: 'SPL-3', message: 'Too small', partyId: ALEX }
      expect(typed.partyId).toBe(ALEX)
      expect(typeof compileOnly).toBe('function')
    })
  })
})
