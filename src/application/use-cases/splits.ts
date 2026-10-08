import type { PartyId, SplitId, VideoId } from '../../domain/shared/ids'
import { collect, failAll, fail, OK, ok, type Result } from '../../domain/shared/result'
import { checkSplitReferences, checkVideoExclusivity } from '../../domain/revenue-sharing/policies'
import { Split } from '../../domain/revenue-sharing/split'
import type { Ports } from '../ports'
import { andThen, found, requireChannel, saved, type ChannelContext } from './support'

export type SaveSplitCommand = Readonly<{
  /** Omit to create a new split; set to revise an existing one. */
  id?: SplitId
  name: string
  videoIds: readonly VideoId[]
  shares: readonly Readonly<{ partyId: PartyId; bps: number }>[]
}>

const fieldsOf = (cmd: SaveSplitCommand) => ({ name: cmd.name, videoIds: cmd.videoIds, shares: cmd.shares })

async function reviseSplit({ repos }: Ports, id: SplitId, cmd: SaveSplitCommand): Promise<Result<Split>> {
  return andThen(found(await repos.splits.findById(id), 'Split'), (split) => split.revise(fieldsOf(cmd)))
}

const createSplit = ({ ids }: Ports, { channelId }: ChannelContext, cmd: SaveSplitCommand): Result<Split> =>
  Split.create({ id: ids.next('split') as SplitId, channelId, ...fieldsOf(cmd) })

/** SPL-7 (other current splits) and SPL-8 (channel videos, active collaborators). */
async function checkSplitPolicies(ports: Ports, split: Split): Promise<Result<void>> {
  const [others, videos, collaborators] = await Promise.all([
    ports.repos.splits.listByChannel(split.channelId),
    ports.catalog.listVideos(split.channelId),
    ports.repos.collaborators.listByChannel(split.channelId),
  ])
  const reasons = collect(
    checkVideoExclusivity(split, others),
    checkSplitReferences(split, { channelVideoIds: new Set(videos.map((v) => v.id)), collaborators }),
  )
  return reasons.length > 0 ? failAll(reasons) : OK
}

/** Creates or revises a split (SPL-1…6 in the aggregate; SPL-7/8 across aggregates). */
export const saveSplit =
  (ports: Ports) =>
  (cmd: SaveSplitCommand): Promise<Result<Split>> =>
    andThen(requireChannel(ports), (ctx) =>
      andThen(cmd.id === undefined ? createSplit(ports, ctx, cmd) : reviseSplit(ports, cmd.id, cmd), (split) =>
        andThen(checkSplitPolicies(ports, split), () => saved((s: Split) => ports.repos.splits.save(s), split)),
      ),
    )

/** SPL-11: a split may be deleted at any time (hard delete); revisions keep their snapshots. */
export const deleteSplit =
  ({ repos }: Ports) =>
  async (cmd: Readonly<{ id: SplitId }>): Promise<Result<void>> => {
    const split = await repos.splits.findById(cmd.id)
    if (!split) return fail('NOT_FOUND', 'Split was not found')
    await repos.splits.delete(cmd.id)
    return ok(undefined)
  }
