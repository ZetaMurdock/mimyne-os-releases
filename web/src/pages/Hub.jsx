import { useState } from 'react';
import { useLoaderData } from 'react-router-dom';
import { Avatar, HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import PledgeButton from '../components/PledgeButton.jsx';
import PostCard from '../components/PostCard.jsx';
import RoleChip from '../components/RoleChip.jsx';
import RoomTile from '../components/RoomTile.jsx';
import { createPost, getHub, getUser } from '../data/api.js';
import { useHubAccess, useSession } from '../data/session.jsx';
import './Hub.css';

export function hubLoader({ params }) {
  return getHub(params.slug);
}

const TABS = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'board', label: 'Board' },
  { id: 'pledged', label: 'Pledged' },
  { id: 'rules', label: 'Rules' },
];

export default function Hub() {
  const { hub, rooms, posts: loadedPosts } = useLoaderData();
  const { user, signIn } = useSession();
  const access = useHubAccess(hub);
  const [tab, setTab] = useState('rooms');
  const [posts, setPosts] = useState(loadedPosts);

  const level = access.role?.level ?? (access.isPledged ? 'member' : null);
  const members = Object.entries(hub.members).map(([id, roleId]) => ({
    user: getUser(id),
    role: hub.roles.find((r) => r.id === roleId),
  }));
  const hereNow = [...new Set(rooms.flatMap((r) => (r.levels ? [] : r.here)))].map((id) => ({
    user: getUser(id),
    room: rooms.find((r) => r.here.includes(id)),
  }));

  async function post({ text, files }) {
    const created = await createPost({ author: user.id, hub: hub.id, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  return (
    <div className={`hub ${user ? 'hub--under-notch' : ''}`}>
      <div className="hub__banner placeholder" style={{ background: hub.banner }}>
        [Hub banner]
      </div>

      <div className="hub__identity">
        <span className="hub__icon">
          <HubIcon hub={hub} size={96} />
        </span>
        <div className="hub__names">
          <h1 className="hub__name">{hub.name}</h1>
          <p className="hub__meta">
            {hub.tagline} · <span className="hub__tag">#{hub.tag}</span> · {members.length} pledged
            {hereNow.length > 0 && <span className="hub__live"> · ● {hereNow.length} here now</span>} · Public
          </p>
        </div>
        <div className="hub__actions">
          <Button
            icon="share"
            iconOnly
            aria-label="Copy a link to this Hub"
            onClick={() => navigator.clipboard?.writeText(location.href).catch(() => {})}
          />
          <PledgeButton hub={hub} />
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

      <div className="hub__content">
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
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="hub__panel">
            {tab === 'rooms' && (
              <div className="hub__rooms">
                {rooms.map((room) => (
                  <RoomTile key={room.id} room={room} currentHub={hub.id} signedIn={!!user} level={level} />
                ))}
                {access.canModerate && (
                  <button type="button" className="hub__add-room">
                    <Icon name="plus" size={20} />
                    Add a workspace as a room
                    <span>It can stay in your other Hubs too</span>
                  </button>
                )}
              </div>
            )}

            {tab === 'board' && (
              <div className="hub__board">
                {!user ? (
                  <LockedComposer text={`Sign in to post in ${hub.name}`} action="Sign in" onAction={signIn} />
                ) : !access.canPost ? (
                  <LockedComposer text="Only people who pledged can post here. The Hub's owner set it that way." />
                ) : (
                  <Composer placeholder={`Post to ${hub.name}`} onSubmit={post} />
                )}
                {posts.length === 0 && <p className="muted">No posts yet.</p>}
                {posts.map((p) => (
                  <PostCard key={p.id} post={p} showHub={false} />
                ))}
              </div>
            )}

            {tab === 'pledged' && (
              <ul className="hub__members">
                {members.map(({ user: m, role }) => (
                  <li key={m.id} className="person">
                    <Avatar user={m} size={36} />
                    <span className="person__name">{m.name}</span>
                    <RoleChip role={role} />
                  </li>
                ))}
              </ul>
            )}

            {tab === 'rules' && <Rules hub={hub} />}
          </div>
        </div>

        <aside className="hub__side">
          {hereNow.length > 0 && (
            <section className="hub__side-block">
              <h2 className="label">Here now</h2>
              {hereNow.map(({ user: u, room }) => (
                <div key={u.id} className="person">
                  <Avatar user={u} size={32} />
                  <span className="person__text">
                    <span className="person__name">{u.name}</span>
                    <span className="person__status">In {room.name}</span>
                  </span>
                </div>
              ))}
            </section>
          )}
          <section className="card side-card">
            <h2 className="side-card__title">House rules</h2>
            <Rules hub={hub} short />
          </section>
          <section className="card side-card">
            <h2 className="side-card__title">Roles</h2>
            {hub.roles.map((role) => (
              <div key={role.id} className="hub__role">
                <RoleChip role={role} />
                <span className="muted">{LEVEL_LABEL[role.level]}</span>
              </div>
            ))}
            <p className="hub__role-note">Names and colors are this Hub's own.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

const LEVEL_LABEL = { owner: 'Runs the Hub', mod: 'Keeps it tidy', member: 'Pledged' };

function Rules({ hub, short = false }) {
  return (
    <div className="hub__rules">
      <p className="muted">
        <a href="/guidelines.html">Mimyne's Community Guidelines</a>
        {hub.rules.length ? ', plus this Hub’s own:' : ' apply here.'}
      </p>
      {hub.rules.length > 0 && (
        <ol>
          {hub.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      )}
      {!short && (
        <p className="muted">
          {hub.postingPolicy === 'pledged'
            ? 'Only people who pledged can post on the Board.'
            : 'Anyone signed in can post on the Board.'}
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
