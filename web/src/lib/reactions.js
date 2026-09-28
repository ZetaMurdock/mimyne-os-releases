// Reactions on a message, kept as { [uid]: [mark, ...] }: each person's own
// list of marks under their own uid, which is what lets the rules allow a
// member to change only their own entry (firestore.rules, reactionChange)
// with one write and no loop. Summed here into the chips a message shows.

/** How many different marks one person may put on one message. */
export const MAX_MY_REACTIONS = 10;
/** The longest a mark may be: an emoji with its modifiers, never a sentence. */
export const MAX_REACTION_CHARS = 16;
/** All of one person's marks together, the bound the rules check with join(). */
export const MAX_REACTION_JOINED = 160;

const UID = /^[A-Za-z0-9]{1,128}$/;

/** One mark as kept: a short non-empty string with no whitespace, or null. */
export function cleanMark(value) {
  const mark = typeof value === 'string' ? value.trim() : '';
  return mark && mark.length <= MAX_REACTION_CHARS && !/\s/.test(mark) ? mark : null;
}

/** The map as it is shown: each uid's marks, cleaned, once each, at most MAX_MY_REACTIONS. */
export function cleanReactions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [uid, list] of Object.entries(raw)) {
    if (!UID.test(uid) || !Array.isArray(list)) continue;
    const marks = [];
    for (const item of list) {
      const mark = cleanMark(item);
      if (mark && !marks.includes(mark)) marks.push(mark);
      if (marks.length >= MAX_MY_REACTIONS) break;
    }
    if (marks.length) out[uid] = marks;
  }
  return out;
}

/**
 * The chips: each mark with how many put it, whether I did, and who, most
 * put first and the same order every time.
 */
export function summarizeReactions(reactions, meUid = null) {
  const by = new Map();
  for (const [uid, marks] of Object.entries(cleanReactions(reactions))) {
    for (const mark of marks) {
      const chip = by.get(mark) ?? { key: mark, count: 0, mine: false, who: [] };
      chip.count += 1;
      chip.who.push(uid);
      if (uid === meUid) chip.mine = true;
      by.set(mark, chip);
    }
  }
  // Ties by the mark itself, in code-point order: the same on every machine, whatever its locale.
  return [...by.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * My list with `mark` added, or taken off when it is there already. At the
 * cap, a new mark is not added and the list comes back as it was.
 */
export function toggledMarks(mine, mark) {
  const clean = cleanMark(mark);
  const list = Array.isArray(mine) ? mine.map(cleanMark).filter(Boolean) : [];
  if (!clean) return list;
  if (list.includes(clean)) return list.filter((m) => m !== clean);
  if (list.length >= MAX_MY_REACTIONS) return list;
  const next = [...list, clean];
  return next.join(',').length <= MAX_REACTION_JOINED ? next : list;
}

/** The quick row: a few marks that cover most of what a reaction says. */
export const QUICK_MARKS = Object.freeze(['\u{1F44D}', '❤️', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}']);
