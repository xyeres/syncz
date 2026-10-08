import { isOwner, type CollaboratorId, type PartyId } from '../../domain/shared/ids'
import { fail, type Result } from '../../domain/shared/result'
import { Collaborator, type CollaboratorFields } from '../../domain/revenue-sharing/collaborator'
import { checkCollaboratorRemovable, checkEmailAvailable } from '../../domain/revenue-sharing/policies'
import type { Ports } from '../ports'
import { andThen, found, metaOf, requireChannel, saved, type ChannelContext } from './support'

const save = (ports: Ports) => (c: Collaborator) => saved((x: Collaborator) => ports.repos.collaborators.save(x), c)

/** COL-7 at the untyped boundary, then NOT_FOUND. */
async function findCollaborator({ repos }: Ports, id: PartyId): Promise<Result<Collaborator>> {
  if (isOwner(id)) return fail('COL-7', 'The channel owner is not a collaborator')
  return found(await repos.collaborators.findById(id), 'Collaborator')
}

/** COL-2: unique per channel (soft-deleted included) and never the owner's email. */
async function checkEmail(
  ports: Ports,
  { account, channelId }: ChannelContext,
  c: Collaborator,
  selfId?: CollaboratorId,
): Promise<Result<void>> {
  const all = await ports.repos.collaborators.listByChannel(channelId)
  return checkEmailAvailable(c.email, all, account.ownerEmail, selfId)
}

export const addCollaborator =
  (ports: Ports) =>
  (cmd: CollaboratorFields): Promise<Result<Collaborator>> =>
    andThen(requireChannel(ports), (ctx) =>
      andThen(
        Collaborator.register({ ...cmd, id: ports.ids.next('c') as CollaboratorId, channelId: ctx.channelId }),
        (c) => andThen(checkEmail(ports, ctx, c), () => save(ports)(c)),
      ),
    )

export type EditCollaboratorCommand = Readonly<{ id: PartyId; fields: Partial<CollaboratorFields> }>

export const editCollaborator =
  (ports: Ports) =>
  (cmd: EditCollaboratorCommand): Promise<Result<Collaborator>> =>
    andThen(requireChannel(ports), (ctx) =>
      andThen(findCollaborator(ports, cmd.id), (current) =>
        andThen(current.edit(cmd.fields), (edited) =>
          andThen(checkEmail(ports, ctx, edited, edited.id), () => save(ports)(edited)),
        ),
      ),
    )

/** COL-4 (not in any split), then COL-5 soft delete. */
export const deleteCollaborator =
  (ports: Ports) =>
  (cmd: Readonly<{ id: PartyId }>): Promise<Result<Collaborator>> =>
    andThen(requireChannel(ports), ({ channelId }) =>
      andThen(findCollaborator(ports, cmd.id), async (c) =>
        andThen(checkCollaboratorRemovable(c.id, await ports.repos.splits.listByChannel(channelId)), () =>
          andThen(c.softDelete(metaOf(ports, 'evt')), save(ports)),
        ),
      ),
    )
