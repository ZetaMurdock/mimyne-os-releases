// Medal clips for profiles, through the files Worker (files-worker/src/medal.js
// in the app's repo): Medal's API refuses browsers, so the Worker asks it the
// way the desktop app does. Clips are fetched fresh each time and never
// stored; thumbnails come as links the Worker signed.
import { FILES_URL } from './files.js';
import { auth } from './firebase.js';
import { CLIP_PAGE_SIZE, FRONT_CLIP_COUNT } from './profileShapes.js';

async function ask(path) {
  if (!auth.currentUser) throw new Error('Sign in to see Medal clips.');
  const res = await fetch(FILES_URL + path, { headers: { authorization: `Bearer ${await auth.currentUser.getIdToken()}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Medal can't be reached right now.");
  return data;
}

// What was last shown, this visit only, so going back and forth between
// the profile and its clips repaints at once.
const memory = new Map();
const MEMORY_MS = 5 * 60 * 1000;

/** The owner's pinned picks, in their order, when any still exist; else the newest few. */
export async function frontClips(account) {
  if (!account?.userId) return [];
  const key = `${account.userId}|${account.featured.join(',')}`;
  const kept = memory.get(key);
  if (kept && Date.now() - kept.at < MEMORY_MS) return kept.clips;
  let clips = [];
  if (account.featured.length) {
    const found = await Promise.all(account.featured.map((id) =>
      ask(`/medal/clip?userId=${account.userId}&clipId=${encodeURIComponent(id)}`).then((d) => d.clip).catch(() => null)));
    clips = found.filter(Boolean);
  }
  if (!clips.length) clips = (await ask(`/medal/clips?userId=${account.userId}&limit=${FRONT_CLIP_COUNT}`)).clips;
  memory.set(key, { at: Date.now(), clips });
  return clips;
}

/** A page for the clips page, with how many Medal served (the offset moves by that). */
export function clipsPage(userId, offset = 0) {
  return ask(`/medal/clips?userId=${userId}&limit=${CLIP_PAGE_SIZE}&offset=${offset}`);
}

/** A Medal account by username or profile link, for linking one to your profile. */
export async function resolveMedal(name) {
  return (await ask(`/medal/resolve?name=${encodeURIComponent(name)}`)).user;
}
