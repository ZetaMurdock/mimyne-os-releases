import { useState } from 'react';
import { downloadFile } from '../lib/files.js';
import { fileRisk } from '../lib/fileSafety.js';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';

/**
 * Downloading a shared file: a program or script is only downloaded after
 * its person says so, and a file that carries its SHA-256 is checked before
 * it's saved. Gives { start(file), busy, error, dialog }; render `dialog`.
 */
export function useSafeDownload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);

  async function go(file) {
    setAsking(null);
    setBusy(true);
    setError(null);
    try {
      await downloadFile(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function start(file) {
    if (fileRisk(file.name).runs) setAsking(file);
    else go(file);
  }

  const risk = asking ? fileRisk(asking.name) : null;
  const dialog = asking && (
    <Dialog title="This file can run on your computer" onClose={() => setAsking(null)}>
      <p className="file-warning__name">{asking.name}</p>
      {risk.disguised && (
        <p className="form-error" role="alert">
          Its name makes it look like a .{asking.name.split('.').at(-2).toLowerCase()} file, but it&apos;s really a .{risk.ext} file.
        </p>
      )}
      <p className="muted" style={{ fontSize: 14 }}>
        A .{risk.ext} file can run programs or scripts when it&apos;s opened. Only download it if you trust whoever shared it and you were expecting it.
      </p>
      <div className="file-warning__actions">
        <Button variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
        <Button onClick={() => go(asking)}>Download anyway</Button>
      </div>
    </Dialog>
  );

  return { start, busy, error, dialog };
}
