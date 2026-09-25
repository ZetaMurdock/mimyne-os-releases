// Someone's own media library for the picker: GIFs, stickers and pictures
// they keep to send again, uploaded or saved from the picker. Theirs alone
// (firestore.rules, "media_library").
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { deleteFile } from '../lib/files.js';

const items = (uid) => collection(db, 'media_library', uid, 'items');
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function watchLibrary(uid, onChange) {
  return onSnapshot(
    query(items(uid), orderBy('createdAt', 'desc'), limit(300)),
    (snap) => onChange(snap.docs.map((d) => {
      const m = d.data();
      return {
        id: d.id,
        kind: m.kind === 'file' ? 'file' : 'link',
        name: text(m.name, 200),
        type: text(m.type, 100),
        size: Number(m.size) || 0,
        path: text(m.path, 400) || null,
        url: typeof m.url === 'string' && m.url.startsWith('https://') ? m.url : null,
        width: Number(m.width) || null,
        height: Number(m.height) || null,
      };
    })),
    () => onChange([]),
  );
}

const size = (n) => (Number.isInteger(n) && n > 0 && n <= 10000 ? n : undefined);
const clean = (data) => Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''));

/** A file just uploaded, kept in the library. */
export function keepUpload(uid, label, { width, height } = {}) {
  return addDoc(items(uid), clean({
    kind: 'file', name: label.name.slice(0, 200), type: label.type, size: label.size, path: label.path,
    width: size(width), height: size(height), createdAt: serverTimestamp(),
  }));
}

/** A GIF or sticker from the picker, kept by its link. */
export function keepLink(uid, { url, title, width, height }) {
  return addDoc(items(uid), clean({
    kind: 'link', name: (title || 'GIF').slice(0, 200), url, width: size(width), height: size(height), createdAt: serverTimestamp(),
  }));
}

export async function removeFromLibrary(uid, item) {
  await deleteDoc(doc(items(uid), item.id));
  if (item.kind === 'file' && item.path) deleteFile(item.path).catch(() => {});
}
