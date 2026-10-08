import { CHANNEL } from '@/infrastructure/seed/mock.js'
import { useApp } from '@/ui/state/context.js'
import Icon, { YouTubeMark } from './Icon.jsx'

/** Avatar button + native popover (light-dismiss and Esc come for free). */
export default function ProfileMenu() {
  const { user, signOut } = useApp()
  return (
    <>
      <button type="button" className="avatar-btn" popoverTarget="profile-pop" aria-label={`Profile: ${user.name}`}>
        {user.initials}
      </button>
      <div id="profile-pop" popover="auto" className="profile-pop" role="dialog" aria-label="Profile">
        <div className="profile-pop__id">
          <span className="avatar-btn avatar-btn--lg" aria-hidden="true">{user.initials}</span>
          <div>
            <div className="profile-pop__name">{user.name}</div>
            <div className="profile-pop__email mono">{user.email}</div>
          </div>
        </div>
        <div className="profile-pop__row">
          <div className="label mono">Linked channel</div>
          <div className="profile-pop__channel">
            <img src={CHANNEL.avatar} alt="" width="36" height="36" />
            <div>
              <div className="profile-pop__cname">{CHANNEL.name}</div>
              <div className="mono muted small">{CHANNEL.handle}</div>
            </div>
            <span className="tag tag--ok mono">
              <YouTubeMark size={14} /> Linked
            </span>
          </div>
        </div>
        <button type="button" className="btn btn--secondary btn--block" onClick={signOut}>
          <Icon name="logout" /> Sign out
        </button>
      </div>
    </>
  )
}
