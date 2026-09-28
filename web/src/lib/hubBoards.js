// Board rooms: places inside a Hub's Board where a group talks, like
// threads with a name. Pure: what a room's record holds, and who may see or
// post in one (the rules canSeeBoardRoom / canPostInBoardRoom check the same).

export const MAX_BOARD_NAME = 40;
export const MAX_BOARD_TOPIC = 200;
export const BOARD_WHO = ['everyone', 'pledged', 'mods', 'owner'];
const NEED = { everyone: 0, pledged: 1, mods: 2, owner: 3 };
const ID = /^[a-z0-9-]{1,40}$/;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** Who may see, and who may post - never wider than who may see (the rules ask the same). */
export function cleanBoardAccess(value) {
  const view = BOARD_WHO.includes(value?.view) ? value.view : 'everyone';
  const post = BOARD_WHO.includes(value?.post) ? value.post : 'everyone';
  return { view, post: NEED[post] >= NEED[view] ? post : view };
}

/** The choices for who may post, given who may see: those at least as narrow. */
export const postChoices = (view) => BOARD_WHO.filter((who) => NEED[who] >= NEED[view]);

/** A room as the site draws it. Null for a record that is not one. */
export function cleanBoard(id, data) {
  if (!data || !ID.test(String(id))) return null;
  const name = text(data.name, MAX_BOARD_NAME).trim();
  if (!name) return null;
  return {
    id,
    name,
    topic: text(data.topic, MAX_BOARD_TOPIC),
    order: Number.isFinite(data.order) ? data.order : 0,
    access: cleanBoardAccess(data.access),
    createdBy: text(data.createdBy, 128),
  };
}

/** A room's id from its name: letters, digits and dashes, unique among those taken. */
export function boardIdFor(name, taken = []) {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'room';
  let id = base;
  let n = 2;
  while (taken.includes(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/**
 * What someone at `level` (data/rooms.js levelIn: -1 signed out, 0 signed
 * in, 1 pledged, 2 mod, 3 owner) may do in a room, given whether they may
 * post in the Hub at all.
 */
export function boardRights(board, level, canPost) {
  const access = board?.access ?? cleanBoardAccess(null);
  const view = access.view === 'everyone' || level >= NEED[access.view];
  const post = view && level >= 0 && !!canPost && level >= NEED[access.post];
  return { view, post };
}

/** The rooms someone may see, in order. */
export const visibleBoards = (boards, level) => [...boards].sort((a, b) => a.order - b.order).filter((b) => boardRights(b, level, false).view);
