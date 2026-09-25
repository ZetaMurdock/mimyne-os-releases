import { useCallback, useEffect, useRef, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import ApproveBar from '../ApproveBar.jsx';
import Icon from '../Icon.jsx';
import MediaPicker from '../MediaPicker.jsx';
import { useVotes } from '../useVotes.js';
import { db } from '../../lib/firebase.js';
import { clipsPage, frontClips } from '../../lib/medal.js';
import {
  CLIP_PAGE_SIZE, MAX_CLIP_COMMENT_CHARS, clipEmbedUrl, clipLength, compactCount, groupClipsByMonth,
} from '../../lib/profileShapes.js';
import { addClipComment, removeClipComment, watchClipComments } from '../../data/profile.js';
import { usePerson } from '../../data/people.js';
import { useSession } from '../../data/session.jsx';
import { timeAgo } from '../../lib/format.js';
import './MedalClips.css';

/**
 * Medal clips on a profile, as in the app (components/profile/MedalClips.jsx):
 * the front shows the owner's pinned picks, or the newest four, with a way
 * to every clip on a timeline by month. Pressing a clip plays it in Medal's
 * own player; under each are approvals and a thread, which are Mimyne's.
 */
export default function MedalClips({ uid, medal, onOpenAll }) {
  const [clips, setClips] = useState(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(null);
  const featured = medal.featured;

  useEffect(() => {
    let live = true;
    setFailed(false);
    frontClips(medal)
      .then((shown) => live && setClips(shown))
      .catch(() => live && (setClips([]), setFailed(true)));
    return () => {
      live = false;
    };
  }, [medal.userId, featured.join(',')]);

  if (clips && clips.length === 0 && !failed) return null;

  return (
    <section className="clips" aria-label="Medal clips">
      <div className="clips__head">
        <span className="label">{featured.length ? 'Pinned clips' : 'Clips'}</span>
        <a className="clips__on" href={`https://medal.tv/u/${encodeURIComponent(medal.userName)}`} target="_blank" rel="noreferrer">
          @{medal.userName} on Medal
        </a>
        <button type="button" className="clips__all" onClick={onOpenAll}>
          All clips <Icon name="chevronDown" size={12} className="clips__chev" />
        </button>
      </div>
      {clips === null && <p className="muted clips__note">Reaching Medal…</p>}
      {failed && <p className="muted clips__note">Medal can't be reached right now.</p>}
      {clips?.length > 0 && (
        <div className="clips__grid">
          {clips.map((clip) => (
            <ClipCard key={clip.id} uid={uid} clip={clip} active={active === clip.id} onActivate={() => setActive(clip.id)} onClose={() => setActive(null)} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Every public clip, newest posted first, grouped by month; pages as it scrolls. */
export function MedalClipsPage({ uid, medal, onBack }) {
  const [clips, setClips] = useState([]);
  const [state, setState] = useState('loading');
  const [active, setActive] = useState(null);
  const offset = useRef(0);
  const busy = useRef(false);
  const sentinel = useRef(null);

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState('loading');
    try {
      const { clips: page, served } = await clipsPage(medal.userId, offset.current);
      offset.current += served;
      setClips((known) => {
        const seen = new Set(known.map((c) => c.id));
        return [...known, ...page.filter((c) => !seen.has(c.id))];
      });
      setState(served < CLIP_PAGE_SIZE ? 'done' : 'idle');
    } catch {
      setState('failed');
    } finally {
      busy.current = false;
    }
  }, [medal.userId]);

  useEffect(() => {
    offset.current = 0;
    setClips([]);
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    if (state !== 'idle' || !sentinel.current) return undefined;
    const watcher = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: '480px' });
    watcher.observe(sentinel.current);
    return () => watcher.disconnect();
  }, [state, loadMore]);

  const groups = groupClipsByMonth(clips);
  return (
    <section className="clips clips--page" aria-label="All Medal clips">
      <div className="clips__head">
        <button type="button" className="clips__back" onClick={onBack}>
          <Icon name="back" size={14} /> Profile
        </button>
        <span className="label">Clips</span>
        <span className="clips__on">
          {clips.length > 0 && `${clips.length}${state === 'idle' ? '+' : ''} clips · `}@{medal.userName} on Medal
        </span>
      </div>
      {clips.length === 0 && state === 'loading' && <p className="muted clips__note">Reaching Medal…</p>}
      {clips.length === 0 && state === 'done' && <p className="muted clips__note">No public clips yet.</p>}
      {clips.length > 0 && (
        <div className="clips__timeline">
          {groups.map((group) => (
            <div key={group.key} className="clips__month">
              {group.newYear && <div className="clips__year">{group.year}</div>}
              <div className="clips__month-name">
                <span className="clips__node" aria-hidden="true" />
                {group.month || 'Undated'} <span className="muted">· {group.clips.length}</span>
              </div>
              <div className="clips__grid clips__grid--three">
                {group.clips.map((clip) => (
                  <ClipCard key={clip.id} uid={uid} clip={clip} dated active={active === clip.id} onActivate={() => setActive(clip.id)} onClose={() => setActive(null)} />
                ))}
              </div>
            </div>
          ))}
          <div ref={sentinel} />
          <p className="muted clips__note">
            {state === 'loading' && '… older clips'}
            {state === 'failed' && (
              <button type="button" className="link-button" onClick={loadMore}>
                Medal stopped answering. Try again
              </button>
            )}
            {state === 'done' && '○ the beginning'}
          </p>
        </div>
      )}
    </section>
  );
}

function ClipCard({ uid, clip, active, onActivate, onClose, dated = false }) {
  const { user } = useSession();
  const [thread, setThread] = useState(false);
  const embed = clipEmbedUrl(clip.shareUrl);
  const votes = useVotes(doc(db, 'profile_pages', uid, 'clips', clip.id));

  useEffect(() => {
    if (!active) setThread(false);
  }, [active]);

  return (
    <div className={`clip ${active ? 'is-active' : ''}`}>
      <div className="clip__frame">
        {active && embed ? (
          <iframe
            src={embed}
            title={clip.title || 'Medal clip'}
            allow="autoplay; encrypted-media; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        ) : (
          <button type="button" className="clip__play" onClick={onActivate} aria-label={`Play ${clip.title || 'this clip'}`}>
            {clip.thumb ? <img src={clip.thumb} alt="" loading="lazy" /> : <span className="clip__game">{clip.game || 'Clip'}</span>}
            <span className="clip__button">
              <Icon name="play" size={14} />
            </span>
            {clip.seconds > 0 && <span className="clip__length">{clipLength(clip.seconds)}</span>}
          </button>
        )}
        {active && (
          <button type="button" className="clip__close" onClick={onClose} aria-label="Close this clip">
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="clip__meta">
        {clip.title && <strong className="clip__title" title={clip.title}>{clip.title}</strong>}
        <span className="clip__sub">
          {clip.game}
          {dated
            ? clip.posted > 0 && ` · ${new Date(clip.posted).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : clip.views > 0 && ` · ${compactCount(clip.views)} views`}
        </span>
        <div className="clip__actions">
          <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} disabled={user?.uid === uid} />
          <button
            type="button"
            className="clip__talk"
            aria-expanded={thread}
            onClick={() => {
              if (!active) onActivate();
              setThread((open) => !open || !active);
            }}
          >
            <Icon name="message" size={14} /> {thread ? 'Hide' : 'Comments'}
          </button>
        </div>
        {thread && active && <ClipComments uid={uid} clipId={clip.id} />}
      </div>
    </div>
  );
}

function ClipComments({ uid, clipId }) {
  const { user } = useSession();
  const [remarks, setRemarks] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => watchClipComments(uid, clipId, setRemarks), [uid, clipId]);

  async function send(event) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addClipComment(user.uid, uid, clipId, draft);
      setDraft('');
    } catch (err) {
      setError(err.code === 'permission-denied' ? "That comment wasn't taken." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="clip__thread">
      {remarks.map((r) => (
        <Remark key={r.id} remark={r} canRemove={r.authorUid === user?.uid || uid === user?.uid} onRemove={() => removeClipComment(uid, clipId, r.id).catch(() => {})} />
      ))}
      {remarks.length === 0 && <span className="muted">Nothing said yet.</span>}
      <form className="clip__say" onSubmit={send}>
        <MediaPicker emojiOnly placement="up" onEmoji={(char) => setDraft((d) => (d + char).slice(0, MAX_CLIP_COMMENT_CHARS))} />
        <input className="field__input" value={draft} maxLength={MAX_CLIP_COMMENT_CHARS} placeholder="Say something…" onChange={(e) => setDraft(e.target.value)} aria-label="Comment on this clip" />
        <button type="submit" className="songs__btn" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function Remark({ remark, canRemove, onRemove }) {
  const person = usePerson(remark.authorUid);
  return (
    <div className="clip__remark">
      <Link to={`/people/${remark.authorUid}`} className="clip__who">{person.name}</Link>
      <span className="clip__words">{remark.text}</span>
      <span className="clip__when">{remark.createdAt ? timeAgo(remark.createdAt) : 'now'}</span>
      {canRemove && (
        <button type="button" className="clip__remove" aria-label="Remove this comment" onClick={onRemove}>
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  );
}
