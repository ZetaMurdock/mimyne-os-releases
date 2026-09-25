// Everything the site reads and writes, against the same Firestore as the
// app. The rules in the app's repo (firestore.rules, "hubs" and "messages")
// decide who may do what; this file only asks.
import {
  addDoc, arrayRemove, arrayUnion, collection, collectionGroup, deleteDoc, doc, getCountFromServer, getDoc, getDocs,
  limit, limitToLast, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  writeBatch,
} from 'firebase/firestore';
import { auth, authReady, db } from '../lib/firebase.js';

// ------------------------------------------------------------------ shapes

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const millis = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Date.now());
const hex = (value, fallback) => (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback);

export const HUB_COLORS = ['#7C3AED', '#2563EB', '#0F766E', '#B45309', '#BE185D', '#3F3F46'];

function cleanHub(id, data) {
  if (!data) return null;
  return {
    id,
    name: text(data.name, 60) || id,
    tagline: text(data.tagline, 140),
    tag: text(data.tag, 30),
    color: hex(data.color, '#3F3F46'),
    visibility: data.visibility === 'private' ? 'private' : 'public',
    postingPolicy: data.postingPolicy === 'pledged' ? 'pledged' : 'signed-in',
    rules: text(data.rules, 3000),
    ownerId: text(data.ownerId, 128),
  };
}

export function cleanFiles(files) {
  return (Array.isArray(files) ? files : [])
    .filter((f) => f && typeof f.path === 'string' && typeof f.name === 'string')
    .map((f) => ({ name: text(f.name, 200), size: Number(f.size) || 0, type: text(f.type, 100), path: f.path, display: f.display !== false }));
}

export function cleanPost(scope, id, data) {
  return {
    id,
    scope,
    authorUid: text(data.authorUid, 128),
    authorName: text(data.authorName, 20),
    title: text(data.title, 300),
    body: text(data.body, 40000),
    files: cleanFiles(data.files),
    embedHubId: text(data.embedHubId, 32) || null,
    at: millis(data.createdAt),
    edited: !!data.editedAt,
  };
}

function cleanComment(id, data) {
  return {
    id,
    authorUid: text(data.authorUid, 128),
    authorName: text(data.authorName, 20),
    text: text(data.text, 10000),
    parentId: text(data.parentId, 128) || null,
    files: cleanFiles(data.files),
    at: millis(data.createdAt),
    replies: [],
  };
}

function withoutEmpty(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
}

export function notFound() {
  throw new Response('Not found', { status: 404 });
}

// A read the rules refuse (a private Hub, a profile that isn't shared with
// you) looks the same to a visitor as one that doesn't exist.
export async function readOrMissing(ref) {
  try {
    const snap = await getDoc(ref);
    return snap.exists() ? snap : null;
  } catch (error) {
    if (error?.code === 'permission-denied') return null;
    throw error;
  }
}

// --------------------------------------------------------------- where

/** A post lives on a Hub's Board or on someone's profile. */
export const postsOf = (scope) =>
  scope.hubId ? collection(db, 'hubs', scope.hubId, 'posts') : collection(db, 'profile_pages', scope.profileUid, 'posts');
export const postRef = (scope, id) => doc(postsOf(scope), id);
export const postUrl = (post) =>
  post.scope.hubId ? `/h/${post.scope.hubId}/p/${post.id}` : `/people/${post.scope.profileUid}/p/${post.id}`;

// ------------------------------------------------------------------- hubs

export function hubAddressProblem(id) {
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(id)) {
    return 'Use 3 to 32 lowercase letters, numbers and dashes, starting and ending with a letter or number.';
  }
  return null;
}

export async function getHub(hubId) {
  await authReady;
  const snap = await readOrMissing(doc(db, 'hubs', hubId));
  if (!snap) notFound();
  const hub = cleanHub(hubId, snap.data());
  const [roles, members, posts] = await Promise.all([
    getDocs(collection(db, 'hubs', hubId, 'roles')),
    getDocs(query(collection(db, 'hubs', hubId, 'members'), limit(500))),
    listPosts({ hubId }, 30),
  ]);
  return {
    hub,
    roles: roles.docs
      .map((d) => ({ id: d.id, name: text(d.data().name, 24), color: hex(d.data().color, '#F4F4F5'), level: d.data().level, order: d.data().order ?? 0 }))
      .sort((a, b) => a.order - b.order),
    members: members.docs.map((d) => ({ uid: d.id, name: text(d.data().name, 20), role: text(d.data().role, 40), level: d.data().level })),
    posts,
  };
}

export async function getHubCard(hubId) {
  const snap = await readOrMissing(doc(db, 'hubs', hubId));
  return snap ? cleanHub(hubId, snap.data()) : null;
}

export async function getHubCards(ids) {
  return (await Promise.all(ids.map(getHubCard))).filter(Boolean);
}

export async function discoverHubs(count = 12) {
  const snap = await getDocs(query(collection(db, 'hubs'), where('visibility', '==', 'public'), limit(count)));
  return snap.docs.map((d) => cleanHub(d.id, d.data()));
}

/**
 * A new Hub, in the one batch the rules ask for: the Hub, its first roles,
 * and its owner's own pledge.
 */
const FIRST_ROOM = (uid) => ({
  name: 'General', tag: 'general', topic: 'Say hi.', kind: 'chat', order: 0, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

export async function createHub({ id, name, tagline, tag, color, visibility, postingPolicy, rules }, me) {
  const problem = hubAddressProblem(id);
  if (problem) throw new Error(problem);
  const batch = writeBatch(db);
  batch.set(doc(db, 'hubs', id), withoutEmpty({
    name: name.trim(), tagline: tagline?.trim(), tag: tag?.trim(), color, visibility, postingPolicy,
    rules: rules?.trim(), ownerId: me.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  batch.set(doc(db, 'hubs', id, 'roles', 'owner'), { name: 'Owner', color: '#F2B84B', level: 'owner', order: 0 });
  batch.set(doc(db, 'hubs', id, 'roles', 'mod'), { name: 'Mod', color: '#C4B5FD', level: 'mod', order: 1 });
  batch.set(doc(db, 'hubs', id, 'roles', 'member'), { name: 'Member', color: '#F4F4F5', level: 'member', order: 2 });
  batch.set(doc(db, 'hubs', id, 'members', me.uid), { role: 'owner', level: 'owner', uid: me.uid, name: me.username, joinedAt: serverTimestamp() });
  // Its first Room, for the chat.
  batch.set(doc(db, 'hubs', id, 'rooms', 'general'), FIRST_ROOM(me.uid));
  try {
    await batch.commit();
    noteHub(me.uid, id, true);
  } catch (error) {
    if (error?.code === 'permission-denied') {
      // A taken address and a refused Hub look the same from here.
      console.error('Starting a Hub was refused', error);
      throw new Error("That address may be taken, or Mimyne couldn't start the Hub. Try another address.");
    }
    throw error;
  }
  return id;
}

export async function pledge(hubId, me) {
  // Already pledged (the list of your Hubs may not have caught up): done.
  const mine = await getDoc(doc(db, 'hubs', hubId, 'members', me.uid)).catch(() => null);
  if (mine?.exists()) {
    noteHub(me.uid, hubId, true);
    return;
  }
  const roles = await getDocs(query(collection(db, 'hubs', hubId, 'roles'), where('level', '==', 'member'), limit(1)));
  if (roles.empty) throw new Error('This Hub has no member role to pledge into.');
  await setDoc(doc(db, 'hubs', hubId, 'members', me.uid), {
    role: roles.docs[0].id, level: 'member', uid: me.uid, name: me.username, joinedAt: serverTimestamp(),
  });
  noteHub(me.uid, hubId, true);
}

export async function unpledge(hubId, uid) {
  await deleteDoc(doc(db, 'hubs', hubId, 'members', uid));
  noteHub(uid, hubId, false);
}

// ------------------------------------------------------- your Hubs, listed

/**
 * Your own list of the Hubs you pledged to (pledge_lists/<uid>), kept as you
 * pledge, leave and start Hubs, so the notch and feed have it after a
 * refresh whether or not the collection-group query (and its index) works.
 */
export function noteHub(uid, hubId, pledged) {
  return setDoc(doc(db, 'pledge_lists', uid), {
    hubs: pledged ? arrayUnion(hubId) : arrayRemove(hubId),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch(() => {});
}

function setHubList(uid, ids) {
  return setDoc(doc(db, 'pledge_lists', uid), { hubs: ids.slice(0, 500), updatedAt: serverTimestamp() }).catch(() => {});
}

const cleanIds = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && /^[a-z0-9-]{3,32}$/.test(id)) : []);

/** Public Hubs you own: found by owner, no collection-group index needed. */
async function ownedHubs(uid) {
  const snap = await getDocs(query(collection(db, 'hubs'), where('ownerId', '==', uid), where('visibility', '==', 'public'))).catch(() => ({ docs: [] }));
  return snap.docs.map((d) => d.id);
}

/**
 * The Hubs you pledged to, live, from everything that knows: your own list,
 * the Hubs you own, and the collection-group query on pledges. When the
 * query works it's the truth, and your list is set to match it.
 */
export function watchMyPledges(uid, onChange) {
  let listed = [];
  let owned = [];
  let found = null; // null: the query hasn't answered (or can't)
  const emit = () => onChange([...new Set([...(found ?? listed), ...owned])]);

  ownedHubs(uid).then((ids) => {
    owned = ids;
    emit();
  });
  const stopList = onSnapshot(
    doc(db, 'pledge_lists', uid),
    (snap) => {
      listed = cleanIds(snap.exists() ? snap.data().hubs : []);
      emit();
    },
    () => {},
  );
  const stopQuery = onSnapshot(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
    (snap) => {
      found = snap.docs.map((d) => d.ref.parent.parent.id);
      const truth = [...new Set([...found, ...owned])].sort();
      if (truth.join() !== [...listed].sort().join()) setHubList(uid, truth);
      emit();
    },
    // Most often the index this needs isn't deployed yet (firestore.indexes.json
    // in the app's repo, deployed by `npm run deploy:rules`). Your own list
    // carries on meanwhile.
    (error) => console.error("Mimyne couldn't list the Hubs you pledged to (your own list is used instead):", error),
  );
  return () => {
    stopList();
    stopQuery();
  };
}

/** The same, once, for the feed. */
export async function myHubIds(uid) {
  const [listSnap, owned, found] = await Promise.all([
    getDoc(doc(db, 'pledge_lists', uid)).catch(() => null),
    ownedHubs(uid),
    getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid))).then((snap) => snap.docs.map((d) => d.ref.parent.parent.id)).catch((error) => {
      console.error("Mimyne couldn't list the Hubs you pledged to (your own list is used instead):", error);
      return null;
    }),
  ]);
  const listed = cleanIds(listSnap?.exists() ? listSnap.data().hubs : []);
  return [...new Set([...(found ?? listed), ...owned])];
}

/** A Hub's roles and who holds them, for role chips beside names. */
export async function getHubPeople(hubId) {
  const [roles, members] = await Promise.all([
    getDocs(collection(db, 'hubs', hubId, 'roles')),
    getDocs(query(collection(db, 'hubs', hubId, 'members'), limit(500))),
  ]);
  return {
    roles: roles.docs.map((d) => ({ id: d.id, name: text(d.data().name, 24), color: hex(d.data().color, '#F4F4F5'), level: d.data().level })),
    members: members.docs.map((d) => ({ uid: d.id, name: text(d.data().name, 20), role: text(d.data().role, 40), level: d.data().level })),
  };
}

// ------------------------------------------------------------------ posts

export async function listPosts(scope, count = 20) {
  try {
    const snap = await getDocs(query(postsOf(scope), orderBy('createdAt', 'desc'), limit(count)));
    return snap.docs.map((d) => cleanPost(scope, d.id, d.data()));
  } catch (error) {
    if (error?.code === 'permission-denied') return [];
    throw error;
  }
}

export async function createPost(scope, { me, title, body, files, embedHubId }) {
  const ref = await addDoc(postsOf(scope), withoutEmpty({
    authorUid: me.uid, authorName: me.username, title: title?.trim(), body: body?.trim(), files, embedHubId,
    createdAt: serverTimestamp(),
  }));
  return cleanPost(scope, ref.id, { authorUid: me.uid, authorName: me.username, title, body, files, embedHubId });
}

export function deletePost(post) {
  return deleteDoc(postRef(post.scope, post.id));
}

export async function getPost(scope, postId) {
  await authReady;
  const snap = await readOrMissing(postRef(scope, postId));
  if (!snap) notFound();
  const [comments, hub] = await Promise.all([
    listComments(scope, postId),
    scope.hubId ? getHubCard(scope.hubId) : null,
  ]);
  return { post: cleanPost(scope, snap.id, snap.data()), comments, hub };
}

// ------------------------------------------------------------- comments

/** A post's comments as a tree: replies under the comment they answer. */
export async function listComments(scope, postId) {
  const snap = await getDocs(query(collection(postRef(scope, postId), 'comments'), orderBy('createdAt', 'asc'), limit(500)));
  const all = snap.docs.map((d) => cleanComment(d.id, d.data()));
  const byId = new Map(all.map((c) => [c.id, c]));
  const top = [];
  for (const c of all) {
    const parent = c.parentId && byId.get(c.parentId);
    (parent ? parent.replies : top).push(c);
  }
  return top;
}

export function addComment(scope, postId, { me, text: words, parentId, files }) {
  return addDoc(collection(postRef(scope, postId), 'comments'), withoutEmpty({
    authorUid: me.uid, authorName: me.username, text: words?.trim(), parentId, files, createdAt: serverTimestamp(),
  }));
}

export function deleteComment(scope, postId, commentId) {
  return deleteDoc(doc(postRef(scope, postId), 'comments', commentId));
}

// ------------------------------------------------------------ approvals

/** Approvals, the viewer's own vote, and how many comments, for a post or comment. */
export async function getStats(ref, uid, { comments = false, views = false } = {}) {
  const likes = collection(ref, 'likes');
  const [approvals, mine, commentCount, viewCount] = await Promise.all([
    // An approval written by the app carries no vote field (only a
    // disapproval says 'down'), so approvals are everything else.
    Promise.all([
      getCountFromServer(likes).then((s) => s.data().count),
      getCountFromServer(query(likes, where('vote', '==', 'down'))).then((s) => s.data().count),
    ]).then(([all, down]) => all - down).catch(() => 0),
    uid ? getDoc(doc(likes, uid)).then((s) => (s.exists() ? s.data().vote ?? 'up' : null)).catch(() => null) : null,
    comments ? getCountFromServer(collection(ref, 'comments')).then((s) => s.data().count).catch(() => 0) : null,
    views ? getCountFromServer(collection(ref, 'views')).then((s) => s.data().count).catch(() => null) : null,
  ]);
  return { approvals, mine, comments: commentCount, views: viewCount };
}

// Posts already counted as seen by this person, this visit.
const seen = new Set();

/** A view, once per person per post: their own document under the post, written once. */
export function recordView(post, uid) {
  const key = `${post.scope.hubId ?? post.scope.profileUid}/${post.id}`;
  if (!uid || seen.has(key)) return;
  seen.add(key);
  setDoc(doc(postRef(post.scope, post.id), 'views', uid), { at: serverTimestamp() }).catch(() => {});
}

/** 'up', 'down', or null to take a vote back. */
export function vote(ref, uid, value) {
  const mine = doc(collection(ref, 'likes'), uid);
  return value ? setDoc(mine, { vote: value, createdAt: serverTimestamp() }) : deleteDoc(mine);
}

// ----------------------------------------------------------------- feed

export async function getBuddies(uid) {
  const snap = await getDocs(query(collection(db, 'friendships'), where('users', 'array-contains', uid)));
  return snap.docs.map((d) => (d.data().users ?? []).find((u) => u !== uid)).filter(Boolean);
}

/**
 * Keeps your buddy list where your buddies can read it (buddy_lists/<uid>),
 * so their feeds can reach your buddies too.
 */
async function shareBuddyList(uid, buddies) {
  await setDoc(doc(db, 'buddy_lists', uid), { buddies: buddies.slice(0, 500), updatedAt: serverTimestamp() }).catch(() => {});
}

/** Your buddies' buddies, as their buddy lists say. */
async function buddiesOfBuddies(uid, buddies) {
  const lists = await Promise.all(buddies.slice(0, 40).map((b) =>
    getDoc(doc(db, 'buddy_lists', b)).then((snap) => (snap.exists() && Array.isArray(snap.data().buddies) ? snap.data().buddies : [])).catch(() => [])));
  const mine = new Set([uid, ...buddies]);
  return [...new Set(lists.flat().filter((id) => typeof id === 'string' && !mine.has(id)))].slice(0, 60);
}

/** Posts in some Hubs, for the feed (also when the list of your Hubs arrives late). */
export async function hubPosts(hubIds, count = 10) {
  const lists = await Promise.all(hubIds.map((hubId) => listPosts({ hubId }, count)));
  return lists.flat().map((p) => ({ ...p, circle: 'hubs' }));
}

/**
 * The feed: your own posts, your buddies', their buddies', people you stalk,
 * the Hubs you pledged to, and what's popular on public Hubs, each tagged
 * with where it came from, with views, approvals and comments to rank by.
 */
export async function getFeed() {
  const user = await authReady;
  if (!user) return { posts: [], discover: [], buddies: [], hubs: [] };
  const uid = user.uid;
  const [pledged, buddies, stalking, publicHubs] = await Promise.all([
    myHubIds(uid),
    getBuddies(uid).catch(() => []),
    listStalking(uid).catch(() => []),
    discoverHubs(12).catch(() => []),
  ]);
  shareBuddyList(uid, buddies);
  const fof = await buddiesOfBuddies(uid, buddies).catch(() => []);
  const popular = publicHubs.filter((h) => !pledged.includes(h.id)).slice(0, 6);

  const people = new Map();
  const put = (id, circle) => !people.has(id) && people.set(id, circle);
  put(uid, 'you');
  buddies.forEach((id) => put(id, 'buddies'));
  stalking.forEach((id) => put(id, 'stalking'));
  fof.forEach((id) => put(id, 'fof'));

  const [personLists, mineHubs, popularLists, hubs] = await Promise.all([
    Promise.all([...people].map(([id, circle]) => listPosts({ profileUid: id }, circle === 'fof' ? 4 : 8).then((l) => l.map((p) => ({ ...p, circle }))))),
    hubPosts(pledged, 10),
    Promise.all(popular.map((h) => listPosts({ hubId: h.id }, 6).then((l) => l.map((p) => ({ ...p, circle: 'popular' }))))),
    getHubCards(pledged),
  ]);
  const posts = [...personLists.flat(), ...mineHubs, ...popularLists.flat()]
    .sort((a, b) => b.at - a.at)
    .slice(0, 90);

  // What there is to rank by: how many saw it, approved it, talked about it.
  const withStats = await Promise.all(posts.map(async (p) => {
    const s = await getStats(postRef(p.scope, p.id), null, { comments: true, views: true }).catch(() => ({}));
    return { ...p, views: s.views ?? 0, approvals: s.approvals ?? 0, commentCount: s.comments ?? 0 };
  }));

  return {
    posts: withStats,
    discover: publicHubs.filter((h) => !pledged.includes(h.id)).slice(0, 5),
    buddies,
    hubs: [...hubs, ...popular],
  };
}

// ------------------------------------------------------ profiles, stalking

const stalks = () => collection(db, 'stalks');

export async function countStalkers(uid) {
  try {
    return (await getCountFromServer(query(stalks(), where('to', '==', uid)))).data().count;
  } catch {
    return null;
  }
}

// Asked as a query of your own stalks: a read of one that doesn't exist is
// refused, and a refusal can wedge the Firestore client.
export async function amStalking(me, uid) {
  const snap = await getDocs(query(stalks(), where('from', '==', me), where('to', '==', uid), limit(1))).catch(() => null);
  return !!snap && !snap.empty;
}

/** Who someone stalks, for their feed. */
export async function listStalking(uid) {
  const snap = await getDocs(query(stalks(), where('from', '==', uid)));
  return snap.docs.map((d) => text(d.data().to, 128)).filter(Boolean);
}

export async function stalk(me, uid) {
  await setDoc(doc(stalks(), `${me}__${uid}`), { from: me, to: uid, createdAt: serverTimestamp() });
}

export function unstalk(me, uid) {
  return deleteDoc(doc(stalks(), `${me}__${uid}`));
}

// ------------------------------------------------------------- messages

function cleanConversation(id, data, uid) {
  return {
    id,
    kind: ['direct', 'group', 'hub'].includes(data.kind) ? data.kind : 'group',
    members: Array.isArray(data.members) ? data.members.filter((m) => typeof m === 'string') : [],
    title: text(data.title, 80),
    hubId: text(data.hubId, 32) || null,
    lastText: text(data.lastText, 200),
    lastFrom: text(data.lastFrom, 128),
    at: millis(data.lastAt ?? data.createdAt),
    other: data.kind === 'direct' ? (data.members ?? []).find((m) => m !== uid) : null,
  };
}

export function watchConversations(uid, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'conversations'), where('members', 'array-contains', uid)),
    // Metadata changes too, so a conversation you just started is marked
    // pending until the server has it (its messages can't be read before).
    { includeMetadataChanges: true },
    (snap) => onChange(snap.docs.map((d) => ({ ...cleanConversation(d.id, d.data(), uid), pending: d.metadata.hasPendingWrites })).sort((a, b) => b.at - a.at)),
    onError,
  );
}

/** A chat message as it's shown, from a conversation or a Hub's Room. */
export function cleanMessage(id, m) {
  return {
    id,
    from: text(m.from, 128),
    text: text(m.text, 4000),
    files: cleanFiles(m.files),
    post: m.post && typeof m.post.postId === 'string'
      ? { postId: text(m.post.postId, 128), hubId: text(m.post.hubId, 32) || null, profileUid: text(m.post.profileUid, 128) || null }
      : null,
    profileUid: text(m.profileUid, 128) || null,
    replyTo: m.replyTo && typeof m.replyTo.id === 'string'
      ? { id: text(m.replyTo.id, 128), from: text(m.replyTo.from, 128), text: text(m.replyTo.text, 200) }
      : null,
    edited: !!m.editedAt,
    at: millis(m.createdAt),
  };
}

export function watchMessages(convoId, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'conversations', convoId, 'messages'), orderBy('createdAt', 'asc'), limitToLast(300)),
    (snap) => onChange(snap.docs.map((d) => cleanMessage(d.id, d.data()))),
    onError,
  );
}

/**
 * Words, files, a shared post ({hubId | profileUid, postId}) or profile
 * (profileUid), and optionally the message it answers.
 */
export async function sendMessage(convoId, uid, { text: words, files, post, profileUid, replyTo }) {
  await addDoc(collection(db, 'conversations', convoId, 'messages'), withoutEmpty({
    from: uid,
    text: words?.trim(),
    files,
    post: post ? withoutEmpty({ postId: post.postId, hubId: post.hubId, profileUid: post.profileUid }) : undefined,
    profileUid,
    replyTo: replyTo ? withoutEmpty({ id: replyTo.id, from: replyTo.from, text: replyTo.text?.slice(0, 200) }) : undefined,
    createdAt: serverTimestamp(),
  }));
  const onlyGif = /^https:\/\/\S+\.(gif|webp)(\?\S*)?$/i.test(words?.trim() ?? '');
  const preview = (onlyGif ? 'Sent a GIF' : words?.trim())
    || (files?.length ? `Sent ${files.length === 1 ? files[0].name : `${files.length} files`}` : '')
    || (post ? 'Shared a post' : profileUid ? 'Shared a profile' : '');
  await updateDoc(doc(db, 'conversations', convoId), { lastAt: serverTimestamp(), lastFrom: uid, lastText: preview.slice(0, 200) });
}

export function editMessage(convoId, messageId, words) {
  return updateDoc(doc(db, 'conversations', convoId, 'messages', messageId), { text: words.trim(), editedAt: serverTimestamp() });
}

export function deleteMessage(convoId, messageId) {
  return deleteDoc(doc(db, 'conversations', convoId, 'messages', messageId));
}

/** A shared post, for its card in a message: null when it's gone or hidden. */
export async function getPostCard({ hubId, profileUid, postId }) {
  const scope = hubId ? { hubId } : { profileUid };
  const snap = await readOrMissing(postRef(scope, postId));
  return snap ? cleanPost(scope, snap.id, snap.data()) : null;
}

/** The one conversation two people have, made the first time it's needed. */
export async function openDirect(uid, otherUid) {
  if (otherUid === uid) throw new Error("That's you.");
  const members = [uid, otherUid].sort();
  const id = members.join('__');
  // Looked for among your own conversations: the rules refuse a read of one
  // that doesn't exist yet (even as a query naming its id), and that refusal
  // can wedge the Firestore client while the inbox is listening.
  const mine = await getDocs(query(collection(db, 'conversations'), where('members', 'array-contains', uid)));
  if (!mine.docs.some((d) => d.id === id)) {
    try {
      await setDoc(doc(db, 'conversations', id), { kind: 'direct', members, createdBy: uid, createdAt: serverTimestamp() });
    } catch (error) {
      if (error?.code === 'permission-denied') throw new Error("You can't message this person.");
      throw error;
    }
  }
  return id;
}

export function currentUid() {
  return auth.currentUser?.uid ?? null;
}
