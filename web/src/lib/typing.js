// "Someone is typing": each person writing in a conversation stamps a
// small document of their own every few seconds while they type
// (conversations/{id}/typing/{uid} { at }, or a Room's), and takes it
// away when they send or stop. Whoever has the conversation open listens
// to those stamps and shows the fresh ones. Nothing is kept: a stamp
// older than TYPING_FRESH_MS is nobody typing.

/** A stamp this old is stale. */
export const TYPING_FRESH_MS = 8_000;
/** How often a stamp is sent while typing goes on. */
export const TYPING_EVERY_MS = 4_000;

/** The uids typing now, from { uid: at-in-ms }, me left out, newest first. */
export function typingNow(stamps, now = Date.now(), meUid = null) {
  return Object.entries(stamps ?? {})
    .filter(([uid, at]) => uid !== meUid && Number.isFinite(at) && now - at < TYPING_FRESH_MS)
    .sort((a, b) => b[1] - a[1])
    .map(([uid]) => uid);
}

/** The line: "Ann is typing", "Ann and Bo are typing", "Ann, Bo and 2 others are typing". */
export function typingLine(names) {
  const list = (names ?? []).filter(Boolean);
  if (list.length === 0) return '';
  if (list.length === 1) return `${list[0]} is typing`;
  if (list.length === 2) return `${list[0]} and ${list[1]} are typing`;
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]} are typing`;
  return `${list[0]}, ${list[1]} and ${list.length - 2} others are typing`;
}

/**
 * Sends the stamps for one writer: `typed(text)` on every change of the
 * box (a stamp at most every TYPING_EVERY_MS while there is text, and the
 * stamp taken away when the box empties), `stop()` when sent or left.
 */
export function makeTypingStamper({ stamp, clear, every = TYPING_EVERY_MS, now = Date.now }) {
  // Never stamped yet: the first keystroke stamps whatever the clock says.
  let last = -Infinity;
  let stamped = false;
  return {
    typed(text) {
      if (!String(text ?? '').trim()) {
        if (stamped) { stamped = false; last = -Infinity; clear(); }
        return;
      }
      const at = now();
      if (at - last < every) return;
      last = at;
      stamped = true;
      stamp();
    },
    stop() {
      if (!stamped) return;
      stamped = false;
      last = -Infinity;
      clear();
    },
  };
}
