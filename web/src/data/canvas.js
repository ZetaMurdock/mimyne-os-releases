// A Room's canvas: its notes (nodes) and the arrows between them (edges),
// live. Notes are shaped like the app's workspace notes (content in
// Markdown, x/y the centre in world units, style), so the app can open a
// Room later. Rules: firestore.rules in the app's repo, "rooms" → nodes, edges.
import {
  collection, deleteDoc, deleteField, doc, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { cleanFiles } from './api.js';
import { stampEdited } from './rooms.js';

export const NODE_TYPES = ['normal', 'text', 'shape', 'list', 'file'];
export const SHAPES = ['rectangle', 'rounded', 'pill', 'ellipse', 'diamond', 'triangle'];

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const millis = (value) => (typeof value?.toMillis === 'function' ? value.toMillis() : Date.now());

/** An id the rules take, sortable by when it was made. */
export const newId = (prefix = 'n') => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const nodesOf = (hubId, roomId) => collection(db, 'hubs', hubId, 'rooms', roomId, 'nodes');
const edgesOf = (hubId, roomId) => collection(db, 'hubs', hubId, 'rooms', roomId, 'edges');

function cleanStyle(style) {
  if (!style || typeof style !== 'object') return {};
  const out = {};
  if (typeof style.width === 'number') out.width = Math.min(4000, Math.max(20, style.width));
  if (typeof style.height === 'number') out.height = Math.min(4000, Math.max(20, style.height));
  if (typeof style.color === 'string') out.color = style.color.slice(0, 20);
  if (SHAPES.includes(style.shape)) out.shape = style.shape;
  if (typeof style.fill === 'boolean') out.fill = style.fill;
  return out;
}

export function cleanNode(id, d) {
  return {
    id,
    type: NODE_TYPES.includes(d.type) ? d.type : 'normal',
    content: text(d.content, 20000),
    x: num(d.x),
    y: num(d.y),
    style: cleanStyle(d.style),
    file: d.file ? cleanFiles([d.file])[0] ?? null : null,
    parentId: typeof d.parentId === 'string' ? d.parentId : null,
    order: num(d.order),
    by: text(d.by, 128),
    editedBy: text(d.editedBy, 128) || null,
    at: millis(d.updatedAt),
  };
}

export function cleanEdge(id, d) {
  return {
    id,
    from: text(d.from, 100),
    to: text(d.to, 100),
    label: text(d.label, 200),
    head: ['end', 'both', 'none'].includes(d.head) ? d.head : 'end',
    dash: d.dash === true,
    color: text(d.color, 20) || null,
    by: text(d.by, 128),
  };
}

export function watchCanvas(hubId, roomId, onNodes, onEdges, onError) {
  const stopNodes = onSnapshot(nodesOf(hubId, roomId), (snap) => onNodes(snap.docs.map((d) => cleanNode(d.id, d.data({ serverTimestamps: 'estimate' })))), onError);
  const stopEdges = onSnapshot(edgesOf(hubId, roomId), (snap) => onEdges(snap.docs.map((d) => cleanEdge(d.id, d.data()))), onError);
  return () => {
    stopNodes();
    stopEdges();
  };
}

// Only the fields the rules take, and nothing empty.
function nodeFields(node) {
  const out = { type: node.type, x: Math.round(num(node.x)), y: Math.round(num(node.y)) };
  if (node.content) out.content = node.content.slice(0, 20000);
  const style = cleanStyle(node.style);
  if (Object.keys(style).length) out.style = style;
  if (node.parentId) {
    out.parentId = node.parentId;
    out.order = num(node.order);
  }
  return out;
}

export async function addNode(hubId, roomId, uid, node) {
  const id = node.id ?? newId();
  const fields = nodeFields(node);
  if (node.file) fields.file = { name: node.file.name, size: node.file.size, type: node.file.type, path: node.file.path, ...(node.file.display === false ? { display: false } : {}) };
  await setDoc(doc(nodesOf(hubId, roomId), id), { ...fields, by: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  stampEdited(hubId, roomId);
  return id;
}

/**
 * Changes a note: the whole of what's given replaces those fields. Style is
 * merged with the note's own. parentId null takes it out of its list.
 */
export async function patchNode(hubId, roomId, uid, node, changes) {
  const next = { ...node, ...changes, style: { ...node.style, ...(changes.style ?? {}) } };
  const fields = nodeFields(next);
  const update = { ...fields, updatedAt: serverTimestamp(), editedBy: uid };
  // Fields that went away are removed, not left behind.
  for (const key of ['content', 'style', 'parentId', 'order']) if (!(key in fields)) update[key] = deleteField();
  await updateDoc(doc(nodesOf(hubId, roomId), node.id), update);
  stampEdited(hubId, roomId);
}

/** Several notes moved at once (a drag): one batch. */
export async function moveNodes(hubId, roomId, uid, moves) {
  const batch = writeBatch(db);
  for (const { node, changes } of moves) {
    const next = { ...node, ...changes };
    const fields = nodeFields(next);
    const update = { ...fields, updatedAt: serverTimestamp(), editedBy: uid };
    for (const key of ['content', 'style', 'parentId', 'order']) if (!(key in fields)) update[key] = deleteField();
    batch.update(doc(nodesOf(hubId, roomId), node.id), update);
  }
  await batch.commit();
  stampEdited(hubId, roomId);
}

/** Removes notes and the arrows touching them (arrows first, each on its own, as the rules may allow some and not others). */
export async function removeNodes(hubId, roomId, ids, edges) {
  const gone = new Set(ids);
  await Promise.all(edges.filter((e) => gone.has(e.from) || gone.has(e.to)).map((e) => deleteDoc(doc(edgesOf(hubId, roomId), e.id)).catch(() => {})));
  await Promise.all(ids.map((id) => deleteDoc(doc(nodesOf(hubId, roomId), id))));
  stampEdited(hubId, roomId);
}

export async function addEdge(hubId, roomId, uid, { from, to, label, head = 'end', dash = false, color }) {
  const id = `${from}__${to}`.slice(0, 210);
  await setDoc(doc(edgesOf(hubId, roomId), id), {
    from, to, head, dash, ...(label ? { label: label.slice(0, 200) } : {}), ...(color ? { color } : {}),
    by: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  stampEdited(hubId, roomId);
  return id;
}

export async function patchEdge(hubId, roomId, edge, changes) {
  const update = { updatedAt: serverTimestamp() };
  if ('label' in changes) update.label = changes.label ? changes.label.slice(0, 200) : deleteField();
  if ('head' in changes) update.head = changes.head;
  if ('dash' in changes) update.dash = changes.dash;
  if ('color' in changes) update.color = changes.color || deleteField();
  await updateDoc(doc(edgesOf(hubId, roomId), edge.id), update);
  stampEdited(hubId, roomId);
}

export function removeEdge(hubId, roomId, edgeId) {
  return deleteDoc(doc(edgesOf(hubId, roomId), edgeId));
}

/** Just a few notes, for a Room's card on the Rooms grid. */
export function watchPreview(hubId, roomId, onNodes) {
  return onSnapshot(query(nodesOf(hubId, roomId), limit(80)), (snap) => onNodes(snap.docs.map((d) => cleanNode(d.id, d.data({ serverTimestamps: 'estimate' })))), () => onNodes(null));
}

