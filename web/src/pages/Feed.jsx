import { useState } from 'react';
import { Link, useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import { HubRow } from '../components/HubCard.jsx';
import PostCard from '../components/PostCard.jsx';
import { createPost, getFeed, openDirect } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import NeedsAccount from './NeedsAccount.jsx';
import './Feed.css';

export function feedLoader() {
  return getFeed();
}

const FILTERS = [
  { id: 'for-you', label: 'For you' },
  { id: 'buddies', label: 'Buddies' },
  { id: 'hubs', label: 'Your Hubs' },
  { id: 'new', label: 'New' },
];

export default function Feed() {
  const { user, status } = useSession();
  if (status === 'loading') return null;
  return user ? <SignedInFeed /> : <NeedsAccount what="your feed" />;
}

function SignedInFeed() {
  const { posts: loaded, discover, buddies, hubs } = useLoaderData();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState(loaded);
  const filter = params.get('f') ?? 'for-you';
  const hubById = new Map(hubs.map((h) => [h.id, h]));

  const shown = posts
    .filter((p) => {
      if (filter === 'buddies') return p.scope.profileUid && p.scope.profileUid !== user.uid;
      if (filter === 'hubs') return !!p.scope.hubId;
      return true;
    })
    .sort((a, b) => (filter === 'for-you' ? score(b) - score(a) : b.at - a.at));

  // Your profile always; a Hub when its owner lets you post there.
  const destinations = [
    { value: '', label: 'Your profile' },
    ...hubs.map((h) => ({ value: h.id, label: h.name })),
  ];

  async function post({ text, files, destination }) {
    const scope = destination ? { hubId: destination } : { profileUid: user.uid };
    const created = await createPost(scope, { me: user, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  return (
    <div className="frame">
      <div className="frame__main">
        <div className="feed__filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              className="feed__filter"
              onClick={() => setParams(f.id === 'for-you' ? {} : { f: f.id }, { preventScrollReset: true })}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Composer destinations={destinations} onSubmit={post} />

        {shown.length === 0 && (
          <div className="feed__empty">
            <p>Nothing here yet.</p>
            <p className="muted">Pledge to a Hub or add Buddies in the app, and their posts show up here.</p>
          </div>
        )}
        {shown.map((p) => (
          <PostCard key={`${p.scope.hubId ?? p.scope.profileUid}/${p.id}`} post={p} hub={p.scope.hubId ? hubById.get(p.scope.hubId) : null} />
        ))}
      </div>

      <aside className="frame__side">
        <section id="find-hubs" className="card side-card">
          <h2 className="side-card__title">Hubs to look at</h2>
          {discover.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No public Hubs to show yet.</p>}
          {discover.map((hub) => (
            <HubRow key={hub.id} hub={hub} />
          ))}
          <Button to="/hubs/new" variant="secondary" size="sm">
            Start a Hub
          </Button>
        </section>
        {buddies.length > 0 && (
          <section className="card side-card">
            <h2 className="side-card__title">Buddies</h2>
            {buddies.slice(0, 8).map((uid) => (
              <Buddy key={uid} uid={uid} />
            ))}
          </section>
        )}
        <p className="feed__links">
          <Link to="/">Home</Link> · <a href="/guidelines.html">Guidelines</a>
        </p>
      </aside>
    </div>
  );
}

function Buddy({ uid }) {
  const person = usePerson(uid);
  const { user } = useSession();
  const navigate = useNavigate();
  return (
    <div className="person">
      <Avatar person={person} size={32} />
      <span className="person__text" style={{ flexGrow: 1 }}>
        <span className="person__name">{person.name}</span>
        <span className="person__status">@{person.username}</span>
      </span>
      <Button size="sm" variant="ghost" icon="message" iconOnly aria-label={`Message ${person.name}`} onClick={async () => navigate(`/messages/${await openDirect(user.uid, uid)}`)} />
    </div>
  );
}

// Newer and better-approved posts rise. Approvals aren't loaded with the
// feed, so for now this is recency with a small lift for your Hubs.
function score(post) {
  const hours = (Date.now() - post.at) / 3_600_000;
  return (post.scope.hubId ? 1.2 : 1) / Math.pow(hours + 2, 1.2);
}
