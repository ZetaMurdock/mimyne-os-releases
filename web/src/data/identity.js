// Usernames and public profiles, the same contract as the app's
// src/runtime/identity.js: one username per person, 3 to 20 letters, digits
// or underscores, unique whatever the capitals, claimed in one batch with
// the profile that carries it.
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

const RESERVED = new Set([
  'admin', 'administrator', 'mimyne', 'mimyneos', 'mimyne_os', 'support', 'help',
  'system', 'official', 'staff', 'moderator', 'mod', 'owner', 'root', 'null',
  'undefined', 'anonymous', 'everyone', 'nobody', 'you', 'me',
]);

export const usernameKey = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '');

export function usernameProblem(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return 'Choose a username.';
  if (trimmed.length < 3) return 'At least 3 characters.';
  if (trimmed.length > 20) return 'At most 20 characters.';
  if (!/^[A-Za-z0-9_]{3,20}$/.test(trimmed)) return 'Letters, numbers and underscores only.';
  if (RESERVED.has(trimmed.toLowerCase())) return 'That name is reserved.';
  return null;
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** Someone's public card, made safe to draw. */
export function cleanProfile(uid, data) {
  if (!data || typeof data !== 'object') return null;
  const username = text(data.username, 20);
  if (!username) return null;
  const picture = [data.avatar, data.photoURL].find((p) =>
    typeof p === 'string' && (/^https:\/\/\S+$/i.test(p) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p)));
  return { uid, username, displayName: text(data.displayName, 60), picture: picture ?? null };
}

export async function readProfile(uid) {
  const snapshot = await getDoc(doc(db, 'profiles', uid));
  return snapshot.exists() ? cleanProfile(uid, snapshot.data()) : null;
}

/** Who holds a name: their uid, or null if it's free. */
export async function lookupUsername(name) {
  const key = usernameKey(name);
  if (!/^[a-z0-9_]{3,20}$/.test(key)) return null;
  const snapshot = await getDoc(doc(db, 'usernames', key));
  return snapshot.exists() ? snapshot.data()?.uid ?? null : null;
}

export async function claimUsername(uid, name, { displayName = '', photoURL = null } = {}) {
  const problem = usernameProblem(name);
  if (problem) throw new Error(problem);
  const username = name.trim();
  const key = usernameKey(username);
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', key), { uid });
  batch.set(doc(db, 'profiles', uid), {
    username,
    usernameKey: key,
    displayName: String(displayName || '').slice(0, 60),
    photoURL: typeof photoURL === 'string' && /^https:\/\//i.test(photoURL) && photoURL.length <= 500 ? photoURL : null,
    usernameChangedAt: serverTimestamp(),
    joinedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    if (error?.code === 'permission-denied') throw new Error('That username is taken.');
    throw error;
  }
  return username;
}
