// Counts (approvals, views, comments), asked of Firestore politely. Each post
// on a page needs several: they go a few at a time, the same count is asked
// once however many cards want it, and answers are kept for a minute.
//
// Firestore can refuse count queries outright ("resource-exhausted", 429)
// while ordinary reads still work; the site then showed every approval as 0
// and hid views, though the app, which reads the votes themselves, showed
// them. So when a count is refused, it's worked out from the documents
// instead (at most MAX_READ of them), and count queries rest for a while
// rather than being asked again and again.
import { getCountFromServer, getDocs, limit, query as narrowed } from 'firebase/firestore';

const AT_ONCE = 4;
const KEEP_MS = 60_000;
const REST_MS = 5 * 60_000;
const MAX_READ = 500;

let running = 0;
const waiting = [];
const known = new Map(); // key -> { at, promise }
let restUntil = 0; // count queries are skipped until then

function next() {
  while (running < AT_ONCE && waiting.length) {
    const job = waiting.shift();
    running += 1;
    job().finally(() => {
      running -= 1;
      next();
    });
  }
}

const refused = (error) => error?.code === 'resource-exhausted';

/** The count from the documents themselves, the way the app counts. */
async function byReading(query) {
  return (await getDocs(narrowed(query, limit(MAX_READ)))).size;
}

async function count(query) {
  if (Date.now() >= restUntil) {
    try {
      return (await getCountFromServer(query)).data().count;
    } catch (error) {
      if (!refused(error)) throw error;
      restUntil = Date.now() + REST_MS;
    }
  }
  return byReading(query);
}

function ask(query) {
  return new Promise((resolve, reject) => {
    waiting.push(() => count(query).then(resolve, reject));
    next();
  });
}

/** How many documents `query` matches. `key` names it (its path, and any filter). */
export function countOf(key, query) {
  const hit = known.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.promise;
  const promise = ask(query);
  known.set(key, { at: Date.now(), promise });
  promise.catch(() => known.delete(key));
  return promise;
}

/** Forget a count that has just changed (a vote, a comment). */
export function forgetCount(prefix) {
  for (const key of known.keys()) if (key.startsWith(prefix)) known.delete(key);
}
