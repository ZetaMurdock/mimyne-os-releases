import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Button from './Button.jsx';
import { fileLink } from '../lib/files.js';
import { fileRisk } from '../lib/fileSafety.js';
import { useSafeDownload } from './useSafeDownload.jsx';
import { formatBytes, FREE_FILE_LIMIT, PAID_TIER_NAME } from '../lib/format.js';
import './FileCard.css';

const kindOf = (file) =>
  file.type?.startsWith('video/') ? 'video' : file.type?.startsWith('image/') ? 'image' : file.type?.startsWith('audio/') ? 'audio' : 'file';
const iconOf = (kind) => (kind === 'audio' ? 'play' : kind);

// Pictures, GIFs and videos show in place once you're signed in (their links
// need an account, like downloads), with the card under them.
function Media({ file, kind }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fileLink(file.path).then((link) => live && setUrl(link)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file.path]);
  if (failed) return null;
  if (!url) return <span className="file-media file-media--loading" aria-hidden="true" />;
  if (kind === 'audio') return <audio className="file-audio" src={url} controls preload="metadata" />;
  return kind === 'video' ? (
    <video className="file-media" src={url} controls preload="metadata" />
  ) : (
    <img className="file-media" src={url} alt={file.name} loading="lazy" onError={() => setFailed(true)} />
  );
}

// Any file, any size. Signed-out visitors see it but can't download it.
export function FileCard({ file, locked = false, compact = false, onNeedAccount }) {
  const kind = kindOf(file);
  // Shown in place unless its sender sent it as a plain file.
  if (!locked && kind !== 'file' && file.display !== false) {
    return (
      <div className={`file-shown ${compact ? 'file-shown--compact' : ''}`}>
        <Media file={file} kind={kind} />
        <Card file={file} compact onNeedAccount={onNeedAccount} />
      </div>
    );
  }
  return <Card file={file} locked={locked} compact={compact} onNeedAccount={onNeedAccount} />;
}

function Card({ file, locked = false, compact = false, onNeedAccount }) {
  const { start, busy, error, dialog } = useSafeDownload();
  const runs = fileRisk(file.name).runs;
  const download = () => start(file);

  return (
    <div className={`file-card ${compact ? 'file-card--compact' : ''}`}>
      <span className="file-card__icon">
        <Icon name={iconOf(kindOf(file))} size={compact ? 16 : 18} />
      </span>
      <span className="file-card__text">
        <span className="file-card__name">{file.name}</span>
        <span className={error ? 'file-card__error' : 'file-card__meta'}>
          {error ?? (runs ? `${formatBytes(file.size)} · Can run programs` : formatBytes(file.size))}
        </span>
      </span>
      {locked ? (
        <button type="button" className="file-card__locked" onClick={onNeedAccount}>
          Sign in to download
        </button>
      ) : (
        <Button size={compact ? 'sm' : 'md'} icon="download" iconOnly={compact} aria-label={`Download ${file.name}`} loading={busy} onClick={download}>
          Download
        </Button>
      )}
      {dialog}
    </div>
  );
}

// A file picked for sending, with its upload progress once sending starts.
// A picture, video or song can go shown in place or as a plain file.
export function PendingFile({ file, progress, onRemove, display = true, onDisplay }) {
  const large = file.size > FREE_FILE_LIMIT;
  const kind = kindOf(file);
  return (
    <div className="file-card file-card--pending">
      <span className="file-card__icon">
        <Icon name={iconOf(kind)} />
      </span>
      <span className="file-card__text">
        <span className="file-card__name">{file.name}</span>
        <span className="file-card__meta">
          {formatBytes(file.size)}
          {progress != null && ` · ${Math.floor(progress * 100)}%`}
        </span>
        {large && <span className="file-card__tier">Very large file · included with {PAID_TIER_NAME}</span>}
        {progress != null && (
          <span className="file-card__bar">
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </span>
      {progress == null && onDisplay && kind !== 'file' && (
        <span className="file-card__show" role="group" aria-label={`How to send ${file.name}`}>
          <button type="button" aria-pressed={display} onClick={() => onDisplay(true)} title={`Show the ${kind === 'image' ? 'picture' : kind} in place`}>
            Show
          </button>
          <button type="button" aria-pressed={!display} onClick={() => onDisplay(false)} title="Send it as a file to download">
            As file
          </button>
        </span>
      )}
      {progress == null && (
        <Button variant="ghost" size="sm" icon="close" iconOnly aria-label={`Remove ${file.name}`} onClick={onRemove} />
      )}
    </div>
  );
}
