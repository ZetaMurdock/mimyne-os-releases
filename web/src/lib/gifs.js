// GIFs and stickers through the files Worker (files-worker/src/gifs.js),
// which keeps the GIPHY key.
import { FILES_URL } from './files.js';
import { auth } from './firebase.js';

const known = new Map();

export function findGifs({ type = 'gifs', q = '', offset = 0 }) {
  const key = `${type}|${q}|${offset}`;
  if (!known.has(key)) {
    const ask = (async () => {
      const res = await fetch(`${FILES_URL}/gifs?type=${type}&q=${encodeURIComponent(q)}&offset=${offset}`, {
        headers: { authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      }).catch(() => {
        throw new Error("GIFs can't be reached right now.");
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "GIFs can't be reached right now.");
      return data;
    })();
    ask.catch(() => known.delete(key));
    known.set(key, ask);
  }
  return known.get(key);
}
