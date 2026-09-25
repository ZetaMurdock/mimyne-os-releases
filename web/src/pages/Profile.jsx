import { useState } from 'react';
import { useLoaderData, useNavigate, useRevalidator } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import { createPost, getProfile, openDirect, stalk, unstalk } from '../data/api.js';
import { notifyStalk } from '../data/notifications.js';
import { useSession } from '../data/session.jsx';
import './Profile.css';

// /u/<username> or /people/<uid>. Profiles need an account to see, as in
// the app; their posts show to whoever the person lets see their profile.
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

function ProfileView({ profile, hidden, posts: loaded, stalkers, stalking: wasStalking }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [posts, setPosts] = useState(loaded);
  const [stalking, setStalking] = useState(wasStalking);
  const [count, setCount] = useState(stalkers);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState(null);
  const mine = user.uid === profile.uid;

  async function toggleStalk() {
    setBusy(true);
    setError(null);
    try {
      if (stalking) {
        await unstalk(user.uid, profile.uid);
        setCount((n) => (n == null ? n : n - 1));
      } else {
        await stalk(user.uid, profile.uid);
        notifyStalk(user.uid, profile.uid);
        setCount((n) => (n == null ? n : n + 1));
      }
      setStalking(!stalking);
    } catch (err) {
      setError(err.code === 'permission-denied' ? "You can't stalk this person." : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    try {
      navigate(`/messages/${await openDirect(user.uid, profile.uid)}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function post({ text, files }) {
    const created = await createPost({ profileUid: user.uid }, { me: user, body: text, files });
    setPosts((prev) => [created, ...prev]);
  }

  return (
    <div className="profile">
      <div className="profile__banner" style={profile.banner ? { backgroundImage: `url("${profile.banner}")` } : undefined} />
      <div className="profile__identity">
        <span className="profile__avatar">
          <Avatar person={profile} size={104} />
        </span>
        <div className="profile__names">
          <h1 className="profile__name">{profile.displayName || profile.username}</h1>
          <p className="profile__meta">
            @{profile.username}
            {count != null && (
              <>
                {' · '}
                {count} {count === 1 ? 'stalker' : 'stalkers'}
              </>
            )}
          </p>
        </div>
        <div className="profile__actions">
          <Button icon="share" iconOnly aria-label="Share this profile" onClick={() => setSharing(true)} />
          {!mine && (
            <>
              <Button icon="message" onClick={message}>
                Message
              </Button>
              <Button
                variant={stalking ? 'secondary' : 'primary'}
                selected={stalking}
                loading={busy}
                title={stalking ? 'Stop stalking' : 'Follow everything they put up. They are told.'}
                onClick={toggleStalk}
              >
                {stalking ? 'Stalking' : 'Stalk'}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && <p className="form-error profile__error" role="alert">{error}</p>}

      <div className="frame">
        <div className="frame__main">
          {mine && <Composer placeholder="Post to your profile" onSubmit={post} />}
          {hidden ? (
            <div className="profile__empty">
              <p>Only their Buddies can see their profile.</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="profile__empty">
              <p className="muted">{mine ? 'Nothing on your profile yet.' : 'Nothing posted yet.'}</p>
            </div>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} onDeleted={() => revalidator.revalidate()} />)
          )}
        </div>
        <aside className="frame__side">
          {(profile.bio || profile.note) && (
            <section className="card side-card">
              {profile.note && <p className="profile__note">{profile.note}</p>}
              {profile.bio && <p className="muted profile__bio">{profile.bio}</p>}
            </section>
          )}
        </aside>
      </div>

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
