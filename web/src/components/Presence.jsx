import { useEffect, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { saveStatusSettings, useStatus, watchStatusSettings } from '../data/status.js';
import { useSession } from '../data/session.jsx';
import { statusLine } from '../lib/status.js';
import './Presence.css';

/** The little dot: green online, amber away, nothing when offline. */
export function StatusDot({ status, size = 10 }) {
  if (status.state === 'offline') return null;
  return <span className={`status-dot is-${status.state}`} style={{ width: size, height: size }} title={statusLine(status)} aria-label={statusLine(status)} />;
}

/** Someone's picture wearing their status. */
export function AvatarWithStatus({ person, size = 32 }) {
  const status = useStatus(person?.uid);
  return (
    <span className="with-status">
      <Avatar person={person} size={size} />
      <StatusDot status={status} size={Math.min(20, Math.max(8, Math.round(size / 3.4)))} />
    </span>
  );
}

/** Their status as words, for a profile: "● In the app · Conlang". */
export function StatusLine({ uid }) {
  const status = useStatus(uid);
  return (
    <span className={`status-line is-${status.state}`}>
      <span className="status-line__dot" aria-hidden="true" />
      {statusLine(status)}
    </span>
  );
}

const MODES = [
  { id: 'auto', label: 'Online', note: 'Buddies see when you’re around.' },
  { id: 'away', label: 'Away', note: 'Shown as away wherever you are.' },
  { id: 'invisible', label: 'Invisible', note: 'You look offline. Nobody can tell.' },
];

/** How you appear, on your own profile: online, away or invisible, and your workspace. */
export function StatusControls() {
  const { user } = useSession();
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => watchStatusSettings(user.uid, setSettings), [user.uid]);
  if (!settings) return null;

  async function save(next) {
    setSettings(next);
    setError(null);
    try {
      await saveStatusSettings(user.uid, next);
    } catch {
      setError("That didn't save. The newest rules may not be deployed yet.");
    }
  }

  return (
    <section className="card side-card status-controls" aria-label="How you appear">
      <h2 className="side-card__title">How you appear</h2>
      <StatusLine uid={user.uid} />
      <div className="status-controls__modes" role="radiogroup" aria-label="Your status">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={settings.mode === m.id} onClick={() => save({ ...settings, mode: m.id })}>
            <span className={`status-dot is-${m.id === 'auto' ? 'online' : m.id === 'away' ? 'away' : 'invisible'}`} />
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted status-controls__note">{MODES.find((m) => m.id === settings.mode)?.note}</p>
      <label className="status-controls__share">
        <input type="checkbox" checked={settings.shareWorkspace} onChange={(e) => save({ ...settings, shareWorkspace: e.target.checked })} />
        Show which workspace I’m in (from the app)
      </label>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
