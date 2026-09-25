import { useEffect, useState } from 'react';
import { Link, useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import { HubRow } from '../components/HubCard.jsx';
import PostCard from '../components/PostCard.jsx';
import { createPost, getFeed, getHubCards, hubPosts, openDirect } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import NeedsAccount from './NeedsAccount.jsx';
import { StatusDot } from '../components/Presence.jsx';
import { useStatuses } from '../data/status.js';
import { statusLine } from '../lib/status.js';
import './Feed.css';

export function feedLoader() {
  return getFeed();
}

const FILTERS = [
  { id: 'for-you', label: 'For you' },
  { id: 'buddies', label: 'Buddies' },
  { id: 'hubs', label: 'Your Hubs' },
  { id: 'popular', label: 'Popular' },
  { id: 'new', label: 'New' },
];

// How close a post is to you, for ranking: your buddies first, then your
// Hubs, you, people you stalk, your buddies' buddies, and popular posts.
const CLOSENESS = { buddies: 3, hubs: 2.2, you: 2, stalking: 2, fof: 1.6, popular: 1.2 };

export default function Feed() {
  const { user, status } = useSession();
  if (status === 'loading') return null;
  return user ? <SignedInFeed /> : <NeedsAccount what="your feed" />;
}

function SignedInFeed() {
  const { posts: loaded, discover, buddies, hubs: loadedHubs } = useLoaderData();
  const { user, pledged } = useSession();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState(loaded);
  const [hubs, setHubs] = useState(loadedHubs);
  const filter = params.get('f') ?? 'for-you';
  const hubById = new Map(hubs.map((h) => [h.id, h]));

  // Hubs you pledged to that the feed didn't know about when it loaded (a
  // pledge just made, or the list of your Hubs arriving late) join it.
  useEffect(() => {
    const missing = [...pledged].filter((id) => !hubs.some((h) => h.id === id));
    if (!missing.length) return;
    let live = true;
    Promise.all([hubPosts(missing), getHubCards(missing)]).then(([more, cards]) => {
      if (!live) return;
      setPosts((prev) => [...prev.filter((p) => !missing.includes(p.scope.hubId)), ...more]);
      setHubs((prev) => [...prev.filter((h) => !missing.includes(h.id)), ...cards]);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pledged]);

  const shown = posts
    .filter((p) => {
      if (filter === 'buddies') return p.circle === 'buddies' || p.circle === 'fof';
      if (filter === 'hubs') return !!p.scope.hubId && (p.circle === 'hubs' || pledged.has(p.scope.hubId));
      if (filter === 'popular') return Date.now() - p.at < 14 * 86_400_000;
      return true;
    })
    .sort((a, b) => {
      if (filter === 'new') return b.at - a.at;
      if (filter === 'popular') return popularity(b) - popularity(a) || b.at - a.at;
      if (filter === 'for-you') return score(b) - score(a);
      return b.at - a.at;
    });

  // Your profile always, and your Hubs.
  const yours = new Set([...pledged, ...posts.filter((p) => p.circle === 'hubs').map((p) => p.scope.hubId)]);
  const destinations = [
    { value: '', label: 'Your profile' },
    ...hubs.filter((h) => yours.has(h.id)).map((h) => ({ value: h.id, label: h.name })),
  ];

  async function post({ text, files, destination }) {
    const scope = destination ? { hubId: destination } : { profileUid: user.uid };
    const created = await createPost(scope, { me: user, body: text, files });
    setPosts((prev) => [{ ...created, circle: destination ? 'hubs' : 'you', views: 0, approvals: 0, commentCount: 0 }, ...prev]);
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
            <p className="muted">
              {filter === 'hubs' ? 'Nothing posted in your Hubs yet.' : 'Pledge to a Hub or add Buddies, and their posts show up here.'}
            </p>
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
        {buddies.length > 0 && <BuddiesCard buddies={buddies} />}
        <p className="feed__links">
          <Link to="/">Home</Link> · <a href="/guidelines.html">Guidelines</a>
        </p>
      </aside>
    </div>
  );
}

// Your buddies, who's around first: online, then away, then everyone else.
function BuddiesCard({ buddies }) {
  const statuses = useStatuses(buddies);
  const rank = { online: 0, away: 1, offline: 2 };
  const sorted = [...buddies].sort((a, b) => rank[statuses[a]?.state ?? 'offline'] - rank[statuses[b]?.state ?? 'offline']);
  const around = buddies.filter((uid) => statuses[uid]?.state !== 'offline').length;
  return (
    <section className="card side-card">
      <h2 className="side-card__title">
        Buddies <span className="muted feed__around">{around} around</span>
      </h2>
      {sorted.slice(0, 12).map((uid) => (
        <Buddy key={uid} uid={uid} status={statuses[uid]} />
      ))}
    </section>
  );
}

function Buddy({ uid, status }) {
  const person = usePerson(uid);
  const { user } = useSession();
  const navigate = useNavigate();
  return (
    <div className="person">
      <Link to={`/people/${uid}`} className="feed__buddy-pic" aria-hidden="true" tabIndex={-1}>
        <span className="with-status">
          <Avatar person={person} size={32} />
          {status && <StatusDot status={status} size={10} />}
        </span>
      </Link>
      <span className="person__text" style={{ flexGrow: 1, minWidth: 0 }}>
        <Link to={`/people/${uid}`} className="person__name">{person.name}</Link>
        <span className="person__status">{status ? statusLine(status) : `@${person.username}`}</span>
      </span>
      <Button size="sm" variant="ghost" icon="message" iconOnly aria-label={`Message ${person.name}`} onClick={async () => navigate(`/messages/${await openDirect(user.uid, uid)}`)} />
    </div>
  );
}

/** How much people took to it: views, approvals and talk. */
function popularity(post) {
  return Math.log1p(post.views ?? 0) + 2 * Math.log1p(post.approvals ?? 0) + Math.log1p(post.commentCount ?? 0);
}

// For you: what people took to, from people close to you, newer first.
function score(post) {
  const hours = Math.max(0, (Date.now() - post.at) / 3_600_000);
  return ((1 + popularity(post)) * (CLOSENESS[post.circle] ?? 1)) / Math.pow(hours + 2, 1.3);
}
