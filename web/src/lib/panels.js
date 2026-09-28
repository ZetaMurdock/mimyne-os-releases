/**
 * Panels: a background cut into regions by lines, each region with its own
 * picture and crop, one picture spread across several (a span), and the
 * symmetry moves. A Hub's background can be laid out this way, the way the
 * app's home screen is (a Hub owner sets it up in the app's designer; the
 * site draws it, components/PanelBackground.jsx).
 *
 * A COPY of the pure part of the app's src/runtime/mediaLibrary.js (the
 * app's is the original; its test in the app compares the two, so a change
 * to one is caught until it reaches the other). Sources here are https
 * links, never paths on a disk.
 */


export const MEDIA_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif']);
/** Enough for a line-up; past this a background is a collage, not a backdrop. */
export const MAX_BACKGROUND_PANELS = 16;

/**
 * A stored source turned into something an <img> can load.
 *
 * `convert` is injected so this is testable and so a browser build, which has
 * no asset protocol, degrades to returning the path rather than throwing.
 * Left out, it is the app's own (runtime/mediaSource.js): a caller that
 * forgot to pass one used to get the bare path back, and an <img> given
 * "C:\Users\..." draws a broken-picture icon - the widget editor did exactly
 * that for every front chosen from this computer. `null` still means "no
 * converter, hand the path back".
 */
export function resolveMediaSrc(src, convert = null) {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) return '';
  // Already loadable: a blob, an inline image, or a link.
  if (/^(blob:|data:|https?:)/i.test(value)) return value;
  try {
    return convert ? convert(value) : value;
  } catch {
    return '';
  }
}

/**
 * Panels by POSITION, capped, each with a stable key for React.
 *
 * An empty panel is kept as an empty entry rather than dropped. Dropping them
 * renumbered everything after it: adding a picture to the fourth region while
 * the first three were empty made it the first region's picture, because the
 * array collapsed to one item and the fourth panel read index 3 of a list of
 * one. Position IS the meaning here.
 */
export const MAX_CROP_ZOOM = 5;

/**
 * Which part of a picture shows in its region: the point of the picture that
 * sits in the middle of the frame (percent), and how far it is zoomed in.
 * Nothing saved means the middle, not zoomed - how every panel looked before.
 */
export function normalizeCrop(crop) {
  const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return {
    x: Math.min(100, Math.max(0, num(crop?.x, 50))),
    y: Math.min(100, Math.max(0, num(crop?.y, 50))),
    zoom: Math.min(MAX_CROP_ZOOM, Math.max(1, num(crop?.zoom, 1))),
  };
}

export function normalizePanels(panels, max = MAX_BACKGROUND_PANELS) {
  if (!Array.isArray(panels)) return [];
  return panels.slice(0, max).map((panel, index) => {
    const raw = typeof panel === 'string' ? panel : panel?.src;
    const src = typeof raw === 'string' ? raw.trim() : '';
    const out = { id: panel?.id || `panel-${index}`, src };
    if (panel && typeof panel === 'object' && panel.crop) out.crop = normalizeCrop(panel.crop);
    // One picture spread across several regions: the members share a span.
    if (src && typeof panel?.span === 'string' && SPAN_ID.test(panel.span)) out.span = panel.span;
    return out;
  });
}

const SPAN_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The regions that share a picture with this one - its span - itself
 * included; just itself when it stands alone.
 */
export function spanMembers(panels, index) {
  const pictures = normalizePanels(panels);
  const span = pictures[index]?.span;
  if (!span) return [index];
  return pictures.map((panel, i) => (panel.span === span ? i : -1)).filter((i) => i >= 0);
}

/** A span left with one member is no span: the picture is simply that region's. */
export function tidyPanelSpans(panels) {
  const pictures = normalizePanels(panels);
  const counts = {};
  for (const panel of pictures) if (panel.span) counts[panel.span] = (counts[panel.span] || 0) + 1;
  return pictures.map((panel) => {
    if (!panel.span || counts[panel.span] >= 2) return panel;
    const { span, ...own } = panel;
    return own;
  });
}

/**
 * One picture spread across several regions, the way a poster goes across
 * workspace cards: every member gets the picture and the same span, each
 * shows its own part of it, and one crop frames the whole. A region leaves
 * whatever span it was in. Fewer than two members is no spread at all.
 */
export function withPanelSpan(panels, members, src, id = `span-${Date.now()}`) {
  const next = [...normalizePanels(panels)];
  const picked = [...new Set((Array.isArray(members) ? members : [])
    .filter((index) => Number.isInteger(index) && index >= 0 && index < MAX_BACKGROUND_PANELS))].sort((a, b) => a - b);
  if (picked.length < 2 || typeof src !== 'string' || !src.trim()) return next;
  while (next.length <= picked[picked.length - 1]) next.push({ id: `panel-${next.length}`, src: '' });
  for (const index of picked) next[index] = { id: next[index]?.id || `panel-${index}`, src: src.trim(), span: id };
  return tidyPanelSpans(next);
}

/** A region taken out of its span: it keeps the picture, and its crop, as its own. */
export function splitPanelSpan(panels, index) {
  const next = [...normalizePanels(panels)];
  if (!next[index]?.span) return next;
  const { span, ...own } = next[index];
  next[index] = own;
  return tidyPanelSpans(next);
}

/** The box a spread picture fills: around every member region together. */
export function spanPoints(shapes, members) {
  const points = shapes.filter((shape) => members.includes(shape.index)).flatMap((shape) => shape.points);
  return points.length ? points : [[0, 0], [100, 0], [100, 100], [0, 100]];
}

/** Whether anything has actually been put in a panel yet. */
export function hasAnyPanelPicture(panels) {
  return normalizePanels(panels).some((panel) => panel.src);
}

/**
 * A divider is a line across the screen, held as where it crosses the TOP and
 * where it crosses the BOTTOM, both as a percentage of the width.
 *
 * Two endpoints rather than a position and an angle, because that is what the
 * editor manipulates: drag the middle and both ends move, drag one end and the
 * line rotates, and there is no trigonometry between what the hand does and
 * what is stored. A vertical line is simply top === bottom.
 */
export const MAX_DIVIDERS = MAX_BACKGROUND_PANELS - 1;

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value) || 0));

/** Usable dividers, clamped and ordered left to right. */
export function normalizeDividers(dividers, max = MAX_DIVIDERS) {
  if (!Array.isArray(dividers)) return [];
  return dividers
    .filter((divider) => divider && (
      divider.ax !== undefined || divider.top !== undefined || divider.bottom !== undefined
    ))
    .map((divider, index) => {
      // The old shape held only where a line crossed the top and the bottom:
      // every line ran the full height. An end can sit on ANY edge now, so a
      // line can lie down and regions can close into boxes.
      if (divider.ax === undefined) {
        return {
          id: divider.id || `divider-${index}`,
          ax: clampPercent(divider.top ?? divider.bottom), ay: 0,
          bx: clampPercent(divider.bottom ?? divider.top), by: 100,
        };
      }
      return {
        id: divider.id || `divider-${index}`,
        ax: clampPercent(divider.ax), ay: clampPercent(divider.ay),
        bx: clampPercent(divider.bx), by: clampPercent(divider.by),
      };
    })
    .slice(0, max);
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Shoelace, in percent^2 (the whole screen is 10,000). */
function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

const BORDER = Object.freeze([
  { ax: 0, ay: 0, bx: 100, by: 0 },
  { ax: 100, ay: 0, bx: 100, by: 100 },
  { ax: 100, ay: 100, bx: 0, by: 100 },
  { ax: 0, ay: 100, bx: 0, by: 0 },
]);

function nearestPointOnSegment(px, py, s) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return { x: s.ax, y: s.ay };
  const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  return { x: s.ax + t * dx, y: s.ay + t * dy };
}

/**
 * Where a dragged end may land: the screen's border, or ANY OTHER LINE. A
 * line that ends on its neighbour stops there instead of crossing it, which
 * is what lets lines close a region in - a box is four ends meeting.
 */
export function nearestAnchorPoint(x, y, otherSegments = []) {
  const px = clampPercent(x);
  const py = clampPercent(y);
  let best = null;
  for (const segment of [...BORDER, ...otherSegments]) {
    const point = nearestPointOnSegment(px, py, segment);
    const d = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (!best || d < best.d) best = { d, point };
  }
  return { x: round2(best.point.x), y: round2(best.point.y) };
}

/** The closest point on the screen's border alone. */
export function nearestEdgePoint(x, y) {
  return nearestAnchorPoint(x, y, []);
}

/** Where the ray from `from` through `through` first hits a wall beyond `through`. */
function rayHit(from, through, walls) {
  const dx = through.x - from.x;
  const dy = through.y - from.y;
  let best = null;
  for (const wall of walls) {
    const wx = wall.bx - wall.ax;
    const wy = wall.by - wall.ay;
    const det = dx * wy - dy * wx;
    if (Math.abs(det) < 1e-9) continue;
    const t = ((wall.ax - from.x) * wy - (wall.ay - from.y) * wx) / det;
    const u = ((wall.ax - from.x) * dy - (wall.ay - from.y) * dx) / det;
    if (t > 1.000001 && u >= -1e-6 && u <= 1.000001) {
      if (!best || t < best.t) best = { t, x: from.x + t * dx, y: from.y + t * dy };
    }
  }
  return best ? { x: round2(best.x), y: round2(best.y) } : { x: through.x, y: through.y };
}

const TOUCH = 0.75;

/**
 * The dividers as the WALLS they really are: every end sits exactly on the
 * border or on another line. An end left hanging - its line moved away from
 * under it - grows along its own direction until it reaches the next wall,
 * so the layout never springs a leak.
 */
export function anchoredDividers(dividers) {
  const stored = normalizeDividers(dividers).filter((line) => (
    Math.abs(line.ax - line.bx) > 0.5 || Math.abs(line.ay - line.by) > 0.5
  ));
  return stored.map((line) => {
    const others = stored.filter((other) => other.id !== line.id);
    const walls = [...BORDER, ...others];
    const anchorEnd = (end, otherEnd) => {
      let best = null;
      for (const wall of walls) {
        const point = nearestPointOnSegment(end.x, end.y, wall);
        const d = Math.hypot(point.x - end.x, point.y - end.y);
        if (!best || d < best.d) best = { d, point };
      }
      if (best && best.d <= TOUCH) return { x: round2(best.point.x), y: round2(best.point.y) };
      return rayHit(otherEnd, end, walls);
    };
    const a = anchorEnd({ x: line.ax, y: line.ay }, { x: line.bx, y: line.by });
    const b = anchorEnd({ x: line.bx, y: line.by }, { x: line.ax, y: line.ay });
    return { ...line, ax: a.x, ay: a.y, bx: b.x, by: b.y };
  });
}

/** Shortest line a divider may be, in percent of the screen. */
export const MIN_DIVIDER_LENGTH = 8;
/** How close a line may run alongside the border or another line, in percent. */
export const MIN_WALL_GAP = 2.5;
// Within about 10 degrees of a wall's direction counts as running along it.
const PARALLEL_SINE = 0.18;

function distanceToSegment(x, y, segment) {
  const point = nearestPointOnSegment(x, y, segment);
  return Math.hypot(point.x - x, point.y - y);
}

/**
 * Why a line cannot stand where it is among the other lines, or null when it
 * can. The three ways a line was being broken:
 *   'short'    both ends nearly together - the line vanished but stayed saved
 *   'on-wall'  both ends on the same wall - lying along the border or
 *              another line, splitting nothing
 *   'stacked'  running alongside a wall, too close - a line on top of a line,
 *              which traced triangles and sliver panels
 */
export function dividerProblem(line, others = []) {
  const length = Math.hypot(line.bx - line.ax, line.by - line.ay);
  if (!Number.isFinite(length) || length < MIN_DIVIDER_LENGTH) return 'short';
  const walls = [...BORDER, ...others];
  for (const wall of walls) {
    if (distanceToSegment(line.ax, line.ay, wall) < MIN_WALL_GAP && distanceToSegment(line.bx, line.by, wall) < MIN_WALL_GAP) {
      return 'on-wall';
    }
  }
  for (const wall of walls) {
    const wallLength = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
    if (wallLength < 1e-9) continue;
    const cross = Math.abs((line.bx - line.ax) * (wall.by - wall.ay) - (line.by - line.ay) * (wall.bx - wall.ax));
    if (cross / (length * wallLength) > PARALLEL_SINE) continue;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = line.ax + (line.bx - line.ax) * t;
      const y = line.ay + (line.by - line.ay) * t;
      if (distanceToSegment(x, y, wall) < MIN_WALL_GAP) return 'stacked';
    }
  }
  return null;
}

/**
 * Saved lines, with every one that cannot stand dropped - so a layout broken
 * before these rules existed (or edited by hand) loads whole, not broken.
 * Lines are kept in order; each is checked against the ones already kept.
 */
export function solidDividers(dividers) {
  const list = normalizeDividers(dividers);
  // Where every line really runs, worked out once against ALL the lines: a
  // line ending on one saved after it still ends there, whatever the order
  // the lines were drawn in.
  const walls = anchoredDividers(list);
  const kept = [];
  const seen = new Set();
  for (const line of list) {
    if (seen.has(line.id)) continue;
    if (dividerProblem(line, walls.filter((wall) => seen.has(wall.id)))) continue;
    seen.add(line.id);
    kept.push(line);
  }
  return kept;
}

function centroidOf(points) {
  return points.reduce((sum, [x, y]) => [sum[0] + x / points.length, sum[1] + y / points.length], [0, 0]);
}

function pointInPolygon([x, y], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A saved layout made whole: broken lines dropped (solidDividers) and the
 * pictures moved with them. Pictures belong to panels by number, and
 * dropping a line merges the panels either side of it - so each panel of
 * the whole layout takes the picture of the biggest old panel it swallowed,
 * instead of every picture after the gap sliding into its neighbour.
 */
export function solidLayout(dividers, panels) {
  const before = normalizeDividers(dividers);
  const solid = solidDividers(before);
  const pictures = normalizePanels(panels);
  if (solid.length === before.length) return { dividers: solid, panels: pictures, changed: false };
  const oldShapes = dividerPanels(before).map((shape) => ({
    ...shape, centre: centroidOf(shape.points), area: Math.abs(polygonArea(shape.points)),
  }));
  const next = [];
  for (const shape of dividerPanels(solid)) {
    const within = oldShapes.filter((old) => pointInPolygon(old.centre, shape.points));
    const pool = (within.length ? within : oldShapes)
      .filter((old) => pictures[old.index]?.src)
      .sort((a, b) => b.area - a.area);
    const picture = pool.length ? pictures[pool[0].index] : null;
    next[shape.index] = picture ? { ...picture, id: `panel-${shape.index}` } : { id: `panel-${shape.index}`, src: '' };
  }
  for (let index = 0; index < next.length; index++) if (!next[index]) next[index] = { id: `panel-${index}`, src: '' };
  return { dividers: solid, panels: next, changed: true };
}

// --------------------------------------------------------------- symmetry

/** Two lines are the same line when their ends meet, either way round. */
function sameLine(p, q, within = TOUCH) {
  const near = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2) <= within;
  return (near(p.ax, p.ay, q.ax, q.ay) && near(p.bx, p.by, q.bx, q.by))
    || (near(p.ax, p.ay, q.bx, q.by) && near(p.bx, p.by, q.ax, q.ay));
}

/** A line reflected across the screen's middle: left to right ('x') or top to bottom ('y'). */
export function reflectDivider(line, axis) {
  return axis === 'x'
    ? { ...line, ax: round2(100 - line.ax), bx: round2(100 - line.bx) }
    : { ...line, ay: round2(100 - line.ay), by: round2(100 - line.by) };
}

const reflectPoint = ([x, y], axis) => (axis === 'x' ? [100 - x, y] : [x, 100 - y]);
const middleOf = (line) => [(line.ax + line.bx) / 2, (line.ay + line.by) / 2];

/**
 * Pictures carried from one layout to another by where they were: each new
 * region takes the picture of the old region whose centre it holds, the
 * biggest when it holds several. With `reflect`, the centres of the old
 * regions that `source` picks are reflected across that axis and count too,
 * and win over one that merely stayed - that is how a mirrored half brings
 * its pictures across; with `originals` off, only the reflections count,
 * which is a flip.
 */
export function carryPanels(oldDividers, newDividers, panels, { reflect = null, source = () => true, originals = true } = {}) {
  const pictures = normalizePanels(panels);
  const olds = dividerPanels(oldDividers)
    .map((shape) => ({ index: shape.index, centre: centroidOf(shape.points), area: Math.abs(polygonArea(shape.points)) }))
    .filter((old) => pictures[old.index]?.src);
  const candidates = [];
  for (const old of olds) {
    if (originals) candidates.push({ ...old, point: old.centre, mirrored: false });
    if (reflect && source(old.centre)) candidates.push({ ...old, point: reflectPoint(old.centre, reflect), mirrored: true });
  }
  const next = [];
  for (const shape of dividerPanels(newDividers)) {
    const within = candidates
      .filter((candidate) => pointInPolygon(candidate.point, shape.points))
      .sort((a, b) => Number(b.mirrored) - Number(a.mirrored) || b.area - a.area);
    const picture = within.length ? pictures[within[0].index] : null;
    next[shape.index] = picture ? { ...picture, id: `panel-${shape.index}` } : { id: `panel-${shape.index}`, src: '' };
  }
  return next;
}

export const SYMMETRIES = Object.freeze([
  'mirror-left', 'mirror-right', 'mirror-top', 'mirror-bottom', 'even-columns', 'even-rows', 'flip-x', 'flip-y',
]);

const onEdge = (value) => value <= TOUCH || value >= 100 - TOUCH;

/**
 * The layout made symmetric, or evened out, in one move:
 *
 *   mirror-left    the left half is the source: the right becomes its mirror
 *   mirror-right   the other way round
 *   mirror-top     the top half is the source
 *   mirror-bottom  the other way round
 *   even-columns   the full-height lines, spaced equally across
 *   even-rows      the full-width lines, spaced equally down
 *   flip-x         the whole layout reflected left to right
 *   flip-y         the whole layout reflected top to bottom
 *
 * A line belongs to a half by its middle, so one across the middle is kept
 * and is its own mirror. Every line keeps its id; a mirrored line takes its
 * source's with '-mirror' on the end (and off again when mirrored back), so
 * mirroring a symmetric layout adds nothing. Anything that could not stand
 * is dropped (solidDividers), and the pictures follow their regions:
 * mirrored across, reflected with a flip, and left where they are when the
 * lines only slide.
 */
export function applySymmetry(action, dividers, panels) {
  const before = normalizeDividers(dividers);
  const pictures = normalizePanels(panels);
  if (!SYMMETRIES.includes(action) || before.length === 0) return { dividers: before, panels: pictures };

  if (action === 'even-columns' || action === 'even-rows') {
    const columns = action === 'even-columns';
    const walls = anchoredDividers(before);
    // Full-span lines only: both ends on the top and bottom (a column line) or the left and right (a row line).
    const full = walls.filter((wall) => (columns
      ? onEdge(wall.ay) && onEdge(wall.by) && Math.abs(wall.ay - wall.by) > 50
      : onEdge(wall.ax) && onEdge(wall.bx) && Math.abs(wall.ax - wall.bx) > 50));
    const axis = columns ? 0 : 1;
    full.sort((p, q) => middleOf(p)[axis] - middleOf(q)[axis]);
    const step = 100 / (full.length + 1);
    const moved = new Map(full.map((wall, index) => [wall.id, step * (index + 1) - middleOf(wall)[axis]]));
    const after = before.map((line) => {
      if (!moved.has(line.id)) return line;
      const shift = moved.get(line.id);
      return columns
        ? { ...line, ax: round2(line.ax + shift), bx: round2(line.bx + shift) }
        : { ...line, ay: round2(line.ay + shift), by: round2(line.by + shift) };
    });
    // The lines only slid, so every region keeps its picture.
    return { dividers: solidDividers(after), panels: pictures };
  }

  if (action === 'flip-x' || action === 'flip-y') {
    const axis = action === 'flip-x' ? 'x' : 'y';
    const after = solidDividers(before.map((line) => reflectDivider(line, axis)));
    return { dividers: after, panels: carryPanels(before, after, pictures, { reflect: axis, originals: false }) };
  }

  const axis = action === 'mirror-left' || action === 'mirror-right' ? 'x' : 'y';
  const source = action === 'mirror-left' ? ([x]) => x <= 50
    : action === 'mirror-right' ? ([x]) => x >= 50
      : action === 'mirror-top' ? ([, y]) => y <= 50
        : ([, y]) => y >= 50;
  const sources = before.filter((line) => source(middleOf(line)));
  const mirrors = sources.map((line) => ({
    ...reflectDivider(line, axis),
    id: line.id.endsWith('-mirror') ? line.id.slice(0, -'-mirror'.length) : `${line.id}-mirror`,
  }));
  const merged = [];
  const ids = new Set();
  for (const line of [...sources, ...mirrors]) {
    if (merged.some((kept) => sameLine(kept, line))) continue;
    let { id } = line;
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    merged.push({ ...line, id });
  }
  const after = solidDividers(merged).slice(0, MAX_DIVIDERS);
  return { dividers: after, panels: carryPanels(before, after, pictures, { reflect: axis, source }) };
}

/** Crossing point of two segments, if they genuinely cross or touch. */
function segmentCross(s1, s2) {
  const dx1 = s1.bx - s1.ax;
  const dy1 = s1.by - s1.ay;
  const dx2 = s2.bx - s2.ax;
  const dy2 = s2.by - s2.ay;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((s2.ax - s1.ax) * dy2 - (s2.ay - s1.ay) * dx2) / det;
  const u = ((s2.ax - s1.ax) * dy1 - (s2.ay - s1.ay) * dx1) / det;
  const EPS = 1e-6;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { t: Math.max(0, Math.min(1, t)), x: s1.ax + t * dx1, y: s1.ay + t * dy1 };
}

const QUANT = 0.05;
const vertexKey = (x, y) => `${Math.round(x / QUANT)}|${Math.round(y / QUANT)}`;

/**
 * The regions the walls enclose, by walking the wall graph.
 *
 * Cut every wall where another touches it, then from each piece walk "keep
 * turning the same way at every meeting point" until back at the start: each
 * walk traces one region, and the one that traced the outside of the screen
 * is dropped. This is what lets a line STOP at another line - a T-junction
 * splits only the side it actually reaches.
 */
function traceRegions(walls) {
  const vertices = new Map();
  const vertexAt = (x, y) => {
    const key = vertexKey(x, y);
    if (!vertices.has(key)) vertices.set(key, { x: round2(x), y: round2(y), out: [] });
    return vertices.get(key);
  };

  const halfEdges = [];
  for (const wall of walls) {
    const cuts = [0, 1];
    for (const other of walls) {
      if (other === wall) continue;
      const hit = segmentCross(wall, other);
      if (hit) cuts.push(hit.t);
    }
    cuts.sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i + 1] - cuts[i] < 1e-4) continue;
      const from = vertexAt(wall.ax + cuts[i] * (wall.bx - wall.ax), wall.ay + cuts[i] * (wall.by - wall.ay));
      const to = vertexAt(wall.ax + cuts[i + 1] * (wall.bx - wall.ax), wall.ay + cuts[i + 1] * (wall.by - wall.ay));
      if (from === to) continue;
      const ahead = { from, to, visited: false, twin: null };
      const back = { from: to, to: from, visited: false, twin: ahead };
      ahead.twin = back;
      halfEdges.push(ahead, back);
      from.out.push(ahead);
      to.out.push(back);
    }
  }

  for (const vertex of vertices.values()) {
    for (const edge of vertex.out) {
      edge.angle = Math.atan2(edge.to.y - edge.from.y, edge.to.x - edge.from.x);
    }
    vertex.out.sort((p, q) => p.angle - q.angle);
  }

  const faces = [];
  for (const start of halfEdges) {
    if (start.visited) continue;
    const points = [];
    let edge = start;
    let steps = 0;
    while (!edge.visited && steps < 10000) {
      edge.visited = true;
      points.push([edge.from.x, edge.from.y]);
      // Arriving at edge.to: leave by the next wall clockwise from the one
      // we came in on, which keeps the region being traced on one side.
      const arrivals = edge.to.out;
      const backAngle = edge.twin.angle;
      let next = null;
      for (const candidate of arrivals) {
        if (candidate === edge.twin) continue;
        const turn = (candidate.angle - backAngle + Math.PI * 2) % (Math.PI * 2);
        if (!next || turn < next.turn) next = { edge: candidate, turn };
      }
      edge = next ? next.edge : edge.twin;
      steps += 1;
    }
    if (points.length >= 3) faces.push(points);
  }
  return faces;
}

/**
 * One way to write each region, whichever way the walk went round it:
 * clockwise on screen, starting from its top-left corner, and without points
 * where the edge just carries straight on (a wall another wall stops against).
 */
function canonicalPolygon(points) {
  let ring = points.slice();
  if (polygonArea(ring) < 0) ring.reverse();
  ring = ring.filter((point, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];
    const cross = (point[0] - prev[0]) * (next[1] - point[1]) - (point[1] - prev[1]) * (next[0] - point[0]);
    return Math.abs(cross) > 1e-6;
  });
  let first = 0;
  ring.forEach(([x, y], i) => {
    const [fx, fy] = ring[first];
    if (y < fy - 1e-6 || (Math.abs(y - fy) <= 1e-6 && x < fx)) first = i;
  });
  return [...ring.slice(first), ...ring.slice(0, first)];
}

/**
 * The regions those lines cut the screen into, as polygons.
 *
 * Regions are numbered top row first, left to right, so an all-upright
 * layout keeps the order it had when lines could only stand.
 *
 * Neighbouring regions share an edge EXACTLY - no gap is left for the line to
 * sit in. A gap measured across the screen is wider than the line's true
 * thickness the further it leans, so gaps came out as wedges; the line is
 * stroked over the seam instead, in pixels, the same thickness at any lean.
 */
export function dividerPanels(dividers) {
  const walls = [...BORDER, ...anchoredDividers(dividers)];
  const faces = traceRegions(walls);

  // Every face is traced once in each orientation; the interiors all share
  // one sign, the whole outside is the lone face of the other.
  const signed = faces.map((points) => ({ points, area: polygonArea(points) }));
  const positive = signed.filter((face) => face.area > 2);
  const negative = signed.filter((face) => face.area < -2);
  const interiors = positive.length >= negative.length ? positive : negative;

  const centred = interiors.map(({ points }) => canonicalPolygon(points)).map((points) => ({
    points,
    cx: points.reduce((total, [x]) => total + x, 0) / points.length,
    cy: points.reduce((total, [, y]) => total + y, 0) / points.length,
  }));
  centred.sort((p, q) => (Math.abs(p.cy - q.cy) < 2 ? p.cx - q.cx : p.cy - q.cy));

  return centred.map((region, index) => ({
    index,
    id: `panel-${index}`,
    points: region.points,
  }));
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToEdges(x, y, points) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

/**
 * Where a region's own button goes: the spot inside it farthest from its
 * edges. Not the average of its corners with the height fixed - regions
 * stacked one above another all got the same height that way, and their
 * buttons sat side by side on one row instead of each in its own space.
 * Works for L-shaped regions too, where an average can fall outside.
 */
export function regionLabelPoint(points) {
  if (!Array.isArray(points) || points.length < 3) return { x: 50, y: 50 };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best = null;
  const STEPS = 24;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const x = minX + ((maxX - minX) * i) / STEPS;
      const y = minY + ((maxY - minY) * j) / STEPS;
      if (!insidePolygon(x, y, points)) continue;
      const d = distanceToEdges(x, y, points);
      if (!best || d > best.d + 1e-9) best = { d, x, y };
    }
  }
  if (!best) {
    return { x: xs.reduce((t, v) => t + v, 0) / xs.length, y: ys.reduce((t, v) => t + v, 0) / ys.length };
  }
  return { x: Math.round(best.x * 100) / 100, y: Math.round(best.y * 100) / 100 };
}

/** A polygon as CSS clip-path wants it. */
export function toClipPath(points) {
  return `polygon(${points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
}

/**
 * Fit the original image to its region, not to the entire screen behind it,
 * showing the part of it the crop chose.
 */
export function panelImageStyle(points, crop) {
  const left = Math.min(...points.map(([x]) => x));
  const right = Math.max(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const bottom = Math.max(...points.map(([, y]) => y));
  const { x, y, zoom } = normalizeCrop(crop);
  const style = {
    position: 'absolute', top: `${top}%`, left: `${left}%`,
    width: `${right - left}%`, height: `${bottom - top}%`, maxWidth: 'none',
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
  };
  if (zoom > 1) {
    style.transform = `scale(${zoom})`;
    style.transformOrigin = `${x}% ${y}%`;
  }
  return style;
}

/**
 * A crop moved by a drag of (dx, dy) pixels over a region (width, height)
 * pixels big. The picture follows the pointer: dragging right shows more of
 * its left side. Zoomed in, the same drag moves it less.
 */
/**
 * The crop as styles for a picture or video that fills its box
 * (object-fit: cover): which point sits in the middle, and the zoom. Empty
 * for no crop, so an uncropped background renders exactly as before.
 */
export function coverCropStyle(crop) {
  if (!crop) return {};
  const { x, y, zoom } = normalizeCrop(crop);
  const style = { objectPosition: `${x}% ${y}%` };
  if (zoom > 1) {
    style.transform = `scale(${zoom})`;
    style.transformOrigin = `${x}% ${y}%`;
  }
  return style;
}

export function panCrop(crop, dx, dy, width, height) {
  const current = normalizeCrop(crop);
  return normalizeCrop({
    ...current,
    x: current.x - (width ? (dx / width) * 100 : 0) / current.zoom,
    y: current.y - (height ? (dy / height) * 100 : 0) / current.zoom,
  });
}

/** Files a card or a panel can show. Video is here for shared covers. */
export const COVER_EXTENSIONS = Object.freeze([...MEDIA_EXTENSIONS, 'mp4', 'webm', 'mov']);

/** Whether a source should be drawn with <video> rather than <img>. */
export function isVideoSource(src) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(String(src || ''));
}

/**
 * Cards that share ONE picture between them, each showing its own part.
 *
 * A group is a list of card ids and the picture they share. The picture is
 * laid over the rectangle the group occupies on screen, and each card shows
 * the part of it that falls inside that card — so four cards side by side read
 * as one image cut into four, and the gaps between them read as cuts.
 */
export function coverGroupFor(groups, widgetId) {
  if (!Array.isArray(groups)) return null;
  return groups.find((group) => Array.isArray(group?.members) && group.members.includes(widgetId)) || null;
}

/** The rectangle a group covers, from the measured cards in it. */
export function groupBounds(members, rects) {
  const boxes = (members || []).map((id) => rects?.[id]).filter(Boolean);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Where to put the shared picture INSIDE one card so the whole group lines up.
 *
 * The media is sized to the group and pushed back by however far this card
 * sits from the group's corner — the card's own overflow does the cutting.
 * Offsets are negative for every card but the top-left one.
 */
export function spanStyleFor(cardRect, bounds) {
  if (!cardRect || !bounds || !bounds.width || !bounds.height) return null;
  return {
    width: bounds.width,
    height: bounds.height,
    // Subtracted this way round on purpose: negating a zero gives -0, which
    // is a different value to 0 for anything comparing exactly.
    left: bounds.left - cardRect.left,
    top: bounds.top - cardRect.top,
  };
}

/** Add or replace a group for these cards, dropping them from any other. */
export function withCoverGroup(groups, members, src, id) {
  const ids = [...new Set((members || []).filter(Boolean))];
  const kept = (Array.isArray(groups) ? groups : [])
    // A card belongs to one group at a time, so joining a new one leaves the old.
    .map((group) => ({ ...group, members: (group.members || []).filter((member) => !ids.includes(member)) }))
    .filter((group) => group.members.length > 1 && group.src);
  if (!src || ids.length < 2) return kept;
  return [...kept, { id: id || `cover-${ids.join('-')}`, src, members: ids }];
}
