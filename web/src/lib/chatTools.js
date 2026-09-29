// Pins, search and jumping in a conversation: the pure part of the Messages
// page's tools (tested in the app, src/web/lib/chatTools.test.js).
import { plainText } from './messageFormat.js';

/** At most this many pins in a chat (the rules say the same). */
export const MAX_PINS = 25;
/** Messages a conversation shows at first, and how many more each step back. */
export const PAGE = 300;
/** The furthest back a conversation goes on screen, to search or jump to. */
export const MAX_WINDOW = 3000;

/** A conversation's pins as ids, oldest first: strings only, each once, the newest MAX_PINS. */
export function cleanPins(pins) {
  if (!Array.isArray(pins)) return [];
  const seen = new Set();
  const out = [];
  for (const id of pins) {
    if (typeof id !== 'string' || !id || id.length > 128 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(-MAX_PINS);
}

/**
 * The messages a search finds, oldest first, by id: every word of it in the
 * message's words, a file's name, or the sender's name (`nameOf(uid)`).
 */
export function searchMessages(messages, words, nameOf = () => '') {
  const wanted = String(words ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!wanted.length) return [];
  return messages
    .filter((m) => {
      const seen = [plainText(m.text), ...(m.files ?? []).map((f) => f.name), nameOf(m.from)].join(' ').toLowerCase();
      return wanted.every((w) => seen.includes(w));
    })
    .map((m) => m.id);
}

/**
 * The result after `current` going older (-1) or newer (+1), round the ends.
 * With none chosen yet, the newest.
 */
export function stepResult(results, current, dir) {
  if (!results.length) return null;
  const at = results.indexOf(current);
  if (at === -1) return results[results.length - 1];
  return results[(at + dir + results.length) % results.length];
}

/** Close enough to the bottom that a new message should come into view. */
export function nearBottom({ scrollTop, scrollHeight, clientHeight }, slack = 120) {
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/**
 * How many messages to show so that one with `since` messages from it to
 * the newest is on screen, with some before it; null when that is further
 * back than MAX_WINDOW.
 */
export function windowFor(since, current = PAGE) {
  if (!Number.isFinite(since) || since < 0) return null;
  const want = Math.ceil((since + 20) / 100) * 100;
  if (want > MAX_WINDOW) return null;
  return Math.max(current, want);
}
