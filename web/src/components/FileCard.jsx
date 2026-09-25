import { useState } from 'react';
import Icon from './Icon.jsx';
import Button from './Button.jsx';
import { downloadFile } from '../lib/files.js';
import { formatBytes, FREE_FILE_LIMIT, PAID_TIER_NAME } from '../lib/format.js';
import './FileCard.css';

const kindOf = (file) => (file.type?.startsWith('video/') ? 'video' : file.type?.startsWith('image/') ? 'image' : 'file');

// Any file, any size. Signed-out visitors see it but can't download it.
export function FileCard({ file, locked = false, compact = false, onNeedAccount }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(file.path);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`file-card ${compact ? 'file-card--compact' : ''}`}>
      <span className="file-card__icon">
        <Icon name={kindOf(file)} size={compact ? 16 : 18} />
      </span>
      <span className="file-card__text">
        <span className="file-card__name">{file.name}</span>
        <span className={error ? 'file-card__error' : 'file-card__meta'}>{error ?? formatBytes(file.size)}</span>
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
    </div>
  );
}

// A file picked for sending, with its upload progress once sending starts.
export function PendingFile({ file, progress, onRemove }) {
  const large = file.size > FREE_FILE_LIMIT;
  return (
    <div className="file-card file-card--pending">
      <span className="file-card__icon">
        <Icon name={kindOf(file)} />
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
      {progress == null && (
        <Button variant="ghost" size="sm" icon="close" iconOnly aria-label={`Remove ${file.name}`} onClick={onRemove} />
      )}
    </div>
  );
}
