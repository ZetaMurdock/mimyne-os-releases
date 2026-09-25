import { useEffect, useState } from 'react';
import { Link, useLoaderData, useLocation, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Composer from '../components/Composer.jsx';
import { HubRow } from '../components/HubCard.jsx';
import PostCard from '../components/PostCard.jsx';
import { createPost, getFeed, getHubsById } from '../data/api.js';
import { users } from '../data/mock.js';
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
  const { user } = useSession();
  return user ? <SignedInFeed /> : <NeedsAccount what="your feed" />;
}

function SignedInFeed() {
  const { posts: loaded, discover } = useLoaderData();
  const { user, pledged } = useSession();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const [posts, setPosts] = useState(loaded);
  const filter = params.get('f') ?? 'for-you';

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [hash]);

  const shown = posts
    .filter((p) => {
      if (filter === 'buddies') return !p.hub;
      if (filter === 'hubs') return p.hub && pledged.has(p.hub);
      return true;
    })
    .sort((a, b) => (filter === 'for-you' ? score(b) - score(a) : b.at - a.at));

  // You can always post to your profile; to a Hub when its owner allows it.
  const destinations = [
    { value: '', label: 'Your profile' },
    ...getHubsById([...pledged]).map((h) => ({ value: h.id, label: h.name })),
  ];

  async function post({ text, files, destination }) {
    const created = await createPost({ author: user.id, hub: destination, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  const buddies = [users.kai, users.dex, users.rae];

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

        {shown.length === 0 && <p className="muted feed__empty">Nothing here yet.</p>}
        {shown.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>

      <aside className="frame__side">
        <section id="find-hubs" className="card side-card">
          <h2 className="side-card__title">Hubs to look at</h2>
          {discover.map((hub) => (
            <HubRow key={hub.id} hub={hub} />
          ))}
        </section>
        <section className="card side-card">
          <h2 className="side-card__title">Buddies right now</h2>
          {buddies.map((b) => (
            <div key={b.id} className="person">
              <Avatar user={b} size={32} />
              <span className="person__text">
                <span className="person__name">{b.name}</span>
                <span className={`person__status ${b.activity?.startsWith('In ') ? 'person__status--live' : ''}`}>{b.activity}</span>
              </span>
            </div>
          ))}
        </section>
        <p className="feed__links">
          <Link to="/h/ashfall">Ashfall Modding Crew</Link> · <a href="/guidelines.html">Guidelines</a>
        </p>
      </aside>
    </div>
  );
}

// Newer and better-approved posts rise.
function score(post) {
  const hours = (Date.now() - post.at) / 3_600_000;
  return (post.approvals + 2) / Math.pow(hours + 2, 1.2);
}
