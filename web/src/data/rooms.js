// A Hub's Rooms (its chat, split up by topic, the way Discord has channels),
// who's in the Hub right now, and its Files shelf. The rules are in the
// app's repo (firestore.rules, "hubs": rooms, here, files).
import {
  addDoc, collection, deleteDoc, deleteField, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { cleanFiles, cleanMessage } from './api.js';

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const millis = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Date.now());

function withoutEmpty(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
}

// ------------------------------------------------------------------ rooms

/** A Room's #tag the way it's written: lowercase, digits and dashes. */
export function roomName(input) {
  return input.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-/, '').slice(0, 32);
}

const WHO = ['everyone', 'pledged', 'mods', 'owner'];
const who = (value, fallback) => (WHO.includes(value) ? value : fallback);

/** Who may look inside, add notes, and edit everything (see firestore.rules, "rooms"). */
export function cleanAccess(access) {
  return { view: who(access?.view, 'everyone'), add: who(access?.add, 'everyone'), edit: who(access?.edit, 'pledged') };
}

export function watchRooms(hubId, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'hubs', hubId, 'rooms'), orderBy('order', 'asc')),
    // With pending writes shown: a Room just made is `pending` until the
    // server has it, and nothing inside it is listened to before then (a
    // refused listen can wedge the Firestore client).
    { includeMetadataChanges: true },
    (snap) => onChange(snap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        name: text(r.name, 60) || d.id,
        tag: text(r.tag, 32) || roomName(text(r.name, 60)) || d.id,
        topic: text(r.topic, 200),
        kind: r.kind === 'announce' ? 'announce' : 'chat',
        order: r.order ?? 0,
        access: cleanAccess(r.access),
        editedAt: r.editedAt ? millis(r.editedAt) : null,
        workspace: text(r.workspace, 128) || null,
        pending: d.metadata.hasPendingWrites && !r.createdAt?.toMillis,
        raw: r,
      };
    })),
    onError,
  );
}

function roomFields({ name, tag, topic, kind, order, access, workspace }) {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error('Give the Room a name.');
  const acc = cleanAccess(access);
  return withoutEmpty({
    name: cleanName,
    tag: roomName(tag || cleanName) || undefined,
    topic: topic?.trim().slice(0, 200),
    kind,
    order,
    workspace: workspace || undefined,
    // Left out when it's all the usual, so older Rooms and new ones read alike.
    access: acc.view === 'everyone' && acc.add === 'everyone' && acc.edit === 'pledged' ? undefined : acc,
  });
}

/** A new Room's id, from its tag. */
export function roomIdFor(tag) {
  const slug = roomName(tag || '') || 'room';
  return slug === 'general' ? 'general' : `${slug.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createRoom(hubId, { name, tag, topic, kind = 'chat', order = 0, access, workspace, id: givenId }, uid) {
  const fields = roomFields({ name, tag, topic, kind, order, access, workspace });
  const id = givenId ?? roomIdFor(fields.tag);
  await setDoc(doc(db, 'hubs', hubId, 'rooms', id), { ...fields, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return id;
}

export function updateRoom(hubId, room, changes) {
  const fields = roomFields({
    name: changes.name ?? room.name,
    tag: changes.tag ?? room.tag,
    topic: changes.topic ?? room.topic,
    kind: changes.kind ?? room.kind,
    order: changes.order ?? room.order,
    access: changes.access ?? room.access,
    workspace: 'workspace' in changes ? changes.workspace : room.workspace,
  });
  // What only the rules' own stamps may say stays exactly as it was.
  const keep = Object.fromEntries(['createdBy', 'createdAt', 'editedAt'].filter((k) => room.raw?.[k] !== undefined).map((k) => [k, room.raw[k]]));
  return setDoc(doc(db, 'hubs', hubId, 'rooms', room.id), { ...fields, ...keep, updatedAt: serverTimestamp() });
}

/** A Room lets go of the app workspace it showed (its owner moved it elsewhere). */
export function clearRoomWorkspace(hubId, roomId) {
  return updateDoc(doc(db, 'hubs', hubId, 'rooms', roomId), { workspace: deleteField(), updatedAt: serverTimestamp() });
}

export function deleteRoom(hubId, roomId) {
  return deleteDoc(doc(db, 'hubs', hubId, 'rooms', roomId));
}

// When the canvas last changed, for its card: once a minute at most.
const stamped = new Map();
export function stampEdited(hubId, roomId) {
  const key = `${hubId}/${roomId}`;
  if (Date.now() - (stamped.get(key) ?? 0) < 60_000) return;
  stamped.set(key, Date.now());
  updateDoc(doc(db, 'hubs', hubId, 'rooms', roomId), { editedAt: serverTimestamp() }).catch(() => {});
}

/**
 * What someone may do in a Room: view, add notes (and change their own),
 * edit everything. `level`: 3 owner, 2 mod, 1 pledged, 0 signed in, -1 out.
 */
export function roomRights(room, level, canPost) {
  const need = { everyone: 0, pledged: 1, mods: 2, owner: 3 };
  const a = room.access ?? cleanAccess(null);
  const view = a.view === 'everyone' || level >= need[a.view];
  const add = view && level >= 0 && canPost && level >= need[a.add];
  const edit = view && level >= 0 && canPost && (level >= need[a.edit] || (level >= 2 && a.edit !== 'owner'));
  return { view, add, edit };
}

export function levelIn(hub, user, members, isPledged) {
  if (!user) return -1;
  if (hub.ownerId === user.uid) return 3;
  // The live pledge (from the session) wins over the list loaded with the page.
  const pledged = isPledged ?? members.some((m) => m.uid === user.uid);
  if (!pledged) return 0;
  return members.find((m) => m.uid === user.uid)?.level === 'mod' ? 2 : 1;
}

// --------------------------------------------------------------- messages

const messagesOf = (hubId, roomId) => collection(db, 'hubs', hubId, 'rooms', roomId, 'messages');

export function watchRoomMessages(hubId, roomId, onChange, onError, count = 200) {
  return onSnapshot(
    query(messagesOf(hubId, roomId), orderBy('createdAt', 'asc'), limitToLast(count)),
    (snap) => onChange(snap.docs.map((d) => cleanMessage(d.id, d.data({ serverTimestamps: 'estimate' })))),
    onError,
  );
}

/** Just the newest message in a Room, for its unread dot. */
export function watchLatest(hubId, roomId, onChange) {
  return onSnapshot(
    query(messagesOf(hubId, roomId), orderBy('createdAt', 'asc'), limitToLast(1)),
    (snap) => {
      const d = snap.docs[0];
      onChange(d ? { from: text(d.data().from, 128), at: millis(d.data({ serverTimestamps: 'estimate' }).createdAt) } : null);
    },
    () => {},
  );
}

export function sendRoomMessage(hubId, roomId, uid, { text: words, files, post, profileUid, replyTo }) {
  return addDoc(messagesOf(hubId, roomId), withoutEmpty({
    from: uid,
    text: words?.trim(),
    files,
    post: post ? withoutEmpty({ postId: post.postId, hubId: post.hubId, profileUid: post.profileUid }) : undefined,
    profileUid,
    replyTo: replyTo ? withoutEmpty({ id: replyTo.id, from: replyTo.from, text: replyTo.text?.slice(0, 200) }) : undefined,
    createdAt: serverTimestamp(),
  }));
}

export function editRoomMessage(hubId, roomId, messageId, words) {
  return updateDoc(doc(messagesOf(hubId, roomId), messageId), { text: words.trim(), editedAt: serverTimestamp() });
}

export function deleteRoomMessage(hubId, roomId, messageId) {
  return deleteDoc(doc(messagesOf(hubId, roomId), messageId));
}

// ---------------------------------------------------------- who's here now

const HERE_FRESH = 150_000;

/** Marks you as in the Hub now (and in which Room); sent again each minute. */
export function stampHere(hubId, uid, room, writing = false) {
  return setDoc(doc(db, 'hubs', hubId, 'here', uid), withoutEmpty({ at: serverTimestamp(), room, writing: writing || undefined })).catch(() => {});
}

export function leaveHere(hubId, uid) {
  return deleteDoc(doc(db, 'hubs', hubId, 'here', uid)).catch(() => {});
}

/** uid → { room, writing }, for everyone stamped in the last couple of minutes. */
export function watchHere(hubId, onChange) {
  return onSnapshot(
    collection(db, 'hubs', hubId, 'here'),
    (snap) => {
      const cutoff = Date.now() - HERE_FRESH;
      onChange(Object.fromEntries(snap.docs
        .map((d) => [d.id, d.data({ serverTimestamps: 'estimate' })])
        .filter(([, h]) => millis(h.at) > cutoff)
        .map(([id, h]) => [id, { room: text(h.room, 40) || null, writing: h.writing === true }])));
    },
    () => {},
  );
}

// ------------------------------------------------------------------ files

export function watchHubFiles(hubId, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'hubs', hubId, 'files'), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => {
      const f = d.data({ serverTimestamps: 'estimate' });
      const [file] = cleanFiles([f.file]);
      return file ? { id: d.id, file, by: text(f.by, 128), fromId: text(f.fromId, 128) || null, fromName: text(f.fromName, 200) || null, at: millis(f.createdAt) } : null;
    }).filter(Boolean)),
    onError,
  );
}

/** Puts one of your uploads on the Hub's shelf; `from` is the file it was converted from. */
export function shelveFile(hubId, uid, label, from) {
  return addDoc(collection(db, 'hubs', hubId, 'files'), withoutEmpty({
    file: withoutEmpty({ name: label.name, size: label.size, type: label.type, path: label.path, sha256: label.sha256 }),
    by: uid,
    fromId: from?.id,
    fromName: from?.file?.name,
    createdAt: serverTimestamp(),
  }));
}

export function unshelveFile(hubId, fileId) {
  return deleteDoc(doc(db, 'hubs', hubId, 'files', fileId));
}
