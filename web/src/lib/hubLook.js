// A Hub's look (an icon, a banner, a background - a picture or panels) and
// which of its pages are kept for whom. Pure: what the record holds, made
// safe to draw, and who may see a page. The rules (hubFields, canSeePage in
// the app's firestore.rules) check the same.
import { normalizeCrop } from './profileShapes.js';
import { normalizeDividers, normalizePanels } from './panels.js';

/** The Hub's pages, in the order its tabs go. */
export const PAGES = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'board', label: 'Board' },
  { id: 'clips', label: 'Clips' },
  { id: 'files', label: 'Files' },
  { id: 'pledged', label: 'Pledged' },
  { id: 'rules', label: 'Rules' },
];
export const PAGE_IDS = PAGES.map((p) => p.id);

/** Who may see: the words a Room's access uses, as levels. */
export const WHO = ['everyone', 'pledged', 'mods', 'owner'];
const NEED = { everyone: 0, pledged: 1, mods: 2, owner: 3 };

export const MAX_PICTURE_LINK = 500;
const HTTPS = /^https:\/\/\S+$/;
const INLINE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;

/** A picture as the rules take it: an https link, or a small inline still. Else null. */
export function cleanPicture(value, maxInline = 250000) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (HTTPS.test(v) && v.length <= MAX_PICTURE_LINK) return v;
  if (INLINE.test(v) && v.length <= maxInline) return v;
  return null;
}

export const isVideoLink = (src) => typeof src === 'string' && VIDEO.test(src);

/** Panels as the site draws them: only https pictures, the app's shapes otherwise. */
export function cleanHubPanels(panels) {
  return normalizePanels(panels).map((panel) => (HTTPS.test(panel.src) ? panel : { ...panel, src: '' }));
}

/** The pages map as kept: known pages, known words, nothing else. */
export function cleanPages(pages) {
  const out = {};
  if (!pages || typeof pages !== 'object') return out;
  for (const id of PAGE_IDS) if (WHO.includes(pages[id]) && pages[id] !== 'everyone') out[id] = pages[id];
  return out;
}

const num = (value, fallback, low, high) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback);

/** The look, from a Hub record (missing pieces are their defaults). */
export function cleanHubLook(data) {
  const bgMode = ['none', 'image', 'panels'].includes(data?.bgMode) ? data.bgMode : (cleanPicture(data?.background) ? 'image' : 'none');
  return {
    icon: cleanPicture(data?.icon, 200000),
    banner: cleanPicture(data?.banner),
    bannerCrop: data?.bannerCrop ? normalizeCrop(data.bannerCrop) : null,
    background: cleanPicture(data?.background),
    backgroundCrop: data?.backgroundCrop ? normalizeCrop(data.backgroundCrop) : null,
    backgroundDim: num(data?.backgroundDim, 0, 0, 0.9),
    bgMode,
    bgPanels: cleanHubPanels(data?.bgPanels),
    bgDividers: normalizeDividers(data?.bgDividers),
    bgPanelGap: num(data?.bgPanelGap, 1.2, 0, 12),
    bgPanelLineColor: HEX.test(data?.bgPanelLineColor || '') ? data.bgPanelLineColor : '#000000',
    pages: cleanPages(data?.pages),
  };
}

/** Whether a Hub draws anything behind its page. */
export const hasBackdrop = (look) =>
  (look.bgMode === 'image' && !!look.background) || (look.bgMode === 'panels' && look.bgPanels.some((p) => p.src));

/**
 * Whether someone at `level` (data/rooms.js levelIn: -1 signed out, 0
 * signed in, 1 pledged, 2 mod, 3 owner) may see a page of the Hub.
 */
export function canSeePage(look, page, level) {
  const who = look?.pages?.[page] ?? 'everyone';
  return who === 'everyone' || level >= NEED[who];
}

/** The tabs someone may see, in order. */
export const visiblePages = (look, level) => PAGES.filter((p) => canSeePage(look, p.id, level));

/** What the pages map looks like after one page is set. 'everyone' takes the entry away. */
export function withPage(pages, page, who) {
  const next = { ...cleanPages(pages) };
  if (!PAGE_IDS.includes(page)) return next;
  if (!WHO.includes(who) || who === 'everyone') delete next[page];
  else next[page] = who;
  return next;
}
