import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import { getHubCard, getPostCard, postUrl } from '../data/api.js';
import { lookupUsername } from '../data/identity.js';
import { usePerson } from '../data/people.js';
import { linkTarget } from '../lib/share.js';
import './ShareCards.css';

// Cards for things passed on in Mimyne: a shared post, a profile, a Hub, or a
// link to one of them. Used in messages, posts and comments.

// A post someone passed on: a small card that opens it.
export function SharedPost({ post }) {
  const [card, setCard] = useState(undefined);
  useEffect(() => {
    let live = true;
    getPostCard(post).then((c) => live && setCard(c)).catch(() => live && setCard(null));
    return () => {
      live = false;
    };
  }, [post.postId, post.hubId, post.profileUid]);
  const author = usePerson(card?.authorUid, card?.authorName);
  if (card === undefined) return <div className="msg--card msg__shared muted">Loading post…</div>;
  if (!card) return <div className="msg--card msg__shared muted">This post isn't there any more.</div>;
  return (
    <Link to={postUrl(card)} className="msg--card msg__shared">
      <span className="msg__shared-kind">
        <Mark /> Post by {author.name}
      </span>
      {card.title && <strong>{card.title}</strong>}
      {card.body && <span className="msg__shared-body">{card.body}</span>}
      {card.files.length > 0 && <span className="muted">📎 {card.files.length === 1 ? card.files[0].name : `${card.files.length} files`}</span>}
    </Link>
  );
}

// Mimyne's mark on anything passed on.
export const Mark = () => <img src="/logo.png" alt="" className="msg__mark" aria-hidden="true" />;

/** A link to a Hub, post or profile on mimyne.com, as a small card of what it is. */
export function LinkBubble({ path }) {
  const target = linkTarget(path);
  if (!target) return null;
  if (target.kind === 'post') return <SharedPost post={target} />;
  if (target.kind === 'profile') return target.uid ? <SharedProfile uid={target.uid} /> : <NamedProfile name={target.name} />;
  return <SharedHub hubId={target.hubId} />;
}

function NamedProfile({ name }) {
  const [uid, setUid] = useState(undefined);
  useEffect(() => {
    lookupUsername(name).then(setUid).catch(() => setUid(null));
  }, [name]);
  if (uid === undefined) return null;
  if (!uid) return null;
  return <SharedProfile uid={uid} />;
}

function SharedHub({ hubId }) {
  const [hub, setHub] = useState(undefined);
  useEffect(() => {
    getHubCard(hubId).then(setHub).catch(() => setHub(null));
  }, [hubId]);
  if (!hub) return null;
  return (
    <Link to={`/h/${hub.id}`} className="msg--card msg__profile">
      <HubIcon hub={hub} size={40} />
      <span className="msg__shared-text">
        <strong>{hub.name}</strong>
        <span className="muted">{hub.tagline || 'A Hub on Mimyne'}</span>
      </span>
      <Mark />
    </Link>
  );
}

// A profile someone passed on.
export function SharedProfile({ uid }) {
  const person = usePerson(uid);
  return (
    <Link to={`/people/${uid}`} className="msg--card msg__profile">
      <Avatar person={person} size={40} />
      <span className="msg__shared-text">
        <strong>{person.name}</strong>
        <span className="muted">@{person.username} · Profile on Mimyne</span>
      </span>
      <Mark />
    </Link>
  );
}
