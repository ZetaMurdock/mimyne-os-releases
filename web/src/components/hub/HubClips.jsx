import { useEffect, useMemo, useRef, useState } from 'react';
import ApproveBar from '../ApproveBar.jsx';
import Button from '../Button.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import LinkPreview from '../LinkPreview.jsx';
import ReportDialog from '../ReportDialog.jsx';
import { useVotes } from '../useVotes.js';
import { clipFromLink, clipRef, myMedal, removeClip, shareClip, watchClips } from '../../data/clips.js';
import { usePerson } from '../../data/people.js';
import { fileLink, uploadFile } from '../../lib/files.js';
import { clipsPage } from '../../lib/medal.js';
import { clipEmbedUrl, clipLength } from '../../lib/profileShapes.js';
import { formatBytes, timeAgo } from '../../lib/format.js';
import './HubClips.css';

const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'game', label: 'By game' },
];

/** A Hub's Clips: its highlight reel, from Medal, uploads and links. */
export default function HubClips({ hub, user, access, onSignIn }) {
  const [clips, setClips] = useState(null);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [game, setGame] = useState('all');

  useEffect(() => watchClips(hub.id, setClips, () => setError("This Hub's clips couldn't load.")), [hub.id]);

  const games = useMemo(() => [...new Set((clips ?? []).map((c) => c.game).filter(Boolean))].sort(), [clips]);
  const shown = (clips ?? []).filter((c) => game === 'all' || c.game === game);
  const canShare = !!user && access.canPost;

  return (
    <section className="hclips" aria-label="Clips">
      <header className="hclips__head">
        <div>
          <h2 className="hclips__title">Clips</h2>
          <p className="muted hclips__sub">{clips ? `${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}` : 'Loading…'}</p>
        </div>
        {canShare ? (
          <Button icon="plus" onClick={() => setSharing(true)}>Share a clip</Button>
        ) : !user ? (
          <Button variant="inverse" onClick={onSignIn}>Sign in to share clips</Button>
        ) : null}
      </header>

      {games.length > 1 && (
        <div className="hclips__games" role="tablist" aria-label="Game">
          {['all', ...games].map((g) => (
            <button key={g} type="button" role="tab" aria-selected={game === g} className={`hf-chip ${game === g ? 'is-on' : ''}`} onClick={() => setGame(g)}>
              {g === 'all' ? 'All games' : g}
            </button>
          ))}
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      {clips?.length === 0 && (
        <div className="hclips__empty">
          <Icon name="video" size={30} />
          <p>No clips yet.</p>
          {canShare && <p className="muted">Share one from Medal, upload a video, or paste a link.</p>}
        </div>
      )}

      <div className="hclips__grid">
        {clips === null && [0, 1, 2].map((i) => <div key={i} className="hclip hclip--skeleton" aria-hidden="true" />)}
        {shown.map((clip) => (
          <ClipTile
            key={clip.id}
            hub={hub}
            clip={clip}
            user={user}
            playing={playing === clip.id}
            onPlay={() => setPlaying(clip.id)}
            onStop={() => setPlaying(null)}
            canRemove={!!user && (clip.by === user.uid || access.canModerate)}
          />
        ))}
      </div>

      {sharing && <ShareClip hub={hub} user={user} onClose={() => setSharing(false)} />}
    </section>
  );
}

function ClipTile({ hub, clip, user, playing, onPlay, onStop, canRemove }) {
  const by = usePerson(clip.by);
  const votes = useVotes(clipRef(hub.id, clip.id));
  const [fileUrl, setFileUrl] = useState(null);
  const [reporting, setReporting] = useState(false);
  const embed = clip.source === 'medal' ? clipEmbedUrl(clip.url) : null;

  useEffect(() => {
    if (clip.source !== 'file' || !clip.file || !user) return undefined;
    let live = true;
    fileLink(clip.file.path).then((u) => live && setFileUrl(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [clip.source, clip.file?.path, !!user]);

  async function remove() {
    if (!window.confirm('Take this clip down?')) return;
    await removeClip(hub.id, clip.id).catch(() => {});
  }

  let frame;
  if (clip.source === 'file') {
    frame = fileUrl ? (
      <video className="hclip__video" src={`${fileUrl}#t=0.1`} controls preload="metadata" playsInline />
    ) : (
      <div className="hclip__poster"><Icon name={user ? 'video' : 'lock'} size={22} /><span>{user ? 'Loading…' : 'Sign in to watch'}</span></div>
    );
  } else if (clip.source === 'medal' && embed) {
    frame = playing ? (
      <iframe
        className="hclip__embed"
        src={embed}
        title={clip.title || 'Medal clip'}
        allow="autoplay; encrypted-media; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
      />
    ) : (
      <button type="button" className="hclip__poster hclip__poster--button" onClick={onPlay} aria-label={`Play ${clip.title || 'this clip'}`}>
        {clip.thumb ? <img src={clip.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{clip.game || 'Medal clip'}</span>}
        <span className="hclip__play"><Icon name="play" size={16} /></span>
        {clip.seconds > 0 && <span className="hclip__length">{clipLength(clip.seconds)}</span>}
      </button>
    );
  } else {
    frame = <div className="hclip__link"><LinkPreview url={clip.url} /></div>;
  }

  return (
    <article className={`hclip ${playing ? 'is-playing' : ''}`}>
      <div className="hclip__frame">
        {frame}
        {playing && (
          <button type="button" className="hclip__close" aria-label="Stop" onClick={onStop}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
      <div className="hclip__meta">
        <strong className="hclip__name" title={clip.title}>{clip.title || (clip.source === 'file' ? clip.file?.name : 'Clip')}</strong>
        <span className="hclip__sub">
          {[clip.game, by.name, timeAgo(clip.at)].filter(Boolean).join(' · ')}
        </span>
        <div className="hclip__actions">
          <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} disabled={user?.uid === clip.by} />
          <span className="hclip__spacer" />
          {clip.source === 'medal' && (
            <a className="hclip__out" href={clip.url} target="_blank" rel="noreferrer">On Medal</a>
          )}
          {canRemove && (
            <button type="button" className="hclip__remove" aria-label="Take this clip down" title="Take down" onClick={remove}>
              <Icon name="trash" size={14} />
            </button>
          )}
          {user && clip.by !== user.uid && (
            <button type="button" className="hclip__remove" aria-label="Report this clip" title="Report" onClick={() => setReporting(true)}>
              <Icon name="flag" size={14} />
            </button>
          )}
        </div>
      </div>
      {reporting && (
        <ReportDialog
          about={{ targetUid: clip.by, kind: 'clip', link: `/h/${hub.id}?tab=clips`, excerpt: [clip.title, clip.url].filter(Boolean).join(' · ') }}
          onClose={() => setReporting(false)}
        />
      )}
    </article>
  );
}

// ------------------------------------------------------------ sharing

const SOURCES = [
  { id: 'medal', label: 'From Medal' },
  { id: 'upload', label: 'Upload' },
  { id: 'link', label: 'Link' },
];

function ShareClip({ hub, user, onClose }) {
  const [source, setSource] = useState('medal');
  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [picked, setPicked] = useState(null); // a Medal clip
  const [file, setFile] = useState(null);
  const [link, setLink] = useState('');
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const picker = useRef(null);

  function pickMedal(clip) {
    setPicked(clip);
    setTitle(clip.title ?? '');
    setGame(clip.game ?? '');
  }

  async function share(event) {
    event.preventDefault();
    setError(null);
    let clip;
    if (source === 'medal') {
      if (!picked) return setError('Pick one of your clips.');
      clip = { source: 'medal', url: picked.shareUrl, thumb: picked.thumb, seconds: picked.seconds, medalId: picked.id };
    } else if (source === 'link') {
      clip = clipFromLink(link);
      if (!clip) return setError('Paste a full link, starting with https://');
    } else if (!file) {
      return setError('Pick a video to upload.');
    }
    setBusy(true);
    try {
      if (source === 'upload') {
        const label = await uploadFile(file, setProgress);
        clip = { source: 'file', file: label };
      }
      await shareClip(hub.id, user.uid, { ...clip, title, game });
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "The Hub didn't take it." : err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Share a clip" onClose={busy ? undefined : onClose} width={620}>
      <form className="share-clip" onSubmit={share}>
        <div className="share-clip__tabs" role="tablist">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={source === s.id} className={`hf-chip ${source === s.id ? 'is-on' : ''}`} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {source === 'medal' && <MedalPicker uid={user.uid} picked={picked} onPick={pickMedal} />}

        {source === 'upload' && (
          <button type="button" className="share-clip__drop" onClick={() => picker.current.click()}>
            <Icon name="upload" size={18} />
            <span>{file ? `${file.name} · ${formatBytes(file.size)}` : 'Pick a video from your computer'}</span>
            <input
              ref={picker}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files[0];
                if (f) {
                  setFile(f);
                  if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ''));
                }
              }}
            />
          </button>
        )}

        {source === 'link' && (
          <label className="field">
            Link
            <input className="field__input" value={link} placeholder="https://medal.tv/… or any link to a clip" onChange={(e) => setLink(e.target.value)} />
            <span className="field__hint">Medal share links play here; other links show a preview.</span>
          </label>
        )}

        <div className="share-clip__row">
          <label className="field share-clip__grow">
            Title
            <input className="field__input" value={title} maxLength={120} placeholder="Clutch 1v4 on Canyon" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Game
            <input className="field__input" value={game} maxLength={60} placeholder="Ashfall" onChange={(e) => setGame(e.target.value)} />
          </label>
        </div>

        {progress !== null && busy && (
          <div className="shelf__bar"><span style={{ width: `${progress * 100}%` }} /></div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="room-form__actions">
          <span className="room-form__spacer" />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="inverse" loading={busy}>Share</Button>
        </div>
      </form>
    </Dialog>
  );
}

function MedalPicker({ uid, picked, onPick }) {
  const [account, setAccount] = useState(undefined);
  const [clips, setClips] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    myMedal(uid).then(setAccount).catch(() => setAccount(null));
  }, [uid]);
  useEffect(() => {
    if (!account?.userId) return;
    clipsPage(account.userId, 0).then((d) => setClips(d.clips ?? [])).catch((err) => setError(err.message));
  }, [account?.userId]);

  if (account === undefined) return <p className="muted">Looking for your Medal…</p>;
  if (!account) {
    return (
      <p className="muted share-clip__note">
        Link your Medal account on your profile first (Edit profile, then Medal), and your clips show up here. Or use Upload or Link.
      </p>
    );
  }
  if (error) return <p className="form-error">{error}</p>;
  if (!clips) return <p className="muted">Getting your clips from Medal…</p>;
  if (!clips.length) return <p className="muted share-clip__note">@{account.userName} has no clips on Medal yet.</p>;
  return (
    <div className="share-clip__medal" role="listbox" aria-label={`@${account.userName}'s clips`}>
      {clips.map((c) => (
        <button key={c.id} type="button" role="option" aria-selected={picked?.id === c.id} className={`share-clip__pick ${picked?.id === c.id ? 'is-on' : ''}`} onClick={() => onPick(c)}>
          {c.thumb ? <img src={c.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="share-clip__none">{c.game || 'Clip'}</span>}
          <span className="share-clip__pick-title">{c.title || c.game || 'Clip'}</span>
          {c.seconds > 0 && <span className="hclip__length">{clipLength(c.seconds)}</span>}
        </button>
      ))}
    </div>
  );
}
