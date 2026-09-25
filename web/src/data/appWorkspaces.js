// App workspaces shown in a Hub's Rooms, view only. The app keeps a
// workspace on its owner's machine and publishes a copy of its notes, arrows
// and rooms to workspaces/<id>/{notes,connections,spaces} (each a JSON string)
// while sharing is on. A Room shows that copy when the workspace's owner put
// it there: the Room names the workspace and the workspace names the Room
// (firestore.rules, inRoomFor). Nothing here ever writes to its contents.
import {
  collection, doc, getDocs, limit, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** Your own app workspaces, to pick one for a Room. */
export async function myAppWorkspaces(uid) {
  const snap = await getDocs(query(collection(db, 'workspaces'), where('ownerId', '==', uid), limit(100)));
  return snap.docs
    .filter((d) => !d.id.startsWith('local-'))
    .map((d) => {
      const w = d.data();
      return {
        id: d.id,
        name: text(w.name, 120) || 'Untitled workspace',
        sharing: w.sharing?.enabled === true,
        hubRoom: w.hubRoom && typeof w.hubRoom.hub === 'string' ? { hub: w.hubRoom.hub, room: w.hubRoom.room } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Points your workspace at a Room (its other half: the Room's `workspace`). */
export function linkWorkspace(workspaceId, hubId, roomId) {
  return updateDoc(doc(db, 'workspaces', workspaceId), { hubRoom: hubId ? { hub: hubId, room: roomId } : null });
}

function parse(d) {
  try {
    const item = JSON.parse(d.data().json);
    return item && typeof item === 'object' ? item : null;
  } catch {
    return null;
  }
}

// App note types that are settings for automations: shown by name only.
const CONFIG = new Set(['api_node', 'api_endpoint_node', 'ws_bridge_node', 'agent', 'file_watcher_node', 'file_writer_node', 'automation_sequence_node', 'widget-button', 'widget-metric', 'widget-slider', 'local_file']);
const LABELS = {
  agent: 'Agent', api_node: 'API', api_endpoint_node: 'API endpoint', ws_bridge_node: 'Bridge', file_watcher_node: 'File watcher',
  file_writer_node: 'File writer', automation_sequence_node: 'Automation', 'widget-button': 'Button', 'widget-metric': 'Metric',
  'widget-slider': 'Slider', local_file: 'Local file', space_portal: 'Room', cluster: 'Cluster',
};

/** An app note as a canvas note: what the web canvas can draw of it. */
export function fromAppNote(n) {
  const type = String(n.type ?? 'normal');
  let content = typeof n.content === 'string' ? n.content : '';
  if (CONFIG.has(type)) content = `**${LABELS[type] ?? type}**`;
  else if (type === 'web-frame' || type === 'web_page') content = content ? `🌐 ${content}` : '🌐 Web page';
  else if (type === 'spotify-playlist') content = `🎵 ${n.spotify?.name ?? 'Spotify playlist'}`;
  else if (type.startsWith('steam')) content = `🎮 ${n.game?.name ?? 'Steam'}`;
  else if (type === 'space_portal') content = `🚪 ${content.replace(/^Space:\s*/, '') || 'Room'}`;
  else if (type.startsWith('github')) content = content || `GitHub ${type.replace('github_', '')}`;
  // Only pictures the web can load safely.
  content = content.replace(/!\[([^\]]*)\]\((?!https:|data:image\/)[^)]*\)/g, '[$1]');
  const s = n.style ?? {};
  const width = Number(s.width) || Number(n.width) || (type === 't-node' ? 360 : undefined);
  const color = typeof s.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(s.color) ? s.color : undefined;
  return {
    id: String(n.id),
    type: 'normal',
    content: content.slice(0, 20000),
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    style: { ...(width ? { width: Math.min(900, Math.max(120, width)) } : {}), ...(color ? { color } : {}) },
    file: null,
    parentId: null,
    order: 0,
    by: '',
    at: 0,
  };
}

/** What shows in the workspace's main room: as the app's own guest view draws it. */
function inMainRoom(n) {
  return (n.spaceId ?? null) === null && !n.parentId && n.type !== 'wall' && !n.hiddenByCollapse && !n.embeddedIn;
}

/**
 * The workspace's name and published main room, live: { name, ownerId,
 * nodes, edges } or null while loading. `onError` when it can't be read.
 */
export function watchAppWorkspace(workspaceId, onData, onError) {
  let meta = null;
  let notes = null;
  let links = null;
  const send = () => {
    if (!meta || !notes || !links) return;
    const nodes = notes.filter(inMainRoom).map(fromAppNote);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = links
      .filter((c) => ids.has(String(c.from)) && ids.has(String(c.to)))
      .map((c) => ({ id: String(c.id ?? `${c.from}__${c.to}`), from: String(c.from), to: String(c.to), label: text(c.label, 200), head: 'end', dash: false, color: null, by: '' }));
    onData({ ...meta, nodes, edges });
  };
  const stops = [
    onSnapshot(doc(db, 'workspaces', workspaceId), (snap) => {
      const w = snap.data() ?? {};
      meta = { name: text(w.name, 120) || 'Workspace', ownerId: text(w.ownerId, 128), sharing: w.sharing?.enabled === true };
      send();
    }, onError),
    onSnapshot(collection(db, 'workspaces', workspaceId, 'notes'), (snap) => {
      notes = snap.docs.map(parse).filter(Boolean);
      send();
    }, onError),
    onSnapshot(collection(db, 'workspaces', workspaceId, 'connections'), (snap) => {
      links = snap.docs.map(parse).filter(Boolean);
      send();
    }, onError),
  ];
  return () => stops.forEach((stop) => stop());
}

/** A few notes, for the Room's card. */
export function watchAppPreview(workspaceId, onNodes) {
  return onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'notes'), limit(80)),
    (snap) => onNodes(snap.docs.map(parse).filter((n) => n && inMainRoom(n)).map(fromAppNote)),
    () => onNodes(null),
  );
}
