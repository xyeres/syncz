import type { ChannelId, CollaboratorId } from '../shared/ids'
import type { Meta } from '../shared/meta'
import type { IsoDateTime } from '../shared/numbers'
import { collect, fail, failAll, ok, type Result } from '../shared/result'
import { Email } from '../shared/email'
import { Role, type RoleInput } from './role'

/** The editable part of a collaborator, as raw form input. */
export type CollaboratorFields = Readonly<{ name: string; email: string; role: RoleInput }>

export type CollaboratorInput = Readonly<{ id: CollaboratorId; channelId: ChannelId }> & CollaboratorFields

export type CollaboratorSnapshot = Readonly<{
  id: CollaboratorId
  channelId: ChannelId
  name: string
  email: Email
  role: Role
  deletedAt: IsoDateTime | null
}>

type ValidFields = Readonly<{ name: string; email: Email; role: Role }>

/** COL-1 + COL-3. Collects every reason. */
function validate(fields: CollaboratorFields): Result<ValidFields> {
  const name = fields.name.trim()
  const nameCheck = name ? ok(name) : fail('COL-1', 'Enter a name')
  const email = Email.create(fields.email)
  const role = Role.create(fields.role.kind, fields.role.label)
  if (!nameCheck.ok || !email.ok || !role.ok) return failAll(collect(nameCheck, email, role))
  return ok({ name, email: email.value, role: role.value })
}

/** A payee's identity, role and soft-delete state (COL-1, 3, 5). */
export class Collaborator {
  private constructor(
    readonly id: CollaboratorId,
    readonly channelId: ChannelId,
    readonly name: string,
    readonly email: Email,
    readonly role: Role,
    readonly deletedAt: IsoDateTime | null,
  ) {
    Object.freeze(email)
    Object.freeze(role)
    Object.freeze(this)
  }

  static register(input: CollaboratorInput): Result<Collaborator> {
    const valid = validate(input)
    if (!valid.ok) return valid
    const { name, email, role } = valid.value
    return ok(new Collaborator(input.id, input.channelId, name, email, role, null))
  }

  static fromSnapshot(s: CollaboratorSnapshot): Collaborator {
    return new Collaborator(s.id, s.channelId, s.name, { ...s.email }, { ...s.role }, s.deletedAt)
  }

  isDeleted(): boolean {
    return this.deletedAt !== null
  }

  /** Applies the given fields over the current ones and re-validates the result. */
  edit(fields: Partial<CollaboratorFields>): Result<Collaborator> {
    if (this.isDeleted()) return this.deletedReason()
    const valid = validate(this.mergedWith(fields))
    if (!valid.ok) return valid
    const { name, email, role } = valid.value
    return ok(new Collaborator(this.id, this.channelId, name, email, role, null))
  }

  /** COL-5: identity is kept so payments and report history stay meaningful. */
  softDelete(meta: Meta): Result<Collaborator> {
    if (this.isDeleted()) return this.deletedReason()
    return ok(new Collaborator(this.id, this.channelId, this.name, this.email, this.role, meta.at))
  }

  toSnapshot(): CollaboratorSnapshot {
    return {
      id: this.id,
      channelId: this.channelId,
      name: this.name,
      email: { ...this.email },
      role: { ...this.role },
      deletedAt: this.deletedAt,
    }
  }

  /** The given fields over the current ones, as raw input for re-validation. */
  private mergedWith(fields: Partial<CollaboratorFields>): CollaboratorFields {
    return {
      name: fields.name ?? this.name,
      email: fields.email ?? this.email.value,
      role: fields.role ?? this.role,
    }
  }

  private deletedReason(): Result<never> {
    return fail('COL-5', `${this.name} has been deleted and can no longer be changed`)
  }
}
