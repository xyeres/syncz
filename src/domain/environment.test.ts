// Guards the Jest config: domain tests run in the plain `node` environment,
// so the domain can never come to rely on DOM globals.
describe('domain test environment', () => {
  it('has no DOM globals (window/document)', () => {
    const g = globalThis as Record<string, unknown>
    expect(g['window']).toBeUndefined()
    expect(g['document']).toBeUndefined()
  })
})
