import { useId, useRef, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import Button from './Button.jsx';
import { PendingFile } from './FileCard.jsx';
import { uploadFile } from '../lib/files.js';
import { useSession } from '../data/session.jsx';
import './Composer.css';

// Post anything: words, a link, a clip, any file. Used for posts (with a
// "Post to" choice), comments and replies. Files upload when it's sent, each
// with its own progress, and what's sent carries their labels.
export default function Composer({
  placeholder = 'Post anything: words, a link, a clip, any file',
  destinations,
  destination: initialDestination,
  submitLabel = 'Post',
  compact = false,
  autoFocus = false,
  onSubmit,
  onCancel,
}) {
  const { user } = useSession();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [destination, setDestination] = useState(initialDestination ?? destinations?.[0]?.value ?? '');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);
  const fileInput = useRef(null);
  const mediaInput = useRef(null);
  const selectId = useId();

  const canSend = !sending && (text.trim() || files.length);

  function addFiles(list) {
    const picked = [...list].map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file }));
    setFiles((prev) => [...prev, ...picked.filter((p) => !prev.some((q) => q.id === p.id))].slice(0, 10));
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const labels = [];
      for (const { id, file } of files) {
        labels.push(await uploadFile(file, (p) => setProgress((prev) => ({ ...prev, [id]: p }))));
      }
      await onSubmit({ text: text.trim(), files: labels, destination });
      setText('');
      setFiles([]);
    } catch (err) {
      setError(err.code === 'permission-denied' ? "You can't post here." : err.message);
    } finally {
      setSending(false);
      setProgress({});
    }
  }

  return (
    <form
      className={`composer ${compact ? 'composer--compact' : 'card'}`}
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="composer__row">
        {!compact && <Avatar person={user} size={40} />}
        <textarea
          className="composer__input"
          aria-label={placeholder}
          placeholder={placeholder}
          rows={compact ? 2 : 2}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          // Pictures and GIFs pasted straight in are attached.
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="composer__files">
          {files.map(({ id, file }) => (
            <PendingFile key={id} file={file} progress={progress[id]} onRemove={() => setFiles((prev) => prev.filter((p) => p.id !== id))} />
          ))}
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="composer__bar">
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
        <input
          ref={mediaInput}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))}
        />
        <Button variant="ghost" icon="paperclip" iconOnly={compact} aria-label="Attach a file" onClick={() => fileInput.current.click()}>
          File
        </Button>
        <Button variant="ghost" icon="image" iconOnly={compact} aria-label="Add a photo or video" onClick={() => mediaInput.current.click()}>
          Photo or video
        </Button>
        <span className="composer__spacer" />
        {destinations && (
          <>
            <label htmlFor={selectId} className="composer__to">
              Post to
            </label>
            <select id={selectId} className="composer__select" value={destination} onChange={(e) => setDestination(e.target.value)}>
              {destinations.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </>
        )}
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={sending} disabled={!canSend || !user}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
