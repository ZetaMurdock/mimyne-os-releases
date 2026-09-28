// How someone sorts the Hubs they pledge to: their own folders in the notch,
// kept as hub_folders/<uid> { folders: [{ id, name, hubs }] }. Pure: what a
// folder list looks like after any change, and how the notch lays it out.

export const MAX_FOLDERS = 30;
export const MAX_FOLDER_NAME = 40;
export const MAX_HUBS_IN_FOLDER = 200;

const HUB_ID = /^[a-z0-9-]{1,32}$/;

/** A folder list as it is kept: shape-checked, names tidied, a Hub in one folder at most. */
export function cleanFolders(value) {
  const list = Array.isArray(value) ? value : Array.isArray(value?.folders) ? value.folders : [];
  const seenIds = new Set();
  const seenHubs = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.slice(0, 32) : '';
    if (!id || seenIds.has(id)) continue;
    const name = tidyFolderName(raw.name) || 'Folder';
    const hubs = [];
    for (const hub of Array.isArray(raw.hubs) ? raw.hubs : []) {
      if (typeof hub !== 'string' || !HUB_ID.test(hub) || seenHubs.has(hub)) continue;
      seenHubs.add(hub);
      hubs.push(hub);
      if (hubs.length >= MAX_HUBS_IN_FOLDER) break;
    }
    seenIds.add(id);
    out.push({ id, name, hubs });
    if (out.length >= MAX_FOLDERS) break;
  }
  return out;
}

export const tidyFolderName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);

const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new folder at the end, holding the Hubs given (taken out of any other). */
export function addFolder(folders, name, hubs = []) {
  const id = newId();
  const list = cleanFolders(folders);
  if (list.length >= MAX_FOLDERS) return list;
  const without = list.map((f) => ({ ...f, hubs: f.hubs.filter((h) => !hubs.includes(h)) }));
  return cleanFolders([...without, { id, name: tidyFolderName(name) || 'Folder', hubs }]);
}

export const renameFolder = (folders, id, name) =>
  cleanFolders(folders).map((f) => (f.id === id ? { ...f, name: tidyFolderName(name) || f.name } : f));

/** The folder goes; its Hubs are back at the top level. */
export const removeFolder = (folders, id) => cleanFolders(folders).filter((f) => f.id !== id);

/** A Hub moved into a folder (`null` for the top level), out of whichever it was in. */
export function moveHub(folders, hubId, folderId) {
  const list = cleanFolders(folders).map((f) => ({ ...f, hubs: f.hubs.filter((h) => h !== hubId) }));
  return cleanFolders(list.map((f) => (f.id === folderId ? { ...f, hubs: [...f.hubs, hubId] } : f)));
}

/** Which folder a Hub is in, or null. */
export const folderOf = (folders, hubId) => cleanFolders(folders).find((f) => f.hubs.includes(hubId)) ?? null;

/**
 * The notch's order: each folder with the cards it holds (Hubs the person no
 * longer pledges to are left out), then the Hubs in no folder. A folder with
 * nothing in it still shows, so it can be filled.
 */
export function layoutHubs(folders, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const placed = new Set();
  const grouped = cleanFolders(folders).map((f) => {
    const hubs = f.hubs.map((id) => byId.get(id)).filter(Boolean);
    hubs.forEach((c) => placed.add(c.id));
    return { ...f, cards: hubs };
  });
  return { folders: grouped, loose: cards.filter((c) => !placed.has(c.id)) };
}
