import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { keepLink, keepUpload, removeFromLibrary, watchLibrary } from '../data/library.js';
import { useSession } from '../data/session.jsx';
import { fileLink, uploadFile } from '../lib/files.js';
import { findGifs } from '../lib/gifs.js';
import './MediaPicker.css';

// What's everywhere right now, first in line.
const POPULAR = ['💀', '😭', '🗿', '🔥', '😤', '🤡', '🫠', '🙏', '💅', '🧠', '🤫', '🧏‍♂️', '😮‍💨', '🤓', '☝️', '🥀', '🥶', '😳', '👀', '💯', '🤑', '🫡', '😈', '🤨'];

// The picker's quick picks: today's memes, and a few things people always want.
const GIF_PICKS = [
  'brainrot', 'italian brainrot', 'skibidi', 'sigma', 'rizz', 'aura', 'mewing', 'fanum tax', 'tung tung sahur',
  'chill guy', '67', 'npc', 'ohio', 'gyatt', 'cat vibing', 'reaction', 'bruh', 'lol', 'no way', 'gg',
];

const GROUPS = [
  { id: 0, icon: '😀', name: 'Smileys' },
  { id: 1, icon: '👋', name: 'People' },
  { id: 3, icon: '🐱', name: 'Animals & nature' },
  { id: 4, icon: '🍕', name: 'Food & drink' },
  { id: 5, icon: '✈️', name: 'Travel & places' },
  { id: 6, icon: '⚽', name: 'Activities' },
  { id: 7, icon: '💡', name: 'Objects' },
  { id: 8, icon: '❤️', name: 'Symbols' },
  { id: 9, icon: '🏁', name: 'Flags' },
];

// The emoji list (data/emoji.json) is trimmed from emojibase-data (MIT):
// each emoji, its name, a few search words and its group.
const RECENT_KEY = 'mimyne.recentEmoji';
function recentEmoji() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? [];
  } catch {
    return [];
  }
}
function remember(char) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([char, ...recentEmoji().filter((c) => c !== char)].slice(0, 24)));
  } catch {
    // Not remembered: fine.
  }
}

/**
 * The picker button every composer carries: emoji, GIFs, stickers, and your
 * own library of media. `onEmoji(char)` puts an emoji in the words;
 * `onPick(media)` sends a GIF, sticker or library item
 * ({ kind: 'gif', url, title, width, height } or { kind: 'library', item }).
 * `emojiOnly` for places that take words alone.
 */
export default function MediaPicker({ onEmoji, onPick, emojiOnly = false, placement = 'up', align = 'start' }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('emoji');
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const pick = (media) => {
    setOpen(false);
    onPick?.(media);
  };

  return (
    <span className="picker" ref={root}>
      <button type="button" className={`picker__trigger ${open ? 'is-open' : ''}`} aria-label="Emoji, GIFs and stickers" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="smile" size={18} />
      </button>
      {open && (
        <div className={`picker__panel picker__panel--${placement} picker__panel--${align}`} role="dialog" aria-label="Emoji, GIFs and stickers">
          {!emojiOnly && (
            <div className="picker__tabs" role="tablist">
              {[
                ['emoji', 'Emoji'],
                ['gifs', 'GIFs'],
                ['stickers', 'Stickers'],
                ['library', 'Library'],
              ].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className="picker__tab" onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {(emojiOnly || tab === 'emoji') && <EmojiTab onEmoji={(c) => (remember(c), onEmoji?.(c))} />}
          {!emojiOnly && (tab === 'gifs' || tab === 'stickers') && <GifTab key={tab} type={tab} onPick={pick} />}
          {!emojiOnly && tab === 'library' && <LibraryTab onPick={pick} />}
        </div>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ emoji

function EmojiTab({ onEmoji }) {
  const [all, setAll] = useState(null);
  const [q, setQ] = useState('');
  const [recent] = useState(recentEmoji);
  const scroller = useRef(null);

  useEffect(() => {
    import('../data/emoji.json').then((m) => setAll(m.default));
  }, []);

  const found = useMemo(() => {
    const words = q.trim().toLowerCase();
    if (!all || !words) return null;
    return all.filter(([, label, tags]) => label.includes(words) || tags.includes(words)).slice(0, 160);
  }, [all, q]);

  const jump = (group) => scroller.current?.querySelector(`[data-group="${group}"]`)?.scrollIntoView({ block: 'start' });
  const face = (char, label) => (
    <button key={char} type="button" className="picker__emoji" title={label} onClick={() => onEmoji(char)}>
      {char}
    </button>
  );

  return (
    <div className="picker__body">
      <input className="picker__search" placeholder="Search emoji" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search emoji" />
      <div className="picker__scroll" ref={scroller}>
        {found ? (
          found.length ? <div className="picker__emojis">{found.map(([c, l]) => face(c, l))}</div> : <p className="picker__none">No emoji called that.</p>
        ) : (
          <>
            {recent.length > 0 && (
              <>
                <p className="picker__label">Recent</p>
                <div className="picker__emojis">{recent.map((c) => face(c, c))}</div>
              </>
            )}
            <p className="picker__label">Popular now</p>
            <div className="picker__emojis">{POPULAR.map((c) => face(c, c))}</div>
            {!all && <p className="picker__none">…</p>}
            {all &&
              GROUPS.map((g) => (
                <section key={g.id} data-group={g.id}>
                  <p className="picker__label">{g.name}</p>
                  <div className="picker__emojis">{all.filter((e) => e[3] === g.id).map(([c, l]) => face(c, l))}</div>
                </section>
              ))}
          </>
        )}
      </div>
      {!found && (
        <div className="picker__groups">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" title={g.name} onClick={() => jump(g.id)}>
              {g.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- GIPHY

function GifTab({ type, onPick }) {
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [next, setNext] = useState(0);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(() => new Set());

  // Searching as you type, a moment after you stop.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setResults([]);
    setState('loading');
    setError(null);
    findGifs({ type, q: search, offset: 0 })
      .then((d) => live && (setResults(d.results), setNext(d.next), setState('idle')))
      .catch((e) => live && (setError(e.message), setState('failed')));
    return () => {
      live = false;
    };
  }, [type, search]);

  async function more() {
    if (next == null || state === 'loading') return;
    setState('loading');
    try {
      const d = await findGifs({ type, q: search, offset: next });
      setResults((r) => [...r, ...d.results.filter((x) => !r.some((y) => y.id === x.id))]);
      setNext(d.next);
      setState('idle');
    } catch {
      setState('idle');
    }
  }

  async function keep(gif) {
    setSaved((s) => new Set(s).add(gif.id));
    try {
      await keepLink(user.uid, gif);
    } catch {
      setSaved((s) => {
        const n = new Set(s);
        n.delete(gif.id);
        return n;
      });
    }
  }

  return (
    <div className="picker__body">
      <input className="picker__search" placeholder={`Search ${type === 'stickers' ? 'stickers' : 'GIFs'}`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label={`Search ${type}`} />
      <div className="picker__chips">
        <button type="button" className={!search ? 'is-on' : undefined} onClick={() => setQ('')}>
          Trending
        </button>
        {GIF_PICKS.map((p) => (
          <button key={p} type="button" className={search === p ? 'is-on' : undefined} onClick={() => setQ(p)}>
            {p}
          </button>
        ))}
      </div>
      <div
        className="picker__scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 240) more();
        }}
      >
        {error && <p className="picker__none">{error}</p>}
        <div className={`picker__gifs ${type === 'stickers' ? 'is-stickers' : ''}`}>
          {results.map((g) => (
            <div key={g.id} className="picker__gif">
              <button type="button" className="picker__gif-send" title={g.title} onClick={() => onPick({ kind: 'gif', url: g.url, title: g.title, width: g.width, height: g.height })}>
                <img src={g.preview} alt={g.title} loading="lazy" style={g.width && g.height ? { aspectRatio: `${g.width} / ${g.height}` } : undefined} />
              </button>
              <button type="button" className={`picker__keep ${saved.has(g.id) ? 'is-kept' : ''}`} aria-label="Keep in your library" title="Keep in your library" onClick={() => keep(g)} disabled={saved.has(g.id)}>
                <Icon name="star" size={13} fill={saved.has(g.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
          ))}
        </div>
        {state === 'loading' && <p className="picker__none">…</p>}
        {state === 'idle' && results.length === 0 && <p className="picker__none">Nothing found.</p>}
      </div>
      <p className="picker__credit">Powered by GIPHY</p>
    </div>
  );
}

// --------------------------------------------------------------- library

function LibraryTab({ onPick }) {
  const { user } = useSession();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const input = useRef(null);

  useEffect(() => watchLibrary(user.uid, setItems), [user.uid]);

  async function add(files) {
    setError(null);
    for (const file of [...files].slice(0, 20)) {
      if (!/^(image|video)\//.test(file.type)) {
        setError('Pictures, GIFs and short videos only.');
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError(`${file.name} is over 50 MB.`);
        continue;
      }
      try {
        setBusy(`${file.name} 0%`);
        const size = await measure(file);
        const label = await uploadFile(file, (p) => setBusy(`${file.name} ${Math.floor(p * 100)}%`));
        await keepUpload(user.uid, label, size);
      } catch (err) {
        setError(err.message);
      }
    }
    setBusy(null);
  }

  return (
    <div className="picker__body">
      <div className="picker__library-head">
        <span className="picker__label">Your library</span>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
        <button type="button" className="picker__upload" onClick={() => input.current.click()} disabled={!!busy}>
          <Icon name="upload" size={13} /> {busy ? `Uploading ${busy}` : 'Upload'}
        </button>
      </div>
      {error && <p className="picker__none picker__error">{error}</p>}
      <div className="picker__scroll" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), add(e.dataTransfer.files))}>
        {items?.length === 0 && (
          <p className="picker__none">
            Keep your own GIFs, stickers and pictures here to send again. Upload them, drop them here, or press the star on any GIF.
          </p>
        )}
        <div className="picker__gifs">
          {items?.map((item) => (
            <LibraryTile key={item.id} item={item} onSend={() => onPick({ kind: 'library', item })} onRemove={() => removeFromLibrary(user.uid, item).catch(() => {})} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LibraryTile({ item, onSend, onRemove }) {
  const [src, setSrc] = useState(item.url);
  useEffect(() => {
    if (item.kind === 'file' && item.path) fileLink(item.path).then(setSrc).catch(() => {});
  }, [item.kind, item.path]);
  const video = item.type?.startsWith('video/');
  return (
    <div className="picker__gif">
      <button type="button" className="picker__gif-send" title={item.name} onClick={onSend}>
        {src ? (
          video ? <video src={src} muted autoPlay loop playsInline /> : <img src={src} alt={item.name} loading="lazy" />
        ) : (
          <span className="picker__blank" style={item.width && item.height ? { aspectRatio: `${item.width} / ${item.height}` } : undefined} />
        )}
      </button>
      <button type="button" className="picker__keep picker__remove" aria-label={`Remove ${item.name} from your library`} title="Remove" onClick={onRemove}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

/** A picture's or video's size, for its tile's shape. */
function measure(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (width, height) => {
      URL.revokeObjectURL(url);
      resolve(width && height ? { width: Math.round(width), height: Math.round(height) } : {});
    };
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth, img.naturalHeight);
      img.onerror = () => done();
      img.src = url;
    }
  });
}
