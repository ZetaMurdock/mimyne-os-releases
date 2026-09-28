import { describe, expect, it } from 'vitest';
import { addFolder, cleanFolders, folderOf, layoutHubs, moveHub, removeFolder, renameFolder } from './hubFolders.js';

const cards = [{ id: 'ashfall', name: 'Ashfall' }, { id: 'raiders', name: 'Raiders' }, { id: 'lounge', name: 'Lounge' }];

describe('hub folders', () => {
  it('tidies what is kept: shapes, names, a Hub in one folder at most', () => {
    const list = cleanFolders({ folders: [
      { id: 'a', name: '  Raid   night ', hubs: ['ashfall', 'raiders', 'ashfall', 'Bad Id!'] },
      { id: 'a', name: 'twice', hubs: [] },
      { id: 'b', name: '', hubs: ['ashfall', 'lounge'] },
      'junk',
      { id: '', name: 'no id', hubs: [] },
    ] });
    expect(list).toEqual([
      { id: 'a', name: 'Raid night', hubs: ['ashfall', 'raiders'] },
      { id: 'b', name: 'Folder', hubs: ['lounge'] },
    ]);
    expect(cleanFolders(null)).toEqual([]);
  });

  it('adds, renames, removes, and moves', () => {
    let list = addFolder([], 'Games', ['ashfall']);
    expect(list).toHaveLength(1);
    expect(list[0].hubs).toEqual(['ashfall']);
    list = moveHub(list, 'raiders', list[0].id);
    expect(list[0].hubs).toEqual(['ashfall', 'raiders']);
    list = addFolder(list, 'Chill', ['raiders']);
    expect(list[0].hubs).toEqual(['ashfall']);
    expect(list[1].hubs).toEqual(['raiders']);
    expect(folderOf(list, 'raiders')?.name).toBe('Chill');
    list = renameFolder(list, list[1].id, ' Chill  out ');
    expect(list[1].name).toBe('Chill out');
    list = moveHub(list, 'raiders', null);
    expect(folderOf(list, 'raiders')).toBeNull();
    list = removeFolder(list, list[0].id);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Chill out');
  });

  it('lays the notch out: folders with their cards, then the loose Hubs', () => {
    const list = addFolder([], 'Games', ['raiders', 'gone']);
    const laid = layoutHubs(list, cards);
    expect(laid.folders[0].cards.map((c) => c.id)).toEqual(['raiders']);
    expect(laid.loose.map((c) => c.id)).toEqual(['ashfall', 'lounge']);
  });

  it('holds at most thirty folders', () => {
    let list = [];
    for (let i = 0; i < 35; i += 1) list = addFolder(list, `F${i}`);
    expect(list).toHaveLength(30);
  });
});
