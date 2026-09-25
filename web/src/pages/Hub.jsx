import { useEffect, useState } from 'react';
import { useLoaderData, useSearchParams } from 'react-router-dom';
import { HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import PledgeButton from '../components/PledgeButton.jsx';
import PostCard from '../components/PostCard.jsx';
import RoleChip from '../components/RoleChip.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import HubFiles from '../components/hub/HubFiles.jsx';
import HubRooms from '../components/hub/HubRooms.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { createPost, getHub } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useHubAccess, useSession } from '../data/session.jsx';
import './Hub.css';

export function hubLoader({ params }) {
  return getHub(params.slug);
}

// Switching tabs or Rooms changes the address (?tab=, ?room=) without
// loading the Hub again.
export function shouldRevalidate({ currentParams, nextParams, defaultShouldRevalidate, formMethod }) {
  return formMethod ? defaultShouldRevalidate : currentParams.slug !== nextParams.slug;
}

const TABS = [
  { id: 'rooms', label: 'Rooms', icon: 'hash' },
  { id: 'board', label: 'Board' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'pledged', label: 'Pledged' },
  { id: 'rules', label: 'Rules' },
];

const LEVEL_LABEL = { owner: 'Runs the Hub', mod: 'Keeps it tidy', member: 'Pledged' };

export default function Hub() {
  const { hub, roles, members, posts: loadedPosts } = useLoaderData();
  const { user, signIn } = useSession();
  const access = useHubAccess(hub, members);
  const { remember } = useSession();
  const inIt = !!user && (hub.ownerId === user.uid || members.some((m) => m.uid === user.uid));
  // In this Hub but missing from your list of Hubs: put it back.
  useEffect(() => {
    if (inIt) remember?.(hub.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inIt, hub.id]);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'rooms';
  const setTab = (id, extra = {}) =>
    setParams(Object.fromEntries(Object.entries({ tab: id === 'rooms' ? null : id, ...extra }).filter(([, v]) => v)), { replace: true, preventScrollReset: true });
  const [sharing, setSharing] = useState(false);
  const [posts, setPosts] = useState(loadedPosts);

  const roleOf = (uid) => roles.find((r) => r.id === members.find((m) => m.uid === uid)?.role) ?? null;

  async function post({ text, files }) {
    const created = await createPost({ hubId: hub.id }, { me: user, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  return (
    <div className={`hub ${user ? 'hub--under-notch' : ''}`}>
      <div className="hub__banner" style={{ background: `${hub.color}2e` }} />

      <div className="hub__identity">
        <span className="hub__icon">
          <HubIcon hub={hub} size={96} />
        </span>
        <div className="hub__names">
          <h1 className="hub__name">{hub.name}</h1>
          <p className="hub__meta">
            {[hub.tagline, hub.tag && `#${hub.tag}`, `${members.length} pledged`, hub.visibility === 'public' ? 'Public' : 'Private']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="hub__actions">
          <Button icon="share" iconOnly aria-label="Share this Hub" onClick={() => setSharing(true)} />
          <PledgeButton hub={hub} pledgedHere={access.isPledged} />
        </div>
      </div>

      {!user && (
        <div className="hub__notice">
          <Icon name="eye" size={18} />
          <p>You're reading a public Hub. Anyone can look. Posting, comments, messages, downloads and pledging need a Mimyne account.</p>
          <button type="button" className="hub__notice-link" onClick={signIn}>
            Sign in
          </button>
        </div>
      )}

      <div className={`hub__content ${tab === 'rooms' || tab === 'files' ? 'hub__content--wide' : ''}`}>
        <div className="hub__main">
          <div className="tabs" role="tablist" aria-label={`${hub.name} sections`}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className="tabs__tab"
                onClick={() => setTab(t.id)}
              >
                {t.icon && <Icon name={t.icon} size={15} />}
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="hub__panel">
            {tab === 'rooms' && (
              <HubRooms
                hub={hub}
                members={members}
                roles={roles}
                roleOf={roleOf}
                user={user}
                access={access}
                roomId={params.get('room')}
                onRoom={(room) => setTab('rooms', { room })}
                onSignIn={signIn}
              />
            )}

            {tab === 'files' && <HubFiles hub={hub} user={user} access={access} onSignIn={signIn} />}

            {tab === 'board' && (
              <div className="hub__board">
                {!user ? (
                  <LockedComposer text={`Sign in to post in ${hub.name}`} action="Sign in" onAction={signIn} />
                ) : !access.canPost ? (
                  <LockedComposer text="Only people who pledged can post here. The Hub's owner set it that way." />
                ) : (
                  <Composer placeholder={`Post to ${hub.name}`} onSubmit={post} />
                )}
                {posts.length === 0 && <p className="muted hub__empty">Nothing on the Board yet.</p>}
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} hub={hub} showHub={false} roleOf={roleOf} canModerate={access.canModerate} />
                ))}
              </div>
            )}

            {tab === 'pledged' && (
              <ul className="hub__members">
                {members.map((m) => (
                  <Member key={m.uid} member={m} role={roleOf(m.uid)} />
                ))}
              </ul>
            )}

            {tab === 'rules' && <Rules hub={hub} />}
          </div>
        </div>

        {tab !== 'rooms' && tab !== 'files' && (
        <aside className="hub__side">
          <section className="card side-card">
            <h2 className="side-card__title">House rules</h2>
            <Rules hub={hub} short />
          </section>
          <section className="card side-card">
            <h2 className="side-card__title">Roles</h2>
            {roles.map((role) => (
              <div key={role.id} className="hub__role">
                <RoleChip role={role} />
                <span className="muted">{LEVEL_LABEL[role.level]}</span>
              </div>
            ))}
            <p className="hub__role-note">Names and colours are this Hub's own.</p>
          </section>
        </aside>
        )}
      </div>
      {sharing && (
        <ShareDialog
          title={`Share ${hub.name}`}
          link={`/h/${hub.id}`}
          payload={{ text: `https://mimyne.com/h/${hub.id}` }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function Member({ member, role }) {
  const person = usePerson(member.uid, member.name);
  return (
    <li className="person">
      <Avatar person={person} size={36} />
      <span className="person__name">{person.name}</span>
      <RoleChip role={role} />
    </li>
  );
}

function Rules({ hub, short = false }) {
  return (
    <div className="hub__rules">
      <p className="muted">
        <a href="/guidelines.html">Mimyne's Community Guidelines</a>
        {hub.rules ? ', plus this Hub’s own:' : ' apply here.'}
      </p>
      {hub.rules && <p className="hub__rules-text">{short && hub.rules.length > 400 ? `${hub.rules.slice(0, 400)}…` : hub.rules}</p>}
      {!short && (
        <p className="muted">
          {hub.postingPolicy === 'pledged' ? 'Only people who pledged can post on the Board.' : 'Anyone signed in can post on the Board.'}
        </p>
      )}
    </div>
  );
}

function LockedComposer({ text, action, onAction }) {
  return (
    <div className="hub__locked">
      <Icon name="lock" size={18} />
      <span>{text}</span>
      {action && (
        <Button size="md" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
