import { Email } from './email'
import { expectOk, expectRejected } from '../test-fixtures'

describe('Email', () => {
  it('COL-1 accepts a valid email', () => {
    expect(expectOk(Email.create('alex@studio.com'))).toEqual({
      value: 'alex@studio.com',
      normalized: 'alex@studio.com',
    })
  })

  it('COL-1 trims " Alex@Studio.com " and lower-cases the normalized form', () => {
    const email = expectOk(Email.create(' Alex@Studio.com '))
    expect(email.value).toBe('Alex@Studio.com')
    expect(email.normalized).toBe('alex@studio.com')
  })

  it.each(['alex@mail.studio.co.uk', 'a.b+tag@x.io'])('COL-1 accepts %s', (raw) => {
    expect(expectOk(Email.create(raw)).value).toBe(raw)
  })

  it('COL-1 rejects a blank email', () => {
    expectRejected(Email.create(''), 'COL-1')
  })

  it('COL-1 rejects a whitespace-only email', () => {
    expectRejected(Email.create('   '), 'COL-1')
  })

  it('COL-1 rejects an email without a TLD (alex@studio)', () => {
    expectRejected(Email.create('alex@studio'), 'COL-1')
  })

  it('COL-1 rejects an email with a space in the local part (a b@x.com)', () => {
    expectRejected(Email.create('a b@x.com'), 'COL-1')
  })

  it('COL-1 rejects a doubled @ (a@@x.com)', () => {
    expectRejected(Email.create('a@@x.com'), 'COL-1')
  })

  it.each(['alex.studio.com', '@studio.com', 'alex@.com', 'alex@studio..com'])(
    'COL-1 rejects the malformed email %s',
    (raw) => {
      expectRejected(Email.create(raw), 'COL-1')
    },
  )
})
