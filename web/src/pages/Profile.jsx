import { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { useLoaderData, useNavigate, useRevalidator } from 'react-router-dom';
import ApproveBar from '../components/ApproveBar.jsx';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import MedalClips, { MedalClipsPage } from '../components/profile/MedalClips.jsx';
import { NowPlayingCard } from '../components/profile/NowPlaying.jsx';
import SongsPlayer from '../components/profile/SongsPlayer.jsx';
import { useVotes } from '../components/useVotes.js';
import { AvatarWithStatus, StatusControls, StatusLine } from '../components/Presence.jsx';
import { createPost, openDirect, stalk, unstalk } from '../data/api.js';
import { notifyProfileLike, notifyStalk } from '../data/notifications.js';
import { acceptBuddy, askBuddy, cancelBuddyRequest, getProfile, watchPresence } from '../data/profile.js';
import { useSession } from '../data/session.jsx';
import { db } from '../lib/firebase.js';
import { bannerVideo, cropStyle, frontRadius, posterSlice } from '../lib/profileShapes.js';
import './Profile.css';

// /u/<username> or /people/<uid>: someone's profile with everything the app
// shows on it (components/profile/ProfilePage.jsx there), except the app's
// own colours. Profiles need an account to see, as in the app.
export function profileLoader({ params }) {
  return getProfile(params.uid ? { uid: params.uid } : { name: params.name });
}

export const profileLink = (username) => `/u/${encodeURIComponent(username)}`;

export default function Profile() {
  const data = useLoaderData();
  if (data.signedOut) return <SignedOutProfile name={data.name} />;
  return <ProfileView key={data.profile.uid} {...data} />;
}

function SignedOutProfile({ name }) {
  const { signIn } = useSession();
  return (
    <div className="card profile-locked">
      <Icon name="user" size={24} />
      <h1>{name ? `@${name} is on Mimyne` : 'Someone on Mimyne'}</h1>
      <p className="muted">Sign in to see their profile, stalk them or send them a message.</p>
      <Button variant="primary" onClick={signIn}>
        Sign in
      </Button>
    </div>
  );
}

function ProfileView({ profile, page, hidden, posts: loaded, songs, showcase, stalkers, stalking: wasStalking, buddy: buddyAt }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [posts, setPosts] = useState(loaded);
  const [stalking, setStalking] = useState(wasStalking);
  const [count, setCount] = useState(stalkers);
  const [buddy, setBuddy] = useState(buddyAt);
  const [busy, setBusy] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState('profile');
  const [presence, setPresence] = useState({ listening: null, playing: null });
  const [error, setError] = useState(null);
  const mine = user.uid === profile.uid;
  const background = !hidden && page?.background;

  useEffect(() => watchPresence(profile.uid, setPresence), [profile.uid]);

  async function run(label, work) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "That wasn't allowed." : err.message);
    } finally {
      setBusy(null);
    }
  }

  const toggleStalk = () =>
    run('stalk', async () => {
      if (stalking) {
        await unstalk(user.uid, profile.uid);
        setCount((n) => (n == null ? n : n - 1));
      } else {
        await stalk(user.uid, profile.uid);
        notifyStalk(user.uid, profile.uid);
        setCount((n) => (n == null ? n : n + 1));
      }
      setStalking(!stalking);
    });

  const buddyAction = () =>
    run('buddy', async () => {
      if (buddy === 'asked-you') {
        await acceptBuddy(user.uid, profile.uid);
        setBuddy('buddies');
      } else if (buddy === 'asked') {
        await cancelBuddyRequest(user.uid, profile.uid);
        setBuddy('none');
      } else if (buddy === 'none') {
        await askBuddy(user.uid, profile.uid);
        setBuddy('asked');
      }
    });

  const message = () => run('message', async () => navigate(`/messages/${await openDirect(user.uid, profile.uid)}`));

  async function post({ text, files }) {
    const created = await createPost({ profileUid: user.uid }, { me: user, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  const joined = profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;

  return (
    <div className={`profile ${background ? 'profile--backdrop' : ''}`}>
      {/* Their page background fills the screen behind the profile, the way a
          Steam profile's does, framed the way its owner framed it. */}
      {background && (
        <div className="profile__backdrop" aria-hidden="true">
          {bannerVideo(page.background) ? (
            <video src={page.background} autoPlay loop muted playsInline style={cropStyle(page.backgroundCrop)} />
          ) : (
            <img src={page.background} alt="" referrerPolicy="no-referrer" style={cropStyle(page.backgroundCrop)} />
          )}
          <div className="profile__backdrop-shade" />
        </div>
      )}

      <div className="profile__banner">
        {page?.banner && !hidden ? (
          bannerVideo(page.banner) ? (
            <video src={page.banner} autoPlay loop muted playsInline />
          ) : (
            <img src={page.banner} alt="" referrerPolicy="no-referrer" />
          )
        ) : null}
        <div className="profile__banner-shade" />
      </div>

      <div className="profile__identity">
        <span className="profile__avatar">
          <AvatarWithStatus person={profile} size={104} />
        </span>
        <div className="profile__names">
          <h1 className="profile__name">{profile.displayName || profile.username}</h1>
          <div className="profile__meta">
            <span>@{profile.username}</span>
            {!hidden && page?.discord && <DiscordChips show={page.discord} />}
            {joined && <span className="profile__since">Member since {joined}</span>}
            {count > 0 && <span className={stalking ? 'profile__stalkers is-mine' : 'profile__stalkers'}>{count} {count === 1 ? 'stalker' : 'stalkers'}</span>}
            {!hidden && <ProfileVotes uid={profile.uid} mine={mine} />}
          </div>
          {!hidden && <StatusLine uid={profile.uid} />}
        </div>
        <div className="profile__actions">
          <Button icon="share" iconOnly aria-label="Share this profile" onClick={() => setSharing(true)} />
          {!mine && (
            <>
              <Button icon="message" onClick={message} loading={busy === 'message'}>
                Message
              </Button>
              {buddy === 'buddies' ? (
                <Button variant="secondary" selected disabled>
                  Buddies
                </Button>
              ) : (
                <Button variant="secondary" loading={busy === 'buddy'} onClick={buddyAction} title={buddy === 'asked' ? 'Take the request back' : undefined}>
                  {buddy === 'asked-you' ? 'Accept buddy request' : buddy === 'asked' ? 'Buddy request sent' : 'Add buddy'}
                </Button>
              )}
              <Button
                variant={stalking ? 'secondary' : 'primary'}
                selected={stalking}
                loading={busy === 'stalk'}
                title={stalking ? 'Stop stalking them' : 'Follow everything they put up. They are told.'}
                onClick={toggleStalk}
              >
                {stalking ? 'Stalking' : 'Stalk'}
              </Button>
            </>
          )}
        </div>
      </div>
      {!hidden && page?.bio && <p className="profile__bio">{page.bio}</p>}
      {error && <p className="form-error profile__error" role="alert">{error}</p>}

      {hidden ? (
        <div className="profile__empty card">
          <Icon name="lock" size={20} />
          <p>@{profile.username} shares their profile with buddies only.</p>
        </div>
      ) : view === 'clips' && page?.medal ? (
        <div className="profile__single">
          <MedalClipsPage uid={profile.uid} medal={page.medal} onBack={() => setView('profile')} />
        </div>
      ) : (
        <div className="frame profile__frame">
          <div className="frame__main">
            {showcase.length > 0 && (
              <section className="profile__section" aria-label="Workspaces">
                <span className="label">Workspaces</span>
                <div className="bubbles">
                  {showcase.map((card) => (
                    <WorkspaceBubble key={card.workspaceId} card={card} ownerUid={profile.uid} mine={mine} />
                  ))}
                </div>
                <p className="muted profile__hint">Workspaces open in the Mimyne app.</p>
              </section>
            )}

            {page?.medal && <MedalClips uid={profile.uid} medal={page.medal} onOpenAll={() => setView('clips')} />}

            <section className="profile__section" aria-label="Posts">
              <span className="label">Posts</span>
              {mine && <Composer placeholder="Post to your profile" onSubmit={post} />}
              {posts.length === 0 ? (
                <p className="muted profile__none">{mine ? 'Nothing posted to your profile yet.' : 'Nothing posted yet.'}</p>
              ) : (
                posts.map((p) => <PostCard key={p.id} post={p} onDeleted={() => revalidator.revalidate()} />)
              )}
            </section>
          </div>

          <aside className="frame__side">
            {mine && <StatusControls />}
            {(presence.playing || presence.listening) && (
              <section className="profile__section" aria-label="Right now">
                {presence.playing && (
                  <span className="profile__playing">
                    <span className="muted">Playing</span> {presence.playing.name}
                    {presence.playing.source === 'steam' && <span className="muted"> on Steam</span>}
                  </span>
                )}
                {presence.listening && <NowPlayingCard listening={presence.listening} style={page?.visualizer || 'bars'} />}
              </section>
            )}
            {songs.length > 0 && <SongsPlayer songs={songs} ownerUid={profile.uid} />}
            {page?.note && (
              <section className="profile__section" aria-label="Pinned note">
                <span className="label">Pinned note</span>
                <p className="profile__note">{page.note}</p>
              </section>
            )}
            {mine && page?.visibility === 'friends' && <p className="muted profile__hint">Only your buddies can see your profile.</p>}
          </aside>
        </div>
      )}

      {sharing && (
        <ShareDialog
          title={mine ? 'Share your profile' : `Share @${profile.username}`}
          link={profileLink(profile.username)}
          payload={{ profileUid: profile.uid }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

/** Approving the profile itself, as in the app. Approvals tell them; disapprovals don't. */
function ProfileVotes({ uid, mine }) {
  const { user } = useSession();
  const votes = useVotes(doc(db, 'profile_pages', uid), {
    onVoted: (vote) => vote === 'up' && notifyProfileLike(user.uid, uid, 'profile', uid),
  });
  return <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} disabled={mine} />;
}

/**
 * What they brought from Discord: their server tag (with its badge) and
 * their Discord username, which copies on a click.
 */
function DiscordChips({ show }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(show.username);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Nothing to copy into.
    }
  }
  return (
    <>
      {show.tag && (
        <span className="chip" title="Server tag, from Discord">
          {show.badge && <img src={show.badge} alt="" referrerPolicy="no-referrer" />}
          <strong>{show.tag}</strong>
        </span>
      )}
      {show.username && (
        <button type="button" className="chip chip--button" onClick={copy} title="Discord username. Click to copy it.">
          <span className="muted">Discord</span> {copied ? 'Copied' : show.username}
        </button>
      )}
    </>
  );
}

/** A workspace they show, wearing its front, as the app draws it. */
function WorkspaceBubble({ card, ownerUid, mine }) {
  const { user } = useSession();
  const round = card.shape === 'circle';
  const slice = posterSlice(card.poster);
  const votes = useVotes(doc(db, 'profile_pages', ownerUid, 'showcase', card.workspaceId), {
    onVoted: (vote) => vote === 'up' && notifyProfileLike(user.uid, ownerUid, 'workspace', card.workspaceId),
  });
  return (
    <div className="bubble-wrap">
      <div
        className="bubble"
        title={`${card.title} (opens in the Mimyne app)`}
        style={{
          height: round ? 150 : 190,
          borderRadius: frontRadius(card.shape),
          borderColor: card.glow || 'var(--border-2)',
          boxShadow: card.glow ? `0 0 24px ${card.glow}55, inset 0 0 16px ${card.glow}33` : 'none',
        }}
      >
        {card.image && (
          <img
            src={card.image}
            alt=""
            referrerPolicy="no-referrer"
            className={slice ? 'bubble__poster' : undefined}
            style={slice ? { ...slice, maxWidth: 'none' } : cropStyle(card.crop)}
          />
        )}
        <span className="bubble__shade" />
        <span className="bubble__name" style={{ bottom: round || card.shape === 'pill' ? 14 : 8 }}>
          {card.title}
        </span>
      </div>
      <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} disabled={mine} />
    </div>
  );
}
