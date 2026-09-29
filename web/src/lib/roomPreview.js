// A Room's canvas in miniature, kept on the Room itself (rooms/<room>.preview)
// so the Rooms grid draws every card from the Room list it already has,
// instead of listening to up to 80 notes per card. The people editing the
// canvas keep it current (HubRooms); it can be a little behind.
//
// The shape: a JSON list of boxes [x, y, w, h, kind, color] in canvas units,
// kind 'b' a box, 'r' a round one, 't' words with no box; color a note's hex
// color or ''. At most PREVIEW_BOXES boxes (the biggest), at most
// PREVIEW_MAX characters, as the rules allow.

export const PREVIEW_BOXES = 40;
export const PREVIEW_MAX = 4000;
const HEX = /^#[0-9a-f]{6}$/i;

/** The boxes a canvas's top-level notes make, sized the way the canvas draws them. */
export function boxesOf(nodes) {
  const all = nodes ?? [];
  return all.filter((n) => !n.parentId).map((n) => {
    const style = n.style ?? {};
    const w = style.width ?? (n.type === 'list' ? 272 : n.type === 'file' ? 280 : 220);
    const cards = all.filter((c) => c.parentId === n.id).length;
    const h = style.height ?? (n.type === 'list' ? 80 + cards * 44 : n.type === 'shape' ? 110 : 70);
    return {
      x: Math.round(n.x - w / 2),
      y: Math.round(n.type === 'list' ? n.y - 24 : n.y - h / 2),
      w: Math.round(w),
      h: Math.round(h),
      kind: n.type === 'text' ? 't' : style.shape === 'ellipse' || style.shape === 'pill' ? 'r' : 'b',
      color: HEX.test(style.color ?? '') ? style.color : '',
    };
  });
}

/** The preview to keep for a canvas: '[]' when it is empty. */
export function previewOf(nodes) {
  let boxes = boxesOf(nodes).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, PREVIEW_BOXES);
  for (;;) {
    const text = JSON.stringify(boxes.map((b) => [b.x, b.y, b.w, b.h, b.kind, b.color]));
    if (text.length <= PREVIEW_MAX || !boxes.length) return text;
    boxes = boxes.slice(0, -1);
  }
}

/** A kept preview back into boxes; null when there is none (or it can't be read). */
export function readPreview(text) {
  if (typeof text !== 'string' || !text) return null;
  let list;
  try {
    list = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  return list.filter(Array.isArray).slice(0, PREVIEW_BOXES).map(([x, y, w, h, kind, color]) => ({
    x: num(x),
    y: num(y),
    w: Math.max(1, num(w)),
    h: Math.max(1, num(h)),
    kind: kind === 't' || kind === 'r' ? kind : 'b',
    color: HEX.test(color ?? '') ? color : '',
  }));
}
