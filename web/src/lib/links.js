// Links in what people write: found, sorted by what they point at, and
// previewed. The players are the same ones profiles use (profileShapes.js);
// what an ordinary page says about itself comes from the files Worker's
// /unfurl, since a browser can't read other sites' pages.
import { FILES_URL } from './files.js';
import { auth } from './firebase.js';
import { clipEmbedUrl, musicPlayer } from './profileShapes.js';
import { SHARE_BASE, linkTarget } from './share.js';

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
export const MAX_PREVIEWS = 3;

/** Every link in some text, with where it sits; trailing punctuation left out. */
export function findLinks(text) {
  const found = [];
  for (const m of String(text || '').matchAll(URL_RE)) {
    let url = m[0].replace(/[.,!?;:'"]+$/, '');
    // A closing bracket belongs to the link only if the link opened one.
    while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) url = url.slice(0, -1);
    found.push({ url, index: m.index, length: url.length });
  }
  return found;
}

/** Text in pieces: words, and links to show as links. */
export function linkPieces(text) {
  const pieces = [];
  let at = 0;
  for (const link of findLinks(text)) {
    if (link.index > at) pieces.push({ text: text.slice(at, link.index) });
    pieces.push({ url: link.url });
    at = link.index + link.length;
  }
  if (at < String(text || '').length) pieces.push({ text: text.slice(at) });
  return pieces;
}

/**
 * The text with the links that get a preview taken out (the preview says
 * where it goes; the address shows on hover), and those links.
 */
export function splitLinks(text) {
  const links = [];
  const seen = new Set();
  for (const { url } of findLinks(text)) {
    if (!seen.has(url) && links.length < MAX_PREVIEWS) links.push(url);
    seen.add(url);
  }
  let rest = String(text || '');
  for (const url of links) rest = rest.split(url).join('');
  rest = rest.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { rest, links };
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)$/i;

/** What a link is, for how to preview it. */
export function linkKind(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    return { kind: 'none' };
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'mimyne.com' || link.startsWith(`${SHARE_BASE}/`)) {
    const path = host === 'mimyne.com' ? url.pathname : link.slice(SHARE_BASE.length).split(/[?#]/)[0];
    return linkTarget(path) ? { kind: 'mimyne', path } : { kind: 'page' };
  }
  if (url.protocol === 'https:' && IMAGE.test(url.pathname)) return { kind: 'image' };
  if (url.protocol === 'https:' && VIDEO.test(url.pathname)) return { kind: 'video' };
  if (url.protocol === 'https:' && AUDIO.test(url.pathname)) return { kind: 'audio' };
  const medal = clipEmbedUrl(link);
  if (medal) return { kind: 'embed', provider: 'medal', src: medal, height: 'wide' };
  const player = musicPlayer(link);
  if (player?.provider === 'youtube') {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1];
    return { kind: 'embed', provider: 'youtube', src: player.src, height: 'wide', thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null };
  }
  if (player?.provider === 'spotify') return { kind: 'embed', provider: 'spotify', src: player.src, height: player.playlist ? 352 : 152 };
  if (player?.provider === 'soundcloud') return { kind: 'embed', provider: 'soundcloud', src: player.src, height: player.playlist ? 300 : 166 };
  return { kind: 'page' };
}

// What pages said about themselves, this visit.
const known = new Map();

/** A page's title, line, picture and site, through the files Worker. */
export function unfurl(link) {
  if (!known.has(link)) {
    const ask = (async () => {
      if (!auth.currentUser) return {};
      const res = await fetch(`${FILES_URL}/unfurl?url=${encodeURIComponent(link)}`, {
        headers: { authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      });
      return res.ok ? res.json() : {};
    })().catch(() => ({}));
    known.set(link, ask);
  }
  return known.get(link);
}
