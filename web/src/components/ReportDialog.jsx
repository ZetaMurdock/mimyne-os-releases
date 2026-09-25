import { useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { REASONS, fileReport } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import './ReportDialog.css';

const WHAT = {
  person: 'this person', post: 'this post', comment: 'this comment', message: 'this message',
  hub: 'this Hub', room: 'this Room', clip: 'this clip', file: 'this file',
};

/**
 * Report someone, or something they posted, to Mimyne's staff. `about` is
 * { targetUid, kind, link?, excerpt? } (data/reports.js, fileReport).
 */
export default function ReportDialog({ about, onClose }) {
  const { user } = useSession();
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [state, setState] = useState('picking'); // picking | sending | sent
  const [error, setError] = useState(null);
  const what = WHAT[about.kind] ?? WHAT.person;

  async function send(e) {
    e.preventDefault();
    if (!reason || !user) return;
    setState('sending');
    setError(null);
    try {
      await fileReport(user.uid, about, reason, details);
      setState('sent');
    } catch {
      setState('picking');
      setError("The report couldn't be sent. Try again in a moment.");
    }
  }

  if (state === 'sent') {
    return (
      <Dialog title="Thanks for telling us" onClose={onClose}>
        <p className="muted report__lead">
          Mimyne&apos;s team will look at it. The person won&apos;t know who reported them.
        </p>
        <Button variant="inverse" onClick={onClose}>Done</Button>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Report ${what}`} onClose={onClose}>
      <form className="report" onSubmit={send}>
        <p className="muted report__lead">What&apos;s wrong with it? Only Mimyne&apos;s team sees reports.</p>
        <div className="report__reasons" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              className={`report__reason ${reason === r.id ? 'is-on' : ''}`}
              onClick={() => setReason(r.id)}
            >
              <span className="report__dot" />
              {r.label}
            </button>
          ))}
        </div>
        <label className="field">
          Anything else we should know? (optional)
          <textarea className="field__input" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="report__actions">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="inverse" disabled={!reason} loading={state === 'sending'}>Send report</Button>
        </div>
      </form>
    </Dialog>
  );
}
