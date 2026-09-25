// A Hub's Rooms (its chat, split up by topic, the way Discord has channels),
// who's in the Hub right now, and its Files shelf. The rules are in the
// app's repo (firestore.rules, "hubs": rooms, here, files).
import {
  addDoc, collection, deleteDoc, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { cleanFiles, cleanMessage } from './api.js';

const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const millis = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Date.now());

function withoutEmpty(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)));
}

// ------------------------------------------------------------------ rooms

/** A Room's name the way it's written: lowercase, digits and dashes. */
export function roomName(input) {
  return input.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-/, '').slice(0, 32);
}

export function watchRooms(hubId, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'hubs', hubId, 'rooms'), orderBy('order', 'asc')),
    (snap) => onChange(snap.docs.map((d) => {
      const r = d.data();
      return { id: d.id, name: text(r.name, 32) || d.id, topic: text(r.topic, 200), kind: r.kind === 'announce' ? 'announce' : 'chat', order: r.order ?? 0, createdBy: r.createdBy, createdAt: r.createdAt };
    })),
    onError,
  );
}

export async function createRoom(hubId, { name, topic, kind = 'chat', order = 0 }, uid) {
  const clean = roomName(name);
  if (!clean) throw new Error('Give the Room a name.');
  const id = clean === 'general' ? 'general' : `${clean.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, 'hubs', hubId, 'rooms', id), withoutEmpty({
    name: clean, topic: topic?.trim().slice(0, 200), kind, order, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  return id;
}

export function updateRoom(hubId, room, { name, topic, kind, order }) {
  return setDoc(doc(db, 'hubs', hubId, 'rooms', room.id), withoutEmpty({
    name: roomName(name ?? room.name) || room.name,
    topic: (topic ?? room.topic)?.trim().slice(0, 200),
    kind: kind ?? room.kind,
    order: order ?? room.order,
    createdBy: room.createdBy,
    createdAt: room.createdAt,
    updatedAt: serverTimestamp(),
  }));
}

export function deleteRoom(hubId, roomId) {
  return deleteDoc(doc(db, 'hubs', hubId, 'rooms', roomId));
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
export function stampHere(hubId, uid, room) {
  return setDoc(doc(db, 'hubs', hubId, 'here', uid), withoutEmpty({ at: serverTimestamp(), room })).catch(() => {});
}

export function leaveHere(hubId, uid) {
  return deleteDoc(doc(db, 'hubs', hubId, 'here', uid)).catch(() => {});
}

/** uid → room, for everyone stamped in the last couple of minutes. */
export function watchHere(hubId, onChange) {
  return onSnapshot(
    collection(db, 'hubs', hubId, 'here'),
    (snap) => {
      const cutoff = Date.now() - HERE_FRESH;
      onChange(Object.fromEntries(snap.docs
        .map((d) => [d.id, d.data({ serverTimestamps: 'estimate' })])
        .filter(([, h]) => millis(h.at) > cutoff)
        .map(([id, h]) => [id, text(h.room, 40) || null])));
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
    file: withoutEmpty({ name: label.name, size: label.size, type: label.type, path: label.path }),
    by: uid,
    fromId: from?.id,
    fromName: from?.file?.name,
    createdAt: serverTimestamp(),
  }));
}

export function unshelveFile(hubId, fileId) {
  return deleteDoc(doc(db, 'hubs', hubId, 'files', fileId));
}
