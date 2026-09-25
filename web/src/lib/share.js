// Share links. mimyne.com is one page on GitHub Pages, so a pasted link to a
// Hub or post can't show a preview by itself; the files Worker serves a small
// page of tags for it (files-worker/src/share.js in the app's repo) and sends
// people straight on to mimyne.com.
import { FILES_URL } from './files.js';

export const SHARE_BASE = import.meta.env.VITE_SHARE_URL ?? `${FILES_URL}/s`;

/** The link to hand out for a page on mimyne.com, given its path (/h/<hub>…). */
export const shareUrl = (path) => `${SHARE_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** What a path points at: a Hub, a post, or a profile. */
export function linkTarget(path) {
  let m = path.match(/^\/h\/([a-z0-9-]{3,32})\/p\/([A-Za-z0-9_-]{1,128})$/);
  if (m) return { kind: 'post', hubId: m[1], postId: m[2] };
  m = path.match(/^\/people\/([A-Za-z0-9_-]{1,128})\/p\/([A-Za-z0-9_-]{1,128})$/);
  if (m) return { kind: 'post', profileUid: m[1], postId: m[2] };
  m = path.match(/^\/h\/([a-z0-9-]{3,32})\/?$/);
  if (m) return { kind: 'hub', hubId: m[1] };
  m = path.match(/^\/u\/([A-Za-z0-9_]{3,20})\/?$/);
  if (m) return { kind: 'profile', name: m[1] };
  m = path.match(/^\/people\/([A-Za-z0-9_-]{1,128})\/?$/);
  if (m) return { kind: 'profile', uid: m[1] };
  return null;
}
