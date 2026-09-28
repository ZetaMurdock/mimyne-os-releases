import { describe, expect, it } from 'vitest';
import { boardIdFor, boardRights, cleanBoard, cleanBoardAccess, visibleBoards } from './hubBoards.js';

describe('Board rooms', () => {
  it('reads a room record, and drops one that is not a room', () => {
    expect(cleanBoard('strategy', { name: ' Strategy ', topic: 'Plans', order: 2, access: { view: 'pledged', post: 'mods' }, createdBy: 'u1' }))
      .toEqual({ id: 'strategy', name: 'Strategy', topic: 'Plans', order: 2, access: { view: 'pledged', post: 'mods' }, createdBy: 'u1' });
    expect(cleanBoard('Bad Id', { name: 'x' })).toBeNull();
    expect(cleanBoard('ok', { name: '   ' })).toBeNull();
    expect(cleanBoard('ok', null)).toBeNull();
  });

  it('never lets posting be wider than seeing', () => {
    expect(cleanBoardAccess({ view: 'mods', post: 'everyone' })).toEqual({ view: 'mods', post: 'mods' });
    expect(cleanBoardAccess({ view: 'pledged', post: 'owner' })).toEqual({ view: 'pledged', post: 'owner' });
    expect(cleanBoardAccess({ view: 'friends' })).toEqual({ view: 'everyone', post: 'everyone' });
  });

  it('names a room by its id, unique among those taken', () => {
    expect(boardIdFor('Raid Night!')).toBe('raid-night');
    expect(boardIdFor('Raid Night!', ['raid-night'])).toBe('raid-night-2');
    expect(boardIdFor('Raid Night!', ['raid-night', 'raid-night-2'])).toBe('raid-night-3');
    expect(boardIdFor('???')).toBe('room');
  });

  it('says who may see and post by level, and lists the rooms someone may see', () => {
    const open = cleanBoard('open', { name: 'Open', order: 1 });
    const kept = cleanBoard('kept', { name: 'Kept', order: 0, access: { view: 'pledged', post: 'mods' } });
    expect(boardRights(open, -1, false)).toEqual({ view: true, post: false });
    expect(boardRights(open, 0, true)).toEqual({ view: true, post: true });
    expect(boardRights(kept, 0, true)).toEqual({ view: false, post: false });
    expect(boardRights(kept, 1, true)).toEqual({ view: true, post: false });
    expect(boardRights(kept, 2, true)).toEqual({ view: true, post: true });
    expect(boardRights(kept, 2, false)).toEqual({ view: true, post: false });
    expect(visibleBoards([open, kept], 0).map((b) => b.id)).toEqual(['open']);
    expect(visibleBoards([open, kept], 1).map((b) => b.id)).toEqual(['kept', 'open']);
  });
});
