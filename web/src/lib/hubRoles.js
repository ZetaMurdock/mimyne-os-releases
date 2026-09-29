// Roles and members of a Hub, for its owner's tools. Pure: what a role
// looks like, which roles someone may be given, and who may do what to
// whom (the rules on hubs/{hub}/roles and /members check the same).

export const MAX_ROLE_NAME = 24;
export const ROLE_LEVELS = ['member', 'mod'];
const LEVEL = { owner: 3, mod: 2, member: 1 };
const ID = /^[a-z0-9-]{1,40}$/;

/** A role's id from its name: letters, digits and dashes, unique among those taken. */
export function roleIdFor(name, taken = []) {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'role';
  let id = base;
  let n = 2;
  while (taken.includes(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

export const validRoleId = (id) => ID.test(String(id ?? ''));

/** The roles someone can be given: member and mod ones, never the owner's. */
export const assignableRoles = (roles) => roles.filter((r) => r.level === 'member' || r.level === 'mod').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * What the person acting (owner or mod) may do to a member: change their
 * role (owner only, never their own), take them out (the owner anyone but
 * themself; a mod only members), bar them (the same as taking out).
 */
export function memberActions({ actorUid, actorLevel, member, ownerId }) {
  const self = member.uid === actorUid;
  const memberLevel = member.uid === ownerId ? 'owner' : member.level ?? 'member';
  if (self || memberLevel === 'owner') return { role: false, remove: false, bar: false };
  const owner = actorLevel === 'owner';
  const mod = actorLevel === 'mod';
  return {
    role: owner,
    remove: owner || (mod && memberLevel === 'member'),
    bar: owner || (mod && memberLevel === 'member'),
  };
}

/** Whether a name for a role is usable. */
export function roleNameProblem(name, roles = [], exceptId = null) {
  const tidy = String(name ?? '').trim();
  if (!tidy) return 'Give the role a name.';
  if (tidy.length > MAX_ROLE_NAME) return `At most ${MAX_ROLE_NAME} characters.`;
  if (roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === tidy.toLowerCase())) return 'A role has that name already.';
  return null;
}

export const levelOf = (level) => LEVEL[level] ?? 0;
