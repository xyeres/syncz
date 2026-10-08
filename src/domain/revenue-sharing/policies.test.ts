import {
  checkCollaboratorRemovable,
  checkEmailAvailable,
  checkSplitReferences,
  checkVideoExclusivity,
} from './policies'
import { OWNER_ID } from '../shared/ids'
import {
  ALEX,
  JO,
  OWNER_EMAIL,
  SAM,
  V1,
  V2,
  V3,
  aCollaborator,
  aSplit,
  anEmail,
  expectOk,
  expectRejected,
  meta,
  share,
  splitId,
  videoId,
} from '../test-fixtures'

const alex = () => aCollaborator({ id: ALEX, name: 'Alex Rivera', email: 'alex@studio.com' })
const sam = () => aCollaborator({ id: SAM, name: 'Sam Chen', email: 'sam@studio.com' })
const deletedJo = () =>
  expectOk(aCollaborator({ id: JO, name: 'Jo Park', email: 'jo@studio.com' }).softDelete(meta(1)))

describe('sharing policies', () => {
  describe('checkVideoExclusivity', () => {
    const other = () =>
      aSplit({ id: splitId('split-other'), name: 'Podcast clips', videoIds: [V2, V3] })

    it('SPL-7 rejects a video already in another split, naming that split', () => {
      const split = aSplit({ id: splitId('split-new'), name: 'New split', videoIds: [V1, V2] })
      const before = split.toSnapshot()
      const reasons = expectRejected(checkVideoExclusivity(split, [other()]), 'SPL-7')
      expect(reasons.find((r) => r.code === 'SPL-7')?.message).toContain('Podcast clips')
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-7 accepts videos that no other split holds', () => {
      const split = aSplit({ id: splitId('split-new'), videoIds: [V1] })
      expectOk(checkVideoExclusivity(split, [other()]))
    })

    it('SPL-7 ignores the split’s own id on update', () => {
      const saved = aSplit({ id: splitId('split-1'), videoIds: [V1, V2] })
      const updated = expectOk(saved.revise({ name: 'Renamed', videoIds: [V1, V2], shares: saved.shares }))
      expectOk(checkVideoExclusivity(updated, [saved]))
    })

    it('SPL-7 / SPL-11 once the other split is absent (deleted), the same video is accepted', () => {
      const split = aSplit({ id: splitId('split-new'), videoIds: [V2] })
      expectRejected(checkVideoExclusivity(split, [other()]), 'SPL-7')
      expectOk(checkVideoExclusivity(split, []))
    })
  })

  describe('checkSplitReferences', () => {
    const channelVideoIds = new Set([V1, V2, V3])

    it('SPL-8 accepts channel videos and active collaborators', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 5000), share(ALEX, 2500), share(SAM, 2500)] })
      expectOk(checkSplitReferences(split, { channelVideoIds, collaborators: [alex(), sam()] }))
    })

    it('SPL-8 rejects a video that is not on the linked channel', () => {
      const split = aSplit({ videoIds: [V1, videoId('v-foreign')] })
      const before = split.toSnapshot()
      expectRejected(
        checkSplitReferences(split, { channelVideoIds, collaborators: [alex()] }),
        'SPL-8',
      )
      expect(split.toSnapshot()).toEqual(before)
    })

    it('SPL-8 rejects an unknown collaborator', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 5000), share(ALEX, 2500), share(SAM, 2500)] })
      expectRejected(
        checkSplitReferences(split, { channelVideoIds, collaborators: [alex()] }),
        'SPL-8',
      )
    })

    it('SPL-8 rejects a soft-deleted collaborator', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 5000), share(JO, 5000)] })
      expectRejected(
        checkSplitReferences(split, { channelVideoIds, collaborators: [alex(), deletedJo()] }),
        'SPL-8',
      )
    })

    it('SPL-8 ignores OWNER_ID (the owner is not a collaborator)', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 10000)] })
      expectOk(checkSplitReferences(split, { channelVideoIds, collaborators: [] }))
    })

    it('SPL-8 collects all reasons: a foreign video and a deleted collaborator', () => {
      const split = aSplit({
        videoIds: [videoId('v-foreign')],
        shares: [share(OWNER_ID, 5000), share(JO, 5000)],
      })
      const reasons = expectRejected(
        checkSplitReferences(split, { channelVideoIds, collaborators: [deletedJo()] }),
        'SPL-8',
      )
      expect(reasons.filter((r) => r.code === 'SPL-8').length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('checkEmailAvailable', () => {
    const owner = anEmail(OWNER_EMAIL)
    const all = () => [alex(), sam(), deletedJo()]

    it('COL-2 accepts an email nobody holds', () => {
      expectOk(checkEmailAvailable(anEmail('new@studio.com'), all(), owner))
    })

    it('COL-2 rejects the same email with different case and whitespace', () => {
      expectRejected(checkEmailAvailable(anEmail('  ALEX@Studio.COM '), all(), owner), 'COL-2')
    })

    it('COL-2 rejects an email held by a soft-deleted collaborator', () => {
      expectRejected(checkEmailAvailable(anEmail('jo@studio.com'), all(), owner), 'COL-2')
    })

    it('COL-2 rejects the owner’s email', () => {
      expectRejected(checkEmailAvailable(anEmail('Owner@Syncz.com'), all(), owner), 'COL-2')
    })

    it('COL-2 allows keeping your own email on edit', () => {
      expectOk(checkEmailAvailable(anEmail('Alex@Studio.com'), all(), owner, ALEX))
    })

    it('COL-2 still rejects another collaborator’s email on edit', () => {
      expectRejected(checkEmailAvailable(anEmail('sam@studio.com'), all(), owner, ALEX), 'COL-2')
    })
  })

  describe('checkCollaboratorRemovable', () => {
    it('COL-4 rejects deleting a collaborator referenced by splits, listing their names', () => {
      const splits = [
        aSplit({ id: splitId('s1'), name: 'Intro series', videoIds: [V1] }),
        aSplit({ id: splitId('s2'), name: 'Podcast clips', videoIds: [V2] }),
        aSplit({ id: splitId('s3'), name: 'Owner only', videoIds: [V3], shares: [share(OWNER_ID, 10000)] }),
      ]
      const reasons = expectRejected(checkCollaboratorRemovable(ALEX, splits), 'COL-4')
      const message = reasons.find((r) => r.code === 'COL-4')?.message ?? ''
      expect(message).toContain('Intro series')
      expect(message).toContain('Podcast clips')
      expect(message).not.toContain('Owner only')
    })

    it('COL-4 allows deleting a collaborator with no references', () => {
      const splits = [aSplit({ shares: [share(OWNER_ID, 7000), share(SAM, 3000)] })]
      expectOk(checkCollaboratorRemovable(ALEX, splits))
    })

    it('COL-4 allows deleting when there are no splits', () => {
      expectOk(checkCollaboratorRemovable(ALEX, []))
    })

    it('COL-7 the owner cannot be passed as a CollaboratorId (compile time)', () => {
      const compileOnly = () =>
        // @ts-expect-error COL-7: OWNER_ID is not a CollaboratorId
        checkCollaboratorRemovable(OWNER_ID, [])
      expect(typeof compileOnly).toBe('function')
    })
  })

  describe('Reason.partyId', () => {
    const channelVideoIds = new Set([V1, V2, V3])

    it('SPL-8 an unknown collaborator is named by partyId', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 5000), share(ALEX, 2500), share(SAM, 2500)] })
      const reasons = expectRejected(checkSplitReferences(split, { channelVideoIds, collaborators: [alex()] }), 'SPL-8')
      expect(reasons.map((r) => r.partyId)).toEqual([SAM])
    })

    it('SPL-8 a soft-deleted collaborator is named by partyId', () => {
      const split = aSplit({ shares: [share(OWNER_ID, 5000), share(JO, 5000)] })
      const reasons = expectRejected(
        checkSplitReferences(split, { channelVideoIds, collaborators: [alex(), deletedJo()] }),
        'SPL-8',
      )
      expect(reasons.map((r) => r.partyId)).toEqual([JO])
    })

    it('SPL-8 a foreign-video reason has no partyId key', () => {
      const split = aSplit({ videoIds: [V1, videoId('v-foreign')] })
      const reasons = expectRejected(checkSplitReferences(split, { channelVideoIds, collaborators: [alex()] }), 'SPL-8')
      expect(reasons).toHaveLength(1)
      expect('partyId' in (reasons[0] ?? {})).toBe(false)
    })

    it('SPL-8 mixed: only the collaborator reason carries partyId', () => {
      const split = aSplit({ videoIds: [videoId('v-foreign')], shares: [share(OWNER_ID, 5000), share(JO, 5000)] })
      const reasons = expectRejected(checkSplitReferences(split, { channelVideoIds, collaborators: [deletedJo()] }), 'SPL-8')
      expect(reasons.map((r) => ('partyId' in r ? r.partyId : null)).sort()).toEqual([JO, null].sort())
    })

    it('SPL-7 a video-clash reason has no partyId key', () => {
      const split = aSplit({ id: splitId('split-new'), videoIds: [V1, V2] })
      const other = aSplit({ id: splitId('split-other'), name: 'Podcast clips', videoIds: [V2, V3] })
      const reasons = expectRejected(checkVideoExclusivity(split, [other]), 'SPL-7')
      for (const r of reasons) expect('partyId' in r).toBe(false)
    })
  })
})
