// A Hub's Clips: its highlight reel, shared from Medal, uploaded, or linked
// (firestore.rules in the app's repo, "hubs" → clips).
import {
  addDoc, collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { cleanFiles } from './api.js';
import { cleanMedalAccount } from '../lib/profileShapes.js';

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const millis = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Date.now());

export const clipRef = (hubId, clipId) => doc(db, 'hubs', hubId, 'clips', clipId);

export function watchClips(hubId, onChange, onError) {
  return onSnapshot(
    query(collection(db, 'hubs', hubId, 'clips'), orderBy('createdAt', 'desc'), limit(120)),
    (snap) => onChange(snap.docs.map((d) => {
      const c = d.data({ serverTimestamps: 'estimate' });
      return {
        id: d.id,
        by: text(c.by, 128),
        source: ['medal', 'file', 'link'].includes(c.source) ? c.source : 'link',
        title: text(c.title, 120),
        game: text(c.game, 60),
        url: text(c.url, 500) || null,
        thumb: text(c.thumb, 1000) || null,
        seconds: Number(c.seconds) || 0,
        file: c.file ? cleanFiles([c.file])[0] ?? null : null,
        at: millis(c.createdAt),
      };
    })),
    onError,
  );
}

function withoutEmpty(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Shares a clip: { source, title, game, url, thumb, seconds, medalId, file }. */
export function shareClip(hubId, uid, clip) {
  return addDoc(collection(db, 'hubs', hubId, 'clips'), withoutEmpty({
    by: uid,
    source: clip.source,
    title: clip.title?.trim().slice(0, 120),
    game: clip.game?.trim().slice(0, 60),
    url: clip.url,
    thumb: clip.thumb && /^https:\/\//.test(clip.thumb) ? clip.thumb.slice(0, 1000) : undefined,
    seconds: clip.seconds > 0 ? Math.round(clip.seconds) : undefined,
    medalId: clip.medalId && /^[A-Za-z0-9_-]{1,40}$/.test(clip.medalId) ? clip.medalId : undefined,
    file: clip.file ? { name: clip.file.name, size: clip.file.size, type: clip.file.type, path: clip.file.path } : undefined,
    createdAt: serverTimestamp(),
  }));
}

export function retitleClip(hubId, clipId, { title, game }) {
  return updateDoc(clipRef(hubId, clipId), { title: title.trim().slice(0, 120), game: game.trim().slice(0, 60) });
}

export function removeClip(hubId, clipId) {
  return deleteDoc(clipRef(hubId, clipId));
}

/** The Medal account on your own profile, if you linked one. */
export async function myMedal(uid) {
  const snap = await getDoc(doc(db, 'profile_pages', uid)).catch(() => null);
  return snap?.exists() ? cleanMedalAccount(snap.data().medal) : null;
}

/** A link's kind of clip: Medal's share links are Medal clips; any other https link is a link. */
export function clipFromLink(raw) {
  const url = raw.trim();
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 500) return null;
  if (/^https:\/\/medal\.tv\//i.test(url)) return { source: 'medal', url, medalId: url.match(/\/clips\/([A-Za-z0-9_-]{1,40})/)?.[1] };
  return { source: 'link', url };
}
