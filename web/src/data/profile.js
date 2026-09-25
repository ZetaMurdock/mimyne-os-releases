// Someone's profile, everything on it the app shows: their card, their page
// (banner, background, bio, pinned note, Medal, Discord chips), songs,
// workspaces, what they're doing right now, stalkers and buddies, and their
// posts. The rules decide what each viewer may read (firestore.rules,
// "profile pages"); a page shared with buddies only reads as hidden.
import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { authReady, db } from '../lib/firebase.js';
import {
  cleanClipComment, cleanPresence, cleanProfilePage, cleanShowcaseCard, cleanSong, MAX_CLIP_COMMENT_CHARS, safePicture,
} from '../lib/profileShapes.js';
import { amStalking, cleanPost, countStalkers, notFound, postsOf, readOrMissing } from './api.js';
import { cleanProfile, lookupUsername } from './identity.js';
import { notifyBuddyAccept, notifyBuddyRequest } from './notifications.js';

const stamp = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : null);

export async function getProfile({ uid, name }) {
  const user = await authReady;
  if (!user) return { signedOut: true, name: name ?? null };
  const id = uid ?? (await lookupUsername(name));
  if (!id) notFound();
  const cardSnap = await getDoc(doc(db, 'profiles', id)).catch(() => null);
  const card = cardSnap?.exists() ? cleanProfile(id, cardSnap.data()) : null;
  if (!card) notFound();
  const raw = cardSnap.data();
  const me = user.uid;

  // Whether their posts can be read says whether the profile is open to
  // you: an account that never set up its page is open to everyone, and its
  // page document simply isn't there to read.
  const [pageSnap, posts, songs, showcase, stalkers, stalking, buddy, votes] = await Promise.all([
    readOrMissing(doc(db, 'profile_pages', id)),
    getDocs(query(postsOf({ profileUid: id }), orderBy('createdAt', 'desc'), limit(30)))
      .then((snap) => snap.docs.map((d) => cleanPost({ profileUid: id }, d.id, d.data())))
      .catch((error) => (error?.code === 'permission-denied' ? null : Promise.reject(error))),
    getDocs(collection(db, 'profile_pages', id, 'songs'))
      .then((snap) => snap.docs.map((d) => cleanSong(d.id, d.data())).filter(Boolean).sort((a, b) => a.order - b.order))
      .catch(() => []),
    getDocs(collection(db, 'profile_pages', id, 'showcase'))
      .then((snap) => snap.docs.map((d) => cleanShowcaseCard(d.id, d.data())).filter(Boolean)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)))
      .catch(() => []),
    countStalkers(id),
    id === me ? false : amStalking(me, id),
    id === me ? null : buddyState(me, id),
    profileVotes(id),
  ]);
  const page = pageSnap ? cleanProfilePage(pageSnap.data()) : null;
  // Their chosen picture lives on the public card; a page saved before that
  // still carries its own copy, and the sign-in photo is the last resort.
  const picture = safePicture(raw.avatar, 200000) || page?.avatar || card.picture || null;
  return {
    profile: {
      ...card,
      picture,
      joinedAt: stamp(raw.joinedAt) ?? stamp(raw.usernameChangedAt),
    },
    page,
    hidden: posts === null,
    posts: posts ?? [],
    songs,
    showcase,
    stalkers,
    stalking,
    buddy,
    votes,
  };
}

/**
 * How the profile itself has been voted: approvals and disapprovals. An
 * approval written by the app has no vote field; only disapprovals say 'down'.
 */
async function profileVotes(uid) {
  try {
    const likes = collection(db, 'profile_pages', uid, 'likes');
    const [all, down] = await Promise.all([
      getCountFromServer(likes).then((s) => s.data().count),
      getCountFromServer(query(likes, where('vote', '==', 'down'))).then((s) => s.data().count),
    ]);
    return { up: all - down, down };
  } catch {
    return { up: 0, down: 0 };
  }
}

// ------------------------------------------------------------ right now

/** What they're playing or listening to, live. Nothing when it's not for you. */
export function watchPresence(uid, onChange) {
  return onSnapshot(
    doc(db, 'presence', uid),
    (snap) => onChange(cleanPresence(snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null)),
    () => onChange(cleanPresence(null)),
  );
}

// -------------------------------------------------------------- buddies

const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

/** 'buddies', 'asked' (you asked them), 'asked-you', or 'none'. */
async function buddyState(me, uid) {
  const [friends, mine, theirs] = await Promise.all([
    getDocs(query(collection(db, 'friendships'), where('users', 'array-contains', me))).catch(() => ({ docs: [] })),
    getDocs(query(collection(db, 'friend_requests'), where('from', '==', me), where('to', '==', uid))).catch(() => ({ empty: true })),
    getDocs(query(collection(db, 'friend_requests'), where('from', '==', uid), where('to', '==', me))).catch(() => ({ empty: true })),
  ]);
  if (friends.docs.some((d) => d.id === pairId(me, uid))) return 'buddies';
  if (!theirs.empty) return 'asked-you';
  if (!mine.empty) return 'asked';
  return 'none';
}

export async function askBuddy(me, uid) {
  await setDoc(doc(db, 'friend_requests', `${me}__${uid}`), { from: me, to: uid, createdAt: serverTimestamp() });
  notifyBuddyRequest(me, uid);
}

export async function acceptBuddy(me, uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'friendships', pairId(me, uid)), { users: [me, uid].sort(), since: serverTimestamp() });
  batch.delete(doc(db, 'friend_requests', `${uid}__${me}`));
  await batch.commit();
  notifyBuddyAccept(me, uid);
}

export function cancelBuddyRequest(me, uid) {
  return deleteDoc(doc(db, 'friend_requests', `${me}__${uid}`));
}

// --------------------------------------------------- clip comments (Medal)

export function watchClipComments(uid, clipId, onChange) {
  return onSnapshot(
    query(collection(db, 'profile_pages', uid, 'clips', clipId, 'comments'), orderBy('createdAt', 'asc'), limit(100)),
    (snap) => onChange(snap.docs.map((d) => cleanClipComment(d.id, d.data())).filter(Boolean)),
    () => onChange([]),
  );
}

export function addClipComment(me, uid, clipId, body) {
  const trimmed = String(body || '').trim().slice(0, MAX_CLIP_COMMENT_CHARS);
  if (!trimmed) throw new Error('Say something first.');
  return addDoc(collection(db, 'profile_pages', uid, 'clips', clipId, 'comments'), { authorUid: me, text: trimmed, createdAt: serverTimestamp() });
}

export function removeClipComment(uid, clipId, commentId) {
  return deleteDoc(doc(db, 'profile_pages', uid, 'clips', clipId, 'comments', commentId));
}
