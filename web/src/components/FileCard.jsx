import Icon from './Icon.jsx';
import Button from './Button.jsx';
import { formatBytes, FREE_FILE_LIMIT, PAID_TIER_NAME } from '../lib/format.js';
import './FileCard.css';

// Any file, any size. Signed-out visitors see it but can't download it.
export function FileCard({ file, locked = false, compact = false }) {
  return (
    <div className={`file-card ${compact ? 'file-card--compact' : ''}`}>
      <span className="file-card__icon">
        <Icon name={file.kind === 'video' ? 'video' : file.kind === 'image' ? 'image' : 'file'} size={compact ? 16 : 18} />
      </span>
      <span className="file-card__text">
        <span className="file-card__name">{file.name}</span>
        <span className="file-card__meta">{formatBytes(file.size)}</span>
      </span>
      {locked ? (
        <span className="file-card__locked">Sign in to download</span>
      ) : (
        <Button
          size={compact ? 'sm' : 'md'}
          icon="download"
          iconOnly={compact}
          aria-label={`Download ${file.name}`}
          title="Downloads start working once files are stored in Mimyne's cloud"
        >
          Download
        </Button>
      )}
    </div>
  );
}

// A file that's been picked but not sent yet.
export function PendingFile({ file, onRemove }) {
  const large = file.size > FREE_FILE_LIMIT;
  return (
    <div className="file-card file-card--pending">
      <span className="file-card__icon">
        <Icon name={file.kind === 'video' ? 'video' : file.kind === 'image' ? 'image' : 'file'} />
      </span>
      <span className="file-card__text">
        <span className="file-card__name">{file.name}</span>
        <span className="file-card__meta">
          {formatBytes(file.size)} · keeps uploading if you close Mimyne
        </span>
        {large && <span className="file-card__tier">Very large file · included with {PAID_TIER_NAME}</span>}
      </span>
      <Button variant="ghost" size="sm" icon="close" iconOnly aria-label={`Remove ${file.name}`} onClick={onRemove} />
    </div>
  );
}
