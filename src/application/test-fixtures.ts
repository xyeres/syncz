/**
 * Application test setup: real use cases on the in-memory ports (a test-only composition root,
 * which is why this file and *.test.ts may import infrastructure; see check-domain-imports.mjs).
 */
import { createInMemoryPorts } from '../infrastructure'
import { MOCK_CHANNEL_ID } from '../infrastructure/youtube/mock-channel-catalog'
import { expectOk } from '../domain/shared/test-fixtures'
import type { VideoId } from '../domain/shared/ids'
import { makeUseCases } from './make-use-cases'
import { makeQueries } from './queries'

export * from '../domain/shared/test-fixtures'

export const OWNER = { ownerName: 'Maya Ortiz', ownerEmail: 'maya@mayabuilds.studio' }
export const v = (n: number) => `v${String(n).padStart(2, '0')}` as VideoId

/** A signed-in channel with Alex and Sam as collaborators. Revenue comes from the mock catalog. */
export async function aChannel() {
  const env = createInMemoryPorts()
  const uc = makeUseCases(env.ports)
  const queries = makeQueries(env.ports)
  expectOk(await uc.signIn({ ...OWNER, channelId: MOCK_CHANNEL_ID }))
  const alex = expectOk(await uc.addCollaborator({ name: 'Alex Rivera', email: 'alex@studio.com', role: { kind: 'Editor' } }))
  const sam = expectOk(await uc.addCollaborator({ name: 'Sam Chen', email: 'sam@studio.com', role: { kind: 'Co-host' } }))
  return { ...env, uc, queries, alex, sam }
}

/** The JSON of one repository table, for byte-identical comparisons. */
export const tableOf = (dump: string, table: 'account' | 'splits' | 'collaborators' | 'reports' | 'ledgers') =>
  JSON.stringify((JSON.parse(dump) as Record<string, unknown>)[table])
