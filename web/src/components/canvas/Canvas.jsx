import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { FileCard } from '../FileCard.jsx';
import { addEdge, addNode, moveNodes, newId, patchEdge, patchNode, removeEdge, removeNodes, SHAPES } from '../../data/canvas.js';
import { uploadFile } from '../../lib/files.js';
import { markdownToHtml } from '../../lib/convert.js';
import { formatBytes } from '../../lib/format.js';
import './Canvas.css';

// A Room's canvas: a dotted plane you pan and zoom, with notes, text,
// shapes, lists (whose cards are notes too) and files on it, and arrows
// between any of them. Coordinates are the app's: a note's x/y is its centre,
// world (0,0) sits in the middle of the view.

const MIN_SCALE = 0.15;
const MAX_SCALE = 2.5;
export const COLORS = ['#a1a1aa', '#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#818cf8', '#e879f9'];
const DEFAULT_SIZE = {
  normal: { width: 220 },
  text: { width: 260 },
  shape: { width: 170, height: 110 },
  list: { width: 272 },
  file: { width: 280 },
};
const TOOLS = [
  { id: 'select', icon: 'cursor', label: 'Select and move', key: 'v' },
  { id: 'note', icon: 'note', label: 'Note', key: 'n' },
  { id: 'text', icon: 'type', label: 'Text', key: 't' },
  { id: 'shape', icon: 'shape', label: 'Shape', key: 's' },
  { id: 'list', icon: 'columns', label: 'List', key: 'l' },
  { id: 'arrow', icon: 'arrowRight', label: 'Arrow: drag from one thing to another', key: 'a' },
];
const DROPPABLE = new Set(['normal', 'file', 'text']);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Where a line from a box's centre toward (tx, ty) leaves the box. */
function edgePoint(r, tx, ty, gap) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? (r.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + gap) / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

export default function Canvas({ nodes, edges, rights, uid, onWriting, onRoomNote, hubId, roomId }) {
  const stage = useRef(null);
  const world = useRef(null);
  const fileInput = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [tool, setTool] = useState('select');
  const [shapeKind, setShapeKind] = useState('rounded');
  const [selected, setSelected] = useState(() => new Set());
  const [edgeSel, setEdgeSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [drag, setDrag] = useState(null); // { ids, dx, dy, card, point, overList }
  const [linking, setLinking] = useState(null); // { from, point, over }
  const [marquee, setMarquee] = useState(null);
  const [rects, setRects] = useState({});
  const [uploads, setUploads] = useState([]);
  const [error, setError] = useState(null);
  const [labeling, setLabeling] = useState(null);
  // Fit everything in once, for a Room that already has things in it; an
  // empty one stays put while the first notes go in.
  const fitted = useRef(nodes.length === 0);
  const viewRef = useRef(view);
  viewRef.current = view;

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const cardsOf = useMemo(() => {
    const map = new Map();
    for (const n of nodes) {
      if (!n.parentId || !byId.has(n.parentId)) continue;
      if (!map.has(n.parentId)) map.set(n.parentId, []);
      map.get(n.parentId).push(n);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return map;
  }, [nodes, byId]);
  // On the plane: everything not sitting in a list that exists.
  const free = useMemo(() => nodes.filter((n) => !n.parentId || !byId.has(n.parentId)), [nodes, byId]);
  const liveEdges = useMemo(() => edges.filter((e) => byId.has(e.from) && byId.has(e.to)), [edges, byId]);
  const canModify = useCallback((n) => rights.edit || (rights.add && n.by === uid), [rights, uid]);
  const canModifyEdge = (e) => rights.edit || (rights.add && e.by === uid);

  // ------------------------------------------------------------ the view
  useLayoutEffect(() => {
    const el = stage.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback((clientX, clientY) => {
    const r = stage.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - r.width / 2 - v.x) / v.s, y: (clientY - r.top - r.height / 2 - v.y) / v.s };
  }, []);

  const fit = useCallback(() => {
    const list = Object.values(rects);
    if (!list.length) return setView({ x: 0, y: 0, s: 1 });
    const minX = Math.min(...list.map((r) => r.x));
    const minY = Math.min(...list.map((r) => r.y));
    const maxX = Math.max(...list.map((r) => r.x + r.w));
    const maxY = Math.max(...list.map((r) => r.y + r.h));
    const s = clamp(Math.min((size.w - 160) / (maxX - minX || 1), (size.h - 160) / (maxY - minY || 1)), 0.2, 1);
    setView({ x: -((minX + maxX) / 2) * s, y: -((minY + maxY) / 2) * s, s });
  }, [rects, size]);

  // Fit everything in once, when the notes first arrive.
  useEffect(() => {
    if (!fitted.current && nodes.length && Object.keys(rects).length >= Math.min(nodes.length, 1)) {
      fitted.current = true;
      fit();
    }
  }, [nodes.length, rects, fit]);

  function zoomAt(factor, clientX, clientY) {
    const r = stage.current.getBoundingClientRect();
    const px = (clientX ?? r.left + r.width / 2) - r.left - r.width / 2;
    const py = (clientY ?? r.top + r.height / 2) - r.top - r.height / 2;
    setView((v) => {
      const s = clamp(v.s * factor, MIN_SCALE, MAX_SCALE);
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }

  // Wheel: zoom around the pointer (pinch too); shift or a trackpad's sideways swipe pans.
  useEffect(() => {
    const el = stage.current;
    const onWheel = (e) => {
      if (e.target.closest('.cv-scroll')) return;
      e.preventDefault();
      if (e.shiftKey || (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
      } else {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ------------------------------------------------ where everything is
  // Measured from the page after each render, in world units, so arrows
  // meet notes (and cards inside lists) wherever they really are.
  useLayoutEffect(() => {
    const w = world.current;
    if (!w) return;
    const origin = w.getBoundingClientRect();
    const s = viewRef.current.s;
    const next = {};
    for (const el of w.querySelectorAll('[data-node]')) {
      const r = el.getBoundingClientRect();
      next[el.dataset.node] = { x: (r.left - origin.left) / s, y: (r.top - origin.top) / s, w: r.width / s, h: r.height / s };
    }
    const same = Object.keys(next).length === Object.keys(rects).length
      && Object.entries(next).every(([id, r]) => {
        const o = rects[id];
        return o && Math.abs(o.x - r.x) < 0.5 && Math.abs(o.y - r.y) < 0.5 && Math.abs(o.w - r.w) < 0.5 && Math.abs(o.h - r.h) < 0.5;
      });
    if (!same) setRects(next);
  });

  // ------------------------------------------------------------ making
  async function make(type, at, extra = {}) {
    if (!rights.add) return null;
    const node = {
      id: newId(),
      type,
      x: at.x,
      y: at.y,
      content: extra.content ?? (type === 'list' ? 'New list' : ''),
      style: { ...DEFAULT_SIZE[type], ...(type === 'shape' ? { shape: shapeKind } : {}), ...(extra.style ?? {}) },
      ...extra,
    };
    try {
      await addNode(hubId, roomId, uid, node);
      setSelected(new Set([node.id]));
      if (type !== 'list' && type !== 'file') setEditing(node.id);
      return node.id;
    } catch (err) {
      setError(err.code === 'permission-denied' ? "You can't add to this Room." : 'That didn’t save. Try again.');
      return null;
    }
  }

  async function addCard(list) {
    const cards = cardsOf.get(list.id) ?? [];
    const order = (cards.at(-1)?.order ?? 0) + 1;
    await make('normal', { x: list.x, y: list.y }, { parentId: list.id, order, style: {} });
  }

  async function uploadAt(files, at, parentId = null) {
    if (!rights.add) return;
    let offset = 0;
    for (const file of [...files]) {
      const id = newId('u');
      const spot = { x: at.x + offset, y: at.y + offset };
      offset += 30;
      setUploads((prev) => [...prev, { id, name: file.name, size: file.size, ...spot, progress: 0 }]);
      try {
        const label = await uploadFile(file, (progress) => setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress } : u))));
        const cards = parentId ? cardsOf.get(parentId) ?? [] : [];
        await addNode(hubId, roomId, uid, {
          type: 'file', ...spot, content: file.name, file: label, style: DEFAULT_SIZE.file,
          ...(parentId ? { parentId, order: (cards.at(-1)?.order ?? 0) + 1 } : {}),
        });
      } catch (err) {
        setError(err.message || `${file.name} couldn't be added.`);
      } finally {
        setUploads((prev) => prev.filter((u) => u.id !== id));
      }
    }
  }

  // ---------------------------------------------------------- pointers
  const gesture = useRef(null);

  function listAt(point, excluding) {
    for (const n of free) {
      if (n.type !== 'list' || excluding?.has(n.id)) continue;
      const r = rects[n.id];
      if (r && point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return n;
    }
    return null;
  }

  function nodeAt(point, not) {
    // Cards first (they sit on top of their lists), then the rest, last drawn on top.
    const hits = Object.entries(rects).filter(([id, r]) => id !== not && point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
    if (!hits.length) return null;
    return hits.map(([id]) => byId.get(id)).filter(Boolean).sort((a, b) => (b.parentId ? 1 : 0) - (a.parentId ? 1 : 0))[0] ?? null;
  }

  function onStageDown(e) {
    if (e.button === 2) return;
    stage.current.focus({ preventScroll: true });
    const at = toWorld(e.clientX, e.clientY);
    setEdgeSel(null);
    if (editing) setEditing(null);
    if (e.button === 0 && rights.add && ['note', 'text', 'shape', 'list'].includes(tool)) {
      make(tool === 'note' ? 'normal' : tool, at);
      setTool('select');
      return;
    }
    if (e.button === 0 && e.shiftKey && tool === 'select') {
      gesture.current = { kind: 'marquee', start: at };
      setMarquee({ x: at.x, y: at.y, w: 0, h: 0 });
    } else {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    }
    capture(e);
  }

  function onNodeDown(e, node) {
    if (e.button !== 0) return;
    e.stopPropagation();
    stage.current.focus({ preventScroll: true });
    setEdgeSel(null);
    if (editing === node.id) return;
    if (editing) setEditing(null);
    const at = toWorld(e.clientX, e.clientY);
    if (tool === 'arrow' && rights.add) {
      gesture.current = { kind: 'link', from: node.id };
      setLinking({ from: node.id, point: at });
      capture(e);
      return;
    }
    let ids = selected;
    if (e.shiftKey) {
      ids = new Set(selected);
      if (ids.has(node.id)) ids.delete(node.id);
      else ids.add(node.id);
      setSelected(ids);
      return;
    }
    if (!selected.has(node.id)) {
      ids = new Set([node.id]);
      setSelected(ids);
    }
    const moving = [...ids].map((id) => byId.get(id)).filter((n) => n && canModify(n));
    if (!moving.length) return;
    gesture.current = { kind: 'drag', start: at, ids: moving.map((n) => n.id), card: node.parentId ? node.id : null, moved: false };
    capture(e);
  }

  function onLinkStart(e, node) {
    e.stopPropagation();
    e.preventDefault();
    stage.current.focus({ preventScroll: true });
    if (!rights.add) return;
    gesture.current = { kind: 'link', from: node.id };
    setLinking({ from: node.id, point: toWorld(e.clientX, e.clientY) });
    capture(e);
  }

  function onResizeStart(e, node) {
    e.stopPropagation();
    stage.current.focus({ preventScroll: true });
    const r = rects[node.id];
    gesture.current = { kind: 'resize', node, start: toWorld(e.clientX, e.clientY), w: r?.w ?? node.style.width ?? 220, h: r?.h ?? node.style.height ?? 100 };
    capture(e);
  }

  function capture(e) {
    const move = (ev) => onMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onUp(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onMove(e) {
    const g = gesture.current;
    if (!g) return;
    const at = toWorld(e.clientX, e.clientY);
    if (g.kind === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else if (g.kind === 'marquee') {
      setMarquee({ x: Math.min(g.start.x, at.x), y: Math.min(g.start.y, at.y), w: Math.abs(at.x - g.start.x), h: Math.abs(at.y - g.start.y) });
    } else if (g.kind === 'drag') {
      const dx = at.x - g.start.x;
      const dy = at.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) * viewRef.current.s < 4) return;
      g.moved = true;
      const single = g.ids.length === 1 ? byId.get(g.ids[0]) : null;
      const overList = single && DROPPABLE.has(single.type) ? listAt(at, new Set(g.ids)) : null;
      setDrag({ ids: new Set(g.ids), dx, dy, card: g.card, point: at, overList: overList?.id ?? null });
    } else if (g.kind === 'link') {
      const over = nodeAt(at, g.from);
      setLinking({ from: g.from, point: at, over: over?.id ?? null });
    } else if (g.kind === 'resize') {
      const w = clamp(g.w + (at.x - g.start.x) * 2, 60, 4000);
      const h = clamp(g.h + (at.y - g.start.y) * 2, 30, 4000);
      setDrag({ resize: g.node.id, w, h });
    }
  }

  async function onUp(e) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    // Keys keep working after a drag, whatever had focus on the way.
    if (g.kind !== 'pan' || g.moved) stage.current?.focus({ preventScroll: true });
    const at = toWorld(e.clientX, e.clientY);
    if (g.kind === 'pan') {
      if (!g.moved) setSelected(new Set());
    } else if (g.kind === 'marquee') {
      const m = marqueeRef.current;
      setMarquee(null);
      if (m) {
        const hit = free.filter((n) => {
          const r = rects[n.id];
          return r && r.x < m.x + m.w && r.x + r.w > m.x && r.y < m.y + m.h && r.y + r.h > m.y;
        });
        setSelected(new Set(hit.map((n) => n.id)));
      }
    } else if (g.kind === 'drag') {
      setDrag(null);
      if (!g.moved) return;
      const dx = at.x - g.start.x;
      const dy = at.y - g.start.y;
      const moves = [];
      const single = g.ids.length === 1 ? byId.get(g.ids[0]) : null;
      const list = single && DROPPABLE.has(single.type) ? listAt(at, new Set(g.ids)) : null;
      if (single && list) {
        // Into a list, among its cards where it was let go.
        const cards = (cardsOf.get(list.id) ?? []).filter((c) => c.id !== single.id);
        const after = cards.filter((c) => (rects[c.id] ? rects[c.id].y + rects[c.id].h / 2 : 0) < at.y);
        const prev = after.at(-1);
        const next = cards[after.length];
        const order = prev && next ? (prev.order + next.order) / 2 : prev ? prev.order + 1 : next ? next.order - 1 : 1;
        moves.push({ node: single, changes: { parentId: list.id, order } });
      } else if (single?.parentId) {
        // Out of its list, onto the plane.
        moves.push({ node: single, changes: { parentId: null, order: 0, x: at.x, y: at.y } });
      } else {
        for (const id of g.ids) {
          const n = byId.get(id);
          if (n && !n.parentId) moves.push({ node: n, changes: { x: n.x + dx, y: n.y + dy } });
        }
      }
      if (moves.length) await moveNodes(hubId, roomId, uid, moves).catch(() => setError("That move didn't save."));
    } else if (g.kind === 'link') {
      setLinking(null);
      const target = nodeAt(at, g.from);
      if (target && target.id !== g.from) {
        const exists = liveEdges.some((x) => (x.from === g.from && x.to === target.id) || (x.from === target.id && x.to === g.from));
        if (!exists) await addEdge(hubId, roomId, uid, { from: g.from, to: target.id }).catch(() => setError("That arrow couldn't be drawn."));
      }
      setTool('select');
    } else if (g.kind === 'resize') {
      const d = dragRef.current;
      setDrag(null);
      if (d?.resize) {
        const node = g.node;
        const style = node.type === 'shape' || node.type === 'file' ? { width: Math.round(d.w), height: Math.round(d.h) } : { width: Math.round(d.w) };
        if (node.type === 'file' && !node.style.height) delete style.height;
        await patchNode(hubId, roomId, uid, node, { style }).catch(() => setError("That didn't save."));
      }
    }
  }
  const marqueeRef = useRef(null);
  marqueeRef.current = marquee;
  const dragRef = useRef(null);
  dragRef.current = drag;

  // ---------------------------------------------------------- keyboard
  async function removeSelected() {
    if (edgeSel) {
      const edge = liveEdges.find((x) => x.id === edgeSel);
      if (edge && canModifyEdge(edge)) await removeEdge(hubId, roomId, edge.id).catch(() => setError("That arrow couldn't be removed."));
      setEdgeSel(null);
      return;
    }
    const ids = [...selected].filter((id) => byId.has(id) && canModify(byId.get(id)));
    // A list goes with its cards.
    const all = ids.flatMap((id) => [id, ...(cardsOf.get(id) ?? []).filter(canModify).map((c) => c.id)]);
    if (!all.length) return;
    setSelected(new Set());
    await removeNodes(hubId, roomId, [...new Set(all)], liveEdges).catch(() => setError('Some of that couldn’t be removed.'));
  }

  async function duplicate() {
    const picked = [...selected].map((id) => byId.get(id)).filter((n) => n && !n.parentId && n.type !== 'file' && n.type !== 'list');
    const made = [];
    for (const n of picked) {
      const id = newId();
      made.push(id);
      await addNode(hubId, roomId, uid, { id, type: n.type, x: n.x + 30, y: n.y + 30, content: n.content, style: n.style }).catch(() => {});
    }
    if (made.length) setSelected(new Set(made));
  }

  function onKeyDown(e) {
    // Anything on the canvas but a text box being typed in.
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selected.size || edgeSel)) {
      e.preventDefault();
      removeSelected();
    } else if (e.key === 'Escape') {
      setSelected(new Set());
      setEdgeSel(null);
      setTool('select');
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate();
    } else if (mod && e.key === '0') {
      e.preventDefault();
      fit();
    } else if (e.key === '+' || e.key === '=') {
      zoomAt(1.2);
    } else if (e.key === '-') {
      zoomAt(1 / 1.2);
    } else if (e.key === 'Enter' && selected.size === 1) {
      const n = byId.get([...selected][0]);
      if (n && canModify(n) && n.type !== 'file') {
        e.preventDefault();
        setEditing(n.id);
      }
    } else if (!mod && !e.altKey) {
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t && (t.id === 'select' || rights.add)) setTool(t.id);
    }
  }

  // Pasting on the canvas: pictures and files become file notes, words a note.
  function onPaste(e) {
    if (e.target.closest('input, textarea, [contenteditable="true"]') || !rights.add) return;
    const center = toWorld(stage.current.getBoundingClientRect().left + size.w / 2, stage.current.getBoundingClientRect().top + size.h / 2);
    if (e.clipboardData.files.length) {
      e.preventDefault();
      uploadAt(e.clipboardData.files, center);
      return;
    }
    const words = e.clipboardData.getData('text/plain').trim();
    if (words) {
      e.preventDefault();
      make('normal', center, { content: words.slice(0, 20000) }).then(() => setEditing(null));
    }
  }

  // Editing a note tells the Room you're writing.
  useEffect(() => {
    onWriting?.(!!editing);
  }, [editing]);

  const refocus = () => stage.current?.focus({ preventScroll: true });

  async function saveContent(node, content) {
    setEditing(null);
    refocus();
    if (content === node.content) return;
    await patchNode(hubId, roomId, uid, node, { content }).catch(() => setError("That didn't save."));
  }

  const single = selected.size === 1 ? byId.get([...selected][0]) : null;
  const selectedNodes = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const styleable = selectedNodes.filter(canModify);
  const selEdge = edgeSel ? liveEdges.find((x) => x.id === edgeSel) : null;

  async function restyle(style) {
    await Promise.all(styleable.map((n) => patchNode(hubId, roomId, uid, n, { style }))).catch(() => setError("That didn't save."));
  }

  // Drawing positions: what's being dragged follows the pointer.
  const placed = (n) => {
    if (drag?.ids?.has(n.id) && !n.parentId) return { x: n.x + drag.dx, y: n.y + drag.dy };
    return { x: n.x, y: n.y };
  };
  const sizeOf = (n) => (drag?.resize === n.id ? { width: drag.w, height: n.type === 'shape' || (n.type === 'file' && n.style.height) ? drag.h : undefined } : n.style);

  const gridSize = clamp(26 * view.s, 10, 60);
  const draggingCard = drag?.card ? byId.get(drag.card) : null;

  const nodeProps = (n) => ({
    node: n,
    selected: selected.has(n.id),
    editing: editing === n.id,
    canModify: canModify(n),
    canLink: rights.add,
    linkTarget: linking?.over === n.id,
    onDown: (e) => onNodeDown(e, n),
    onDoubleClick: (e) => {
      e.stopPropagation();
      if (canModify(n) && n.type !== 'file') setEditing(n.id);
    },
    onLinkStart: (e) => onLinkStart(e, n),
    onResizeStart: (e) => onResizeStart(e, n),
    onSave: (content) => saveContent(n, content),
    onCancel: () => {
      setEditing(null);
      refocus();
    },
    sizeStyle: sizeOf(n),
  });

  return (
    <div className="cv">
      <div
        ref={stage}
        className={`cv__stage tool-${tool} ${gesture.current?.kind === 'pan' ? 'is-panning' : ''}`}
        tabIndex={0}
        role="application"
        aria-label="Canvas. Drag to move around, scroll to zoom."
        style={{ backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${size.w / 2 + view.x}px ${size.h / 2 + view.y}px` }}
        onPointerDown={onStageDown}
        onDoubleClick={(e) => {
          if (e.target !== stage.current && e.target !== world.current) return;
          if (rights.add) make('normal', toWorld(e.clientX, e.clientY));
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (rights.add && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!rights.add || !e.dataTransfer.files.length) return;
          e.preventDefault();
          const at = toWorld(e.clientX, e.clientY);
          uploadAt(e.dataTransfer.files, at, listAt(at)?.id ?? null);
        }}
      >
        <div ref={world} className="cv__world" style={{ transform: `translate(${size.w / 2 + view.x}px, ${size.h / 2 + view.y}px) scale(${view.s})` }}>
          <Edges
            edges={liveEdges}
            rects={rects}
            scale={view.s}
            selected={edgeSel}
            linking={linking}
            onSelect={(id) => {
              setSelected(new Set());
              setEdgeSel(id);
            }}
            onLabel={(id) => {
              const edge = liveEdges.find((x) => x.id === id);
              if (edge && canModifyEdge(edge)) setLabeling(edge);
            }}
          />
          {free.map((n) => {
            const p = placed(n);
            if (n.type === 'list') {
              return (
                <ListNode
                  key={n.id}
                  {...nodeProps(n)}
                  x={p.x}
                  y={p.y}
                  cards={cardsOf.get(n.id) ?? []}
                  dropTarget={drag?.overList === n.id}
                  hiddenCard={drag?.card}
                  cardProps={nodeProps}
                  canAdd={rights.add}
                  onAddCard={() => addCard(n)}
                />
              );
            }
            return <NodeBox key={n.id} {...nodeProps(n)} x={p.x} y={p.y} />;
          })}
          {draggingCard && drag.point && (
            <div className="cv-node cv-node--ghost" style={{ left: drag.point.x, top: drag.point.y, width: 240 }}>
              <NodeBody node={draggingCard} />
            </div>
          )}
          {uploads.map((u) => (
            <div key={u.id} className="cv-upload" style={{ left: u.x, top: u.y }}>
              <Icon name="upload" size={14} />
              <span className="cv-upload__name">{u.name}</span>
              <span className="cv-upload__bar"><span style={{ width: `${u.progress * 100}%` }} /></span>
              <span className="cv-upload__meta">{Math.round(u.progress * 100)}% of {formatBytes(u.size)}</span>
            </div>
          ))}
          {marquee && <div className="cv-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>

        {nodes.length === 0 && (
          <div className="cv__empty">
            {rights.add ? (
              <>
                <strong>An empty canvas</strong>
                <span>Double-click anywhere for a note, pick a tool on the left, or drop files here.</span>
              </>
            ) : (
              <span>Nothing here yet.</span>
            )}
          </div>
        )}
      </div>

      {rights.add && (
        <div className="cv-tools" role="toolbar" aria-label="Canvas tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cv-tools__btn ${tool === t.id ? 'is-on' : ''}`}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              title={`${t.label} (${t.key.toUpperCase()})`}
              onClick={() => setTool(t.id)}
            >
              <Icon name={t.icon} size={18} />
            </button>
          ))}
          {tool === 'shape' && (
            <div className="cv-tools__shapes" role="radiogroup" aria-label="Shape">
              {SHAPES.map((sh) => (
                <button key={sh} type="button" role="radio" aria-checked={shapeKind === sh} className={`cv-tools__shape ${shapeKind === sh ? 'is-on' : ''}`} title={sh} onClick={() => setShapeKind(sh)}>
                  <ShapeIcon shape={sh} />
                </button>
              ))}
            </div>
          )}
          <span className="cv-tools__rule" />
          <button type="button" className="cv-tools__btn" aria-label="Add files" title="Add files (or drop them anywhere)" onClick={() => fileInput.current.click()}>
            <Icon name="paperclip" size={18} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const r = stage.current.getBoundingClientRect();
              uploadAt(e.target.files, toWorld(r.left + r.width / 2, r.top + r.height / 2));
              e.target.value = '';
            }}
          />
        </div>
      )}

      {(styleable.length > 0 || selEdge) && !editing && (
        <div className="cv-bar" role="toolbar" aria-label="Selection">
          {selEdge ? (
            canModifyEdge(selEdge) ? (
              <>
                {[
                  { head: 'end', label: 'Arrow at the end' },
                  { head: 'both', label: 'Arrows at both ends' },
                  { head: 'none', label: 'No arrowheads' },
                ].map((h) => (
                  <button key={h.head} type="button" className={`cv-bar__btn ${selEdge.head === h.head ? 'is-on' : ''}`} title={h.label} aria-label={h.label} onClick={() => patchEdge(hubId, roomId, selEdge, { head: h.head })}>
                    <HeadIcon head={h.head} />
                  </button>
                ))}
                <button type="button" className={`cv-bar__btn ${selEdge.dash ? 'is-on' : ''}`} title="Dashed" aria-label="Dashed" onClick={() => patchEdge(hubId, roomId, selEdge, { dash: !selEdge.dash })}>
                  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 9h14" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" /></svg>
                </button>
                <span className="cv-bar__rule" />
                {COLORS.map((c) => (
                  <button key={c} type="button" className={`cv-bar__swatch ${(selEdge.color ?? COLORS[0]) === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => patchEdge(hubId, roomId, selEdge, { color: c === COLORS[0] ? null : c })} />
                ))}
                <span className="cv-bar__rule" />
                <button type="button" className="cv-bar__btn cv-bar__btn--text" onClick={() => setLabeling(selEdge)}>Label</button>
                <button type="button" className="cv-bar__btn is-danger" aria-label="Delete arrow" title="Delete (Del)" onClick={removeSelected}>
                  <Icon name="trash" size={16} />
                </button>
              </>
            ) : (
              <span className="cv-bar__note">Only its maker or an editor can change this arrow.</span>
            )
          ) : (
            <>
              {COLORS.map((c) => (
                <button key={c} type="button" className={`cv-bar__swatch ${styleable.every((n) => (n.style.color ?? COLORS[0]) === c) ? 'is-on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => restyle({ color: c === COLORS[0] ? undefined : c })} />
              ))}
              {single?.type === 'shape' && canModify(single) && (
                <>
                  <span className="cv-bar__rule" />
                  {SHAPES.map((sh) => (
                    <button key={sh} type="button" className={`cv-bar__btn ${single.style.shape === sh ? 'is-on' : ''}`} title={sh} aria-label={sh} onClick={() => restyle({ shape: sh })}>
                      <ShapeIcon shape={sh} />
                    </button>
                  ))}
                  <button type="button" className={`cv-bar__btn cv-bar__btn--text ${single.style.fill === false ? '' : 'is-on'}`} onClick={() => restyle({ fill: single.style.fill === false })}>Fill</button>
                </>
              )}
              <span className="cv-bar__rule" />
              {single && rights.add && (
                <button type="button" className="cv-bar__btn" aria-label="Draw an arrow from this" title="Arrow from this (A, then drag)" onClick={() => setTool('arrow')}>
                  <Icon name="arrowRight" size={16} />
                </button>
              )}
              <button type="button" className="cv-bar__btn is-danger" aria-label="Delete" title="Delete (Del)" onClick={removeSelected}>
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </div>
      )}

      <div className="cv-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.2)}>−</button>
        <button type="button" className="cv-zoom__pct" aria-label="Fit everything in" title="Fit everything in (Ctrl 0)" onClick={fit}>
          {Math.round(view.s * 100)}%
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.2)}>+</button>
      </div>

      {!rights.add && <div className="cv-viewonly"><Icon name="eye" size={14} /> View only</div>}

      {error && (
        <div className="cv-error" role="alert">
          {error}
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><Icon name="close" size={14} /></button>
        </div>
      )}

      {labeling && (
        <LabelEditor
          edge={labeling}
          onDone={async (label) => {
            setLabeling(null);
            if (label !== labeling.label) await patchEdge(hubId, roomId, labeling, { label }).catch(() => setError("That label didn't save."));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- notes

function NodeBox({ node, x, y, selected, editing, canModify, canLink, linkTarget, onDown, onDoubleClick, onLinkStart, onResizeStart, onSave, onCancel, sizeStyle }) {
  const width = sizeStyle?.width ?? DEFAULT_SIZE[node.type]?.width;
  const height = node.type === 'shape' ? sizeStyle?.height ?? DEFAULT_SIZE.shape.height : sizeStyle?.height;
  const color = node.style.color;
  return (
    <div
      data-node={node.id}
      className={`cv-node cv-node--${node.type} ${selected ? 'is-selected' : ''} ${linkTarget ? 'is-link-target' : ''} ${color ? 'has-color' : ''}`}
      style={{ left: x, top: y, width, height, '--c': color ?? '#a1a1aa' }}
      onPointerDown={onDown}
      onDoubleClick={onDoubleClick}
    >
      {node.type === 'shape' && <ShapeSvg shape={node.style.shape ?? 'rounded'} fill={node.style.fill !== false} />}
      {editing ? <Editor node={node} onSave={onSave} onCancel={onCancel} /> : <NodeBody node={node} />}
      {canLink && !editing && (
        <button type="button" tabIndex={-1} className="cv-node__link" aria-label="Draw an arrow from here" title="Drag to connect" onPointerDown={onLinkStart}>
          <Icon name="arrowRight" size={11} strokeWidth={2.2} />
        </button>
      )}
      {selected && canModify && !editing && node.type !== 'text' && (
        <span className="cv-node__resize" aria-hidden="true" onPointerDown={onResizeStart} />
      )}
    </div>
  );
}

function NodeBody({ node }) {
  if (node.type === 'file' && node.file) {
    return (
      <div className="cv-node__file cv-scroll">
        <FileCard file={node.file} compact />
      </div>
    );
  }
  if (!node.content) {
    return <span className="cv-node__placeholder">{node.type === 'shape' ? '' : node.type === 'text' ? 'Text' : 'Empty note'}</span>;
  }
  // Markdown, as the app writes notes; everything in it is escaped first.
  return <div className="cv-node__md" dangerouslySetInnerHTML={{ __html: markdownToHtml(node.content) }} />;
}

function Editor({ node, onSave, onCancel, placeholder = 'Write something…', single = false }) {
  const [value, setValue] = useState(node.content);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const Tag = single ? 'input' : 'textarea';
  return (
    <Tag
      ref={ref}
      className={`cv-node__editor ${single ? 'is-single' : ''}`}
      value={value}
      placeholder={placeholder}
      maxLength={single ? 200 : 20000}
      rows={single ? undefined : Math.max(2, value.split('\n').length)}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onSave(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && (single || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSave(value);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- lists

function ListNode({ node, x, y, cards, selected, editing, canModify, canLink, linkTarget, dropTarget, hiddenCard, cardProps, canAdd, onAddCard, onDown, onDoubleClick, onLinkStart, onResizeStart, onSave, onCancel, sizeStyle }) {
  const color = node.style.color;
  return (
    <div
      data-node={node.id}
      className={`cv-node cv-node--list ${selected ? 'is-selected' : ''} ${dropTarget ? 'is-drop' : ''} ${linkTarget ? 'is-link-target' : ''}`}
      style={{ left: x, top: y, width: sizeStyle?.width ?? DEFAULT_SIZE.list.width, '--c': color ?? '#a1a1aa' }}
      onPointerDown={onDown}
    >
      <div className="cv-list__head" onDoubleClick={onDoubleClick}>
        {color && <span className="cv-list__dot" />}
        {editing ? (
          <Editor node={node} single placeholder="List name" onSave={onSave} onCancel={onCancel} />
        ) : (
          <span className="cv-list__title">{node.content || 'Untitled list'}</span>
        )}
        <span className="cv-list__count">{cards.length}</span>
      </div>
      <div className="cv-list__cards">
        {cards.map((c) => {
          const p = cardProps(c);
          if (hiddenCard === c.id) return <div key={c.id} className="cv-card cv-card--gap" />;
          return (
            <div
              key={c.id}
              data-node={c.id}
              className={`cv-card cv-card--${c.type} ${p.selected ? 'is-selected' : ''} ${p.linkTarget ? 'is-link-target' : ''} ${c.style.color ? 'has-color' : ''}`}
              style={{ '--c': c.style.color ?? '#a1a1aa' }}
              onPointerDown={p.onDown}
              onDoubleClick={p.onDoubleClick}
            >
              {p.editing ? <Editor node={c} onSave={p.onSave} onCancel={p.onCancel} /> : <NodeBody node={c} />}
              {canLink && !p.editing && (
                <button type="button" tabIndex={-1} className="cv-node__link" aria-label="Draw an arrow from here" title="Drag to connect" onPointerDown={p.onLinkStart}>
                  <Icon name="arrowRight" size={11} strokeWidth={2.2} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {canAdd && (
        <button
          type="button"
          className="cv-list__add"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onAddCard();
          }}
        >
          <Icon name="plus" size={14} /> Add a card
        </button>
      )}
      {canLink && !editing && (
        <button type="button" tabIndex={-1} className="cv-node__link" aria-label="Draw an arrow from this list" title="Drag to connect" onPointerDown={onLinkStart}>
          <Icon name="arrowRight" size={11} strokeWidth={2.2} />
        </button>
      )}
      {selected && canModify && !editing && <span className="cv-node__resize" aria-hidden="true" onPointerDown={onResizeStart} />}
    </div>
  );
}

// ---------------------------------------------------------------- arrows

function Edges({ edges, rects, scale, selected, linking, onSelect, onLabel }) {
  const gap = 4 / scale;
  const lines = edges.map((e) => {
    const a = rects[e.from];
    const b = rects[e.to];
    if (!a || !b) return null;
    const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2, gap);
    const p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2, gap);
    return { e, p1, p2 };
  }).filter(Boolean);
  let preview = null;
  if (linking?.point && rects[linking.from]) {
    const a = rects[linking.from];
    const target = linking.over && rects[linking.over];
    const end = target ? edgePoint(target, a.x + a.w / 2, a.y + a.h / 2, gap) : linking.point;
    const start = edgePoint(a, end.x, end.y, gap);
    preview = { start, end };
  }
  const head = 10 / Math.max(scale, 0.4);
  return (
    <svg className="cv-edges" width="1" height="1" aria-hidden={!lines.length}>
      <defs>
        <marker id="cv-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={head} markerHeight={head} markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="context-stroke" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {lines.map(({ e, p1, p2 }) => {
        const color = e.color ?? '#71717a';
        const on = selected === e.id;
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        return (
          <g key={e.id} className={`cv-edge ${on ? 'is-selected' : ''}`}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={on ? '#e4e4e7' : color}
              strokeWidth={on ? 2.2 : 1.6}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={e.dash ? '6 5' : undefined}
              markerEnd={e.head !== 'none' ? 'url(#cv-head)' : undefined}
              markerStart={e.head === 'both' ? 'url(#cv-head)' : undefined}
            />
            <line
              className="cv-edge__hit"
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              strokeWidth={16 / scale}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelect(e.id);
              }}
              onDoubleClick={(ev) => {
                ev.stopPropagation();
                onLabel(e.id);
              }}
            />
            {e.label && (
              <text x={mid.x} y={mid.y - 8 / scale} fontSize={12 / scale} className="cv-edge__label" textAnchor="middle" strokeWidth={4 / scale}>
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {preview && (
        <line x1={preview.start.x} y1={preview.start.y} x2={preview.end.x} y2={preview.end.y} stroke="#a1a1aa" strokeWidth="1.6" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" markerEnd="url(#cv-head)" />
      )}
    </svg>
  );
}

function LabelEditor({ edge, onDone }) {
  const [value, setValue] = useState(edge.label);
  return (
    <form
      className="cv-label"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value.trim());
      }}
    >
      <label>
        Arrow label
        <input autoFocus value={value} maxLength={200} placeholder="e.g. leads to, blocks, next" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onDone(edge.label)} />
      </label>
      <button type="submit">Save</button>
    </form>
  );
}

// ---------------------------------------------------------------- shapes

const SHAPE_PATHS = {
  rectangle: (w, h) => `M1 1H${w - 1}V${h - 1}H1Z`,
  rounded: (w, h) => {
    const r = Math.min(16, w / 4, h / 4);
    return `M${r} 1H${w - r}Q${w - 1} 1 ${w - 1} ${r}V${h - r}Q${w - 1} ${h - 1} ${w - r} ${h - 1}H${r}Q1 ${h - 1} 1 ${h - r}V${r}Q1 1 ${r} 1Z`;
  },
  pill: (w, h) => {
    const r = Math.min(w, h) / 2;
    return `M${r} 1H${w - r}A${r - 1} ${r - 1} 0 0 1 ${w - r} ${h - 1}H${r}A${r - 1} ${r - 1} 0 0 1 ${r} 1Z`;
  },
  ellipse: (w, h) => `M${w / 2} 1A${w / 2 - 1} ${h / 2 - 1} 0 1 1 ${w / 2 - 0.01} 1Z`,
  diamond: (w, h) => `M${w / 2} 1L${w - 1} ${h / 2}L${w / 2} ${h - 1}L1 ${h / 2}Z`,
  triangle: (w, h) => `M${w / 2} 1L${w - 1} ${h - 1}H1Z`,
};

function ShapeSvg({ shape, fill }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 170, h: 110 });
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBox({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <svg ref={ref} className="cv-shape" width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} aria-hidden="true">
      <path d={(SHAPE_PATHS[shape] ?? SHAPE_PATHS.rounded)(box.w, box.h)} className={fill ? 'is-filled' : ''} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ShapeIcon({ shape }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 14" aria-hidden="true">
      <path d={(SHAPE_PATHS[shape] ?? SHAPE_PATHS.rounded)(18, 14)} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HeadIcon({ head }) {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9h14" />
      {head !== 'none' && <path d="M13 5l4 4-4 4" />}
      {head === 'both' && <path d="M7 5L3 9l4 4" />}
    </svg>
  );
}
