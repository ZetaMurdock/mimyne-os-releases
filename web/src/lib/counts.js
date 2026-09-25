// Counts (approvals, views, comments) asked of Firestore politely. Each post
// on a page needs several, and a page of posts asking all at once gets
// "too many requests" back, which showed as every count going to 0. So they
// go a few at a time, the same count is asked once however many cards want
// it, answers are kept for a minute, and a "slow down" is retried after a
// pause.
import { getCountFromServer } from 'firebase/firestore';

const AT_ONCE = 4;
const KEEP_MS = 60_000;
const RETRIES = 3;

let running = 0;
const waiting = [];
const known = new Map(); // key -> { at, promise }

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

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const busy = (error) => error?.code === 'resource-exhausted' || error?.code === 'unavailable';

function ask(query) {
  return new Promise((resolve, reject) => {
    waiting.push(async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          resolve((await getCountFromServer(query)).data().count);
          return;
        } catch (error) {
          if (!busy(error) || attempt >= RETRIES) {
            reject(error);
            return;
          }
          await pause(800 * 2 ** attempt + Math.random() * 400);
        }
      }
    });
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
