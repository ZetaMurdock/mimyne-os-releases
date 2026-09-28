import { describe, expect, it } from 'vitest';
import { assignableRoles, memberActions, roleIdFor, roleNameProblem, validRoleId } from './hubRoles.js';

const roles = [
  { id: 'warden', name: 'Warden', level: 'owner', order: 0 },
  { id: 'keeper', name: 'Keeper', level: 'mod', order: 1 },
  { id: 'crew', name: 'Crew', level: 'member', order: 2 },
];

describe("a Hub's roles and people", () => {
  it('names a role by its id, unique among those taken, and knows a good id', () => {
    expect(roleIdFor('Map Maker')).toBe('map-maker');
    expect(roleIdFor('Map Maker', ['map-maker'])).toBe('map-maker-2');
    expect(roleIdFor('***')).toBe('role');
    expect(validRoleId('map-maker')).toBe(true);
    expect(validRoleId('Map Maker')).toBe(false);
  });

  it('offers the member and mod roles to give, never the owner one', () => {
    expect(assignableRoles(roles).map((r) => r.id)).toEqual(['keeper', 'crew']);
  });

  it('checks a name: given, short enough, not taken', () => {
    expect(roleNameProblem('', roles)).toMatch(/name/);
    expect(roleNameProblem('x'.repeat(25), roles)).toMatch(/24/);
    expect(roleNameProblem('crew', roles)).toMatch(/already/);
    expect(roleNameProblem('crew', roles, 'crew')).toBeNull();
    expect(roleNameProblem('Builder', roles)).toBeNull();
  });

  it('says what the owner and a mod may do to each person', () => {
    const owner = { uid: 'o' };
    const mod = { uid: 'm', level: 'mod' };
    const member = { uid: 'c', level: 'member' };
    expect(memberActions({ actorUid: 'o', actorLevel: 'owner', member: owner, ownerId: 'o' })).toEqual({ role: false, remove: false, bar: false });
    expect(memberActions({ actorUid: 'o', actorLevel: 'owner', member: mod, ownerId: 'o' })).toEqual({ role: true, remove: true, bar: true });
    expect(memberActions({ actorUid: 'o', actorLevel: 'owner', member, ownerId: 'o' })).toEqual({ role: true, remove: true, bar: true });
    expect(memberActions({ actorUid: 'm', actorLevel: 'mod', member, ownerId: 'o' })).toEqual({ role: false, remove: true, bar: true });
    expect(memberActions({ actorUid: 'm', actorLevel: 'mod', member: { uid: 'm2', level: 'mod' }, ownerId: 'o' })).toEqual({ role: false, remove: false, bar: false });
    expect(memberActions({ actorUid: 'm', actorLevel: 'mod', member: owner, ownerId: 'o' })).toEqual({ role: false, remove: false, bar: false });
    expect(memberActions({ actorUid: 'm', actorLevel: 'mod', member: mod, ownerId: 'o' })).toEqual({ role: false, remove: false, bar: false });
  });
});
