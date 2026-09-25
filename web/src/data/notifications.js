// Notices: the same inbox, ids and wording as the app
// (src/runtime/notifications.js there), so a notice sent from the website
// shows in the app's bell and its Windows pop-ups too, and the other way
// round. Each notice is only allowed for something its sender really did;
// the rules check (firestore.rules, "notifications").
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';

export const NOTICE_TYPES = ['view', 'like', 'comment', 'friend_request', 'friend_accept', 'stalk', 'invite'];
const INBOX_LIMIT = 50;

const inbox = (uid) => collection(db, 'notifications', uid, 'items');
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const stamp = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : null);

export function cleanNotice(id, data) {
  if (!data || !NOTICE_TYPES.includes(data.type)) return null;
  const fromUid = text(data.fromUid, 128);
  if (!fromUid) return null;
  return {
    id,
    type: data.type,
    fromUid,
    read: data.read === true,
    at: stamp(data.createdAt),
    target: text(data.target, 20) || null,
    targetId: text(data.targetId, 200) || null,
    workspaceId: text(data.workspaceId, 200) || null,
    workspaceName: text(data.workspaceName, 120),
    hubId: text(data.hubId, 32) || null,
    ownerUid: text(data.ownerUid, 128) || null,
    postId: text(data.postId, 128) || null,
    commentId: text(data.commentId, 128) || null,
    parentId: text(data.parentId, 128) || null,
    vote: data.vote === 'down' ? 'down' : data.vote === 'up' ? 'up' : null,
    text: text(data.text, 4000),
  };
}

const quote = (value, max = 80) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
};

/** What a notice says after its sender's name, as the app says it. */
export function describeNotice(notice) {
  switch (notice?.type) {
    case 'view':
      return 'viewed your profile';
    case 'like': {
      const voted = notice.vote === 'down' ? 'disapproved' : 'approved';
      if (notice.target === 'hub_post' || notice.target === 'profile_post') return `${voted} your post`;
      if (notice.target === 'hub_comment' || notice.target === 'post_comment') return `${voted} your comment`;
      if (notice.target === 'profile') return 'liked your profile';
      if (notice.target === 'song') return 'liked a song on your profile';
      if (notice.target === 'workspace') return 'liked one of your workspaces';
      return 'liked your comment';
    }
    case 'comment':
      if (notice.postId) return `${notice.parentId ? 'replied to your comment' : 'commented on your post'}: "${quote(notice.text)}"`;
      return `commented${notice.workspaceName ? ` in ${quote(notice.workspaceName, 40)}` : ''}: "${quote(notice.text)}"`;
    case 'friend_request':
      return 'sent you a buddy request';
    case 'friend_accept':
      return 'accepted your buddy request';
    case 'stalk':
      return 'is stalking you';
    case 'invite':
      return `invited you to ${quote(notice.workspaceName || 'a workspace', 60)}`;
    default:
      return '';
  }
}

/** Where opening a notice goes on the site. */
export function noticeLink(notice) {
  const postId = notice.target === 'hub_post' || notice.target === 'profile_post' ? notice.targetId : notice.postId;
  if (postId && notice.hubId) return `/h/${notice.hubId}/p/${postId}`;
  if (postId && notice.ownerUid) return `/people/${notice.ownerUid}/p/${postId}`;
  return `/people/${notice.fromUid}`;
}

export function watchInbox(uid, onChange) {
  return onSnapshot(
    query(inbox(uid), orderBy('createdAt', 'desc'), limit(INBOX_LIMIT)),
    (snap) => onChange(snap.docs.map((d) => cleanNotice(d.id, d.data({ serverTimestamps: 'estimate' }))).filter(Boolean)),
    () => onChange([]),
  );
}

export function markRead(uid, id) {
  return updateDoc(doc(inbox(uid), id), { read: true });
}

export function markAllRead(uid, notices) {
  const batch = writeBatch(db);
  for (const n of notices) if (!n.read) batch.update(doc(inbox(uid), n.id), { read: true });
  return batch.commit();
}

export function removeNotice(uid, id) {
  return deleteDoc(doc(inbox(uid), id));
}

// Sending never gets in the way of what it's about: the same notice again
// within the hour, or to someone who blocked you, is refused quietly.
function send(me, to, id, record) {
  if (!me || !to || me === to) return Promise.resolve();
  return setDoc(doc(inbox(to), id), { ...record, fromUid: me, read: false, createdAt: serverTimestamp() }).catch(() => {});
}

/**
 * A vote on a post or comment, told to its author. `scope` is where the post
 * is ({hubId} or {profileUid}); `commentId` when it's on a comment.
 */
export function notifyVote(me, { scope, postId, commentId, authorUid, vote }) {
  if (!vote) return Promise.resolve();
  const onComment = !!commentId;
  const target = scope.hubId ? (onComment ? 'hub_comment' : 'hub_post') : (onComment ? 'post_comment' : 'profile_post');
  const targetId = onComment ? commentId : postId;
  const where = scope.hubId
    ? { hubId: scope.hubId, ...(onComment ? { postId } : {}) }
    : { ownerUid: scope.profileUid, ...(onComment ? { postId } : {}) };
  return send(me, authorUid, `like__${target}__${targetId}__${me}`, { type: 'like', target, targetId, ...where, vote });
}

/** A comment, told to the post's author, or a reply to the comment's author. */
export function notifyComment(me, { scope, postId, commentId, parentId, text: words, toUid }) {
  const place = scope.hubId ? { hubId: scope.hubId } : { ownerUid: scope.profileUid };
  const key = scope.hubId ? `h_${scope.hubId}` : `p_${scope.profileUid}`;
  return send(me, toUid, `comment__${key}__${postId}__${commentId}`, {
    type: 'comment', ...place, postId, commentId, ...(parentId ? { parentId } : {}), ...(words ? { text: words } : {}),
  });
}

export function notifyStalk(me, uid) {
  return send(me, uid, `stalk__${me}`, { type: 'stalk' });
}

export function notifyBuddyRequest(me, uid) {
  return send(me, uid, `friend_request__${me}`, { type: 'friend_request' });
}

export function notifyBuddyAccept(me, uid) {
  return send(me, uid, `friend_accept__${me}`, { type: 'friend_accept' });
}

/**
 * An approval of something on a profile the app has had longer than the
 * website: the profile itself, a workspace on it (target 'workspace'), a
 * song. These carry no vote, and the app only tells approvals, never
 * disapprovals, so neither does this.
 */
export function notifyProfileLike(me, uid, target, targetId) {
  return send(me, uid, `like__${target}__${targetId}__${me}`, { type: 'like', target, targetId });
}
