// What a profile page holds, read the way the app reads it. These are the
// app's own helpers, copied from ZetaMurdock/mimyne-os (runtime/profiles.js,
// imageCrop.js, discordLook.js, medal.js, activity.js), so a profile shows
// the same on mimyne.com as in the app. Keep them in step with it.

export const text = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
const stamp = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : (typeof value === 'number' ? value : null));

// ----------------------------------------------------------- imageCrop.js
export const NO_CROP = Object.freeze({ zoom: 1, x: 0, y: 0 });

/** How far in a picture may be pushed. Past this it is mush. */
export const MAX_ZOOM = 5;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const number = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/**
 * A crop that can be trusted: every field a real number, in range, with
 * anything unsaid left at the middle. Takes whatever was in storage,
 * including nothing.
 */
export function normalizeCrop(crop) {
  if (!crop || typeof crop !== 'object') return NO_CROP;
  const zoom = clamp(number(Number(crop.zoom), 1), 1, MAX_ZOOM);
  return {
    zoom,
    x: clamp(number(Number(crop.x), 0), -1, 1),
    y: clamp(number(Number(crop.y), 0), -1, 1),
  };
}

/** Whether this crop asks for anything at all. */
export function isCropped(crop) {
  const { zoom, x, y } = normalizeCrop(crop);
  return zoom !== 1 || x !== 0 || y !== 0;
}

/**
 * The style for the picture itself, inside a frame that hides its overflow.
 *
 * `translate` before `scale` in the transform on purpose: transforms are read
 * right to left, so the picture is scaled first and THEN moved, which means
 * the percentages are of the frame rather than of the blown-up picture. That
 * is what makes `x` mean the same amount of travel at every zoom.
 */
export function cropStyle(crop) {
  const { zoom, x, y } = normalizeCrop(crop);
  const room = (zoom - 1) * 50;
  return {
    position: 'absolute',
    // The four edges rather than `inset`: the shorthand is not understood
    // everywhere the shape of this style is read, including by the tests.
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transformOrigin: 'center',
    transform: `translate(${(x * room).toFixed(4)}%, ${(y * room).toFixed(4)}%) scale(${zoom})`,
  };
}

// ---------------------------------------------------------- discordLook.js

const USERNAME = /^[A-Za-z0-9_.]{2,32}$/;
const MAX_TAG_CHARS = 4;
const BADGE_URL = /^https:\/\/cdn\.discordapp\.com\/guild-tag-badges\/\d{15,21}\/[0-9a-f]{32}\.png\?size=32$/;

function tagText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  if (!length || length > MAX_TAG_CHARS || /[\s<>"'`]/.test(trimmed)) return null;
  return trimmed;
}

export function cleanDiscordShow(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  if (typeof value.username === 'string' && USERNAME.test(value.username)) out.username = value.username;
  const tag = tagText(value.tag);
  if (tag) {
    out.tag = tag;
    if (typeof value.badge === 'string' && BADGE_URL.test(value.badge)) out.badge = value.badge;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------- medal.js

export const FRONT_CLIP_COUNT = 4;

/** How many clips the owner may pin to the front. */
export const MAX_FEATURED_CLIPS = 4;

/** Medal's page ceiling: 50 answers, 100 is refused. The clips page pages. */
export const CLIP_PAGE_SIZE = 50;

/** One clip comment: a remark, not an essay. */
export const MAX_CLIP_COMMENT_CHARS = 300;

const CLIP_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The embeddable player page for a clip's share URL: Medal serves the
 * share page (…/clips/<id>) with X-Frame-Options, and the player page
 * (…/clip/<id>) without. Anything that is not a Medal share link is
 * refused rather than framed.
 */
export function clipEmbedUrl(shareUrl) {
  const text = String(shareUrl || '');
  if (!/^https:\/\/medal\.tv\//.test(text)) return null;
  if (!text.includes('/clips/')) return null;
  return text.replace('/clips/', '/clip/');
}

/** 245886 -> "245.9K", 4626 -> "4.6K", 854 -> "854". Medal-sized numbers. */
export function compactCount(value) {
  const count = Number(value) || 0;
  const trim = (text) => text.replace(/\.0$/, '');
  if (count >= 1_000_000) return `${trim((count / 1_000_000).toFixed(1))}M`;
  if (count >= 1_000) return `${trim((count / 1_000).toFixed(1))}K`;
  return String(count);
}

/** "0:24" out of 24.7 seconds; clips are short, hours never happen. */
export function clipLength(seconds) {
  const whole = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The medal field a profile page carries; null for anything malformed. */
export function cleanMedalAccount(value) {
  if (!value || typeof value !== 'object') return null;
  const userName = typeof value.userName === 'string' ? value.userName.trim() : '';
  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  if (!userName || userName.length > 80) return null;
  if (!/^[0-9]{1,30}$/.test(userId)) return null;
  // The owner's picks for the profile front, in their order.
  const featured = Array.isArray(value.featured)
    ? [...new Set(value.featured.filter((id) => typeof id === 'string' && CLIP_ID.test(id)))].slice(0, MAX_FEATURED_CLIPS)
    : [];
  return { userName, userId, featured };
}

/**
 * The clips page's timeline: newest posted first, grouped by month. Each
 * group carries its year and month name; `newYear` marks the first group
 * of each year, where the rail wears the year. A clip Medal left undated
 * sinks to the end under no label.
 */
export function groupClipsByMonth(clips) {
  const dateOf = (clip) => clip.posted || clip.created || 0;
  const sorted = [...(clips || [])].sort((a, b) => dateOf(b) - dateOf(a));
  const groups = [];
  for (const clip of sorted) {
    const at = dateOf(clip);
    const date = at > 0 ? new Date(at) : null;
    const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'undated';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.clips.push(clip);
      continue;
    }
    const year = date ? date.getFullYear() : null;
    groups.push({
      key,
      year,
      month: date ? date.toLocaleDateString(undefined, { month: 'long' }) : '',
      newYear: year !== null && (last ? last.year !== year : true),
      clips: [clip],
    });
  }
  return groups;
}

// ------------------------------------------------------------- profiles.js

export const VISIBILITY = Object.freeze({ everyone: 'everyone', friends: 'friends' });
/** How the song someone is listening to looks on their profile. */
export const VISUALIZERS = ['bars', 'wave', 'orb', 'none'];
export const MAX_BIO_CHARS = 300;
export const MAX_SONG_TITLE_CHARS = 120;
export const MAX_AVATAR_CHARS = 200000;
export const MAX_FRONT_IMAGE_CHARS = 250000;
/** The hero across the top: an https link (gif and video welcome) or a published still. */
export const MAX_BANNER_CHARS = 250000;
/** The one pinned note: a front-porch line, not a wall. */
export const MAX_NOTE_CHARS = 500;
/**
 * The whole page's background, behind everything (Steam's profile
 * backgrounds): an https link (gif and video welcome) or a published still.
 * With the avatar and banner it stays well inside a document's 1 MiB.
 */
export const MAX_PAGE_BACKGROUND_CHARS = 350000;
export const FRONT_SHAPES = ['default', 'square', 'circle', 'pill'];
export const MAX_SONGS = 20;

const INLINE_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** A picture another person's app may draw: a small inline image or an https link. */
export function safePicture(value, max) {
  if (typeof value !== 'string') return null;
  if (/^https:\/\/\S+$/.test(value) && value.length <= 500) return value;
  if (value.length <= max && INLINE_IMAGE.test(value)) return value;
  return null;
}

// ------------------------------------------------------------------ music

const AUDIO_FILE = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;

/**
 * What a song link plays as, or null if it is not one Mimyne can play.
 *
 * Every player is built from pieces of the link (an id, a path), never from
 * the link itself dropped into a page: an embed always points at the
 * service's own player, and a file link is only ever an <audio> source.
 *
 * @returns {{provider: 'youtube'|'soundcloud'|'spotify'|'file', kind: 'iframe'|'audio', src: string} | null}
 */
export function musicPlayer(link) {
  let url;
  try {
    url = new URL(String(link || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

  // YouTube: watch?v=, youtu.be/, /shorts/, /embed/, music.youtube.com, and
  // playlists (list=) - a whole playlist plays through in YouTube's player.
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com') {
    const videoId = host === 'youtu.be'
      ? url.pathname.split('/')[1] || null
      : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] || null;
    const listId = url.searchParams.get('list');
    if (videoId && !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
    if (listId && !/^[A-Za-z0-9_-]{10,64}$/.test(listId)) return null;
    if (listId) {
      const start = videoId ? `${videoId}?list=${listId}&` : `videoseries?list=${listId}&`;
      return { provider: 'youtube', kind: 'iframe', playlist: true, src: `https://www.youtube-nocookie.com/embed/${start}autoplay=1&enablejsapi=1` };
    }
    if (!videoId) return null;
    return {
      provider: 'youtube',
      kind: 'iframe',
      playlist: false,
      // enablejsapi: the player says when a song ends, so the next one starts.
      src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
    };
  }

  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    const clean = `https://${host}${url.pathname}`.replace(/\/+$/, '');
    if (!/^https:\/\/(on\.)?soundcloud\.com\/[A-Za-z0-9_\-/]+$/.test(clean)) return null;
    return {
      provider: 'soundcloud',
      kind: 'iframe',
      playlist: /\/sets\//.test(clean),
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&auto_play=true&visual=false&hide_related=true`,
    };
  }

  if (host === 'open.spotify.com') {
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{10,40})/);
    if (!match) return null;
    return { provider: 'spotify', kind: 'iframe', playlist: match[1] !== 'track' && match[1] !== 'episode', src: `https://open.spotify.com/embed/${match[1]}/${match[2]}` };
  }

  if (AUDIO_FILE.test(url.pathname)) {
    return { provider: 'file', kind: 'audio', playlist: false, src: url.href };
  }
  return null;
}

/** "YouTube", "SoundCloud"... for the player's label. */
export const PROVIDER_LABELS = { youtube: 'YouTube', soundcloud: 'SoundCloud', spotify: 'Spotify', file: 'Audio file' };

/** A profile page as received: written by someone else, so forced to shape. */
export function cleanProfilePage(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    visibility: data.visibility === VISIBILITY.friends ? VISIBILITY.friends : VISIBILITY.everyone,
    avatar: safePicture(data.avatar, MAX_AVATAR_CHARS),
    banner: safePicture(data.banner, MAX_BANNER_CHARS),
    background: safePicture(data.background, MAX_PAGE_BACKGROUND_CHARS),
    bio: text(data.bio, MAX_BIO_CHARS),
    note: text(data.note, MAX_NOTE_CHARS),
    visualizer: VISUALIZERS.includes(data.visualizer) ? data.visualizer : 'bars',
    medal: cleanMedalAccount(data.medal),
    discord: cleanDiscordShow(data.discord),
    // Only when there is one, matching how it is written: a page that is not
    // framed says nothing about framing, at either end.
    ...(isCropped(data.backgroundCrop) ? { backgroundCrop: normalizeCrop(data.backgroundCrop) } : {}),
    updatedAt: stamp(data.updatedAt),
  };
}

/** One remark under a Medal clip, as received. */
export function cleanClipComment(id, data) {
  if (!data || typeof data !== 'object') return null;
  const body = text(data.text, MAX_CLIP_COMMENT_CHARS);
  if (!body || typeof data.authorUid !== 'string') return null;
  return { id: String(id), authorUid: data.authorUid, text: body, createdAt: stamp(data.createdAt) };
}

/** One of a profile's songs, as received. null if Mimyne cannot play it. */
export function cleanSong(id, data) {
  if (!data || typeof data !== 'object' || !musicPlayer(data.url)) return null;
  return {
    id: String(id),
    url: String(data.url),
    title: text(data.title, MAX_SONG_TITLE_CHARS),
    order: Number.isInteger(data.order) ? data.order : 0,
  };
}

/** A workspace bubble on a profile, as received. */
/** How many bubbles one picture may be cut across on a profile. */
export const MAX_POSTER_BUBBLES = 8;

/**
 * A bubble's place in a poster: one picture cut across several bubbles, the
 * way the home screen spreads one across several cards. Each bubble carries
 * the whole picture and shows its own slice of it.
 */
export function cleanPoster(value) {
  if (!value || typeof value !== 'object') return null;
  const id = text(value.id, 60);
  const count = Number.isInteger(value.count) ? value.count : 0;
  const index = Number.isInteger(value.index) ? value.index : -1;
  if (!id || count < 2 || count > MAX_POSTER_BUBBLES || index < 0 || index >= count) return null;
  return { id, index, count };
}

/**
 * Where a bubble's picture sits so the poster reads across them all: the
 * picture is laid out as wide as the whole poster and slid over, leaving
 * this bubble's share of it in view.
 */
export function posterSlice(poster) {
  const clean = cleanPoster(poster);
  if (!clean) return null;
  return { width: `${clean.count * 100}%`, left: `-${clean.index * 100}%` };
}

export function cleanShowcaseCard(workspaceId, data) {
  if (!data || typeof data !== 'object' || typeof workspaceId !== 'string') return null;
  const glow = typeof data.glow === 'string' && /^#[0-9a-f]{3,8}$/i.test(data.glow) ? data.glow : null;
  return {
    workspaceId,
    title: text(data.title, 120) || 'Untitled workspace',
    image: safePicture(data.image, MAX_FRONT_IMAGE_CHARS),
    shape: FRONT_SHAPES.includes(data.shape) ? data.shape : 'default',
    glow,
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : 0,
    poster: cleanPoster(data.poster),
    crop: isCropped(data.crop) ? normalizeCrop(data.crop) : null,
  };
}

/** How a front's shape rounds a bubble. */
export function frontRadius(shape) {
  if (shape === 'circle') return '50%';
  if (shape === 'pill') return '9999px';
  if (shape === 'square') return '8px';
  return '4px';
}

/** A song's id, from its link (FNV-1a): the same link, the same id. */
export function songId(url) {
  let hash = 0x811c9dc5;
  for (const character of String(url || '').trim()) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `s_${hash.toString(16).padStart(8, '0')}`;
}

/** A banner or background link that plays rather than sits still (ProfilePage.jsx). */
export const bannerVideo = (src) => typeof src === 'string' && /^https:\/\//.test(src) && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);

// -------------------------------------------------------------- activity.js

const PRESENCE_STALE_MS = 10 * 60 * 1000;
const MAX_ART_CHARS = 60000;
const MAX_SONG_MS = 24 * 60 * 60 * 1000;
function songExtras(source) {
  const extras = {};
  const art = safePicture(source?.art, MAX_ART_CHARS);
  if (art) extras.art = art;
  const duration = Number(source?.duration);
  const startedAt = Number(source?.startedAt);
  if (Number.isFinite(duration) && duration > 0 && duration <= MAX_SONG_MS && Number.isFinite(startedAt) && startedAt > 0) {
    extras.startedAt = Math.round(startedAt);
    extras.duration = Math.round(duration);
  }
  return extras;
}

/** Someone's presence, as received. Stale (the app closed) reads as nothing. */
export function cleanPresence(data, now = Date.now()) {
  if (!data || typeof data !== 'object') return { listening: null, playing: null };
  const updatedAt = stamp(data.updatedAt);
  if (!updatedAt || now - updatedAt > PRESENCE_STALE_MS) return { listening: null, playing: null };
  const listening = data.listening && typeof data.listening === 'object' && text(data.listening.title, 200)
    ? {
      title: text(data.listening.title, 200),
      artist: text(data.listening.artist, 200),
      app: text(data.listening.app, 40),
      source: data.listening.source === 'spotify' ? 'spotify' : 'computer',
      ...songExtras(data.listening),
    }
    : null;
  const playing = data.playing && typeof data.playing === 'object' && text(data.playing.name, 120)
    ? { name: text(data.playing.name, 120), source: data.playing.source === 'steam' ? 'steam' : 'custom' }
    : null;
  return { listening, playing, updatedAt };
}

/** Where a song is now, as elapsed and total ms; null without the numbers. */
export function songProgress(listening, now = Date.now()) {
  if (!listening?.duration || !listening?.startedAt) return null;
  const elapsed = Math.min(listening.duration, Math.max(0, now - listening.startedAt));
  return { elapsed, duration: listening.duration };
}

export function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

