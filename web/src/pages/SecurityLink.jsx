import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useSession } from '../data/session.jsx';
import { confirmLink, linkKind } from '../lib/security.js';
import './Security.css';

/**
 * mimyne.com/security/confirm?t=…: a link from a Mimyne security email.
 * Nothing happens until the button is pressed, so a mail scanner opening
 * the link changes nothing.
 */
export default function SecurityLink() {
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const kind = linkKind(t);
  const { signIn, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      setDone(await confirmLink(t));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const title = kind === 'recover' ? 'Turn off 2-step verification' : 'Confirm your recovery email';

  return (
    <div className="security">
      <header className="security__head">
        <h1 className="security__title">{kind ? title : 'This link doesn’t work'}</h1>
      </header>
      {!kind ? (
        <p className="muted">It may have been cut short. Open it straight from the email, or ask for a new one.</p>
      ) : done?.done === 'verified' ? (
        <p role="status">{done.email} is now your recovery email.</p>
      ) : done?.done === 'recovered' ? (
        <div className="security__done" role="status">
          <p>2-step verification is off, and your account was signed out everywhere. Sign in with your password, then turn it back on from Security in your account menu.</p>
          {status !== 'ready' && <Button variant="inverse" onClick={signIn}>Sign in</Button>}
        </div>
      ) : (
        <div className="security__done">
          <p className="muted">
            {kind === 'recover'
              ? 'This turns off 2-step verification on your account and signs it out everywhere. You will still need your password to sign in.'
              : 'This lets the address this link was sent to turn off 2-step verification on your account if you lose your phone.'}
          </p>
          <Button variant="inverse" loading={busy} onClick={go}>{kind === 'recover' ? 'Turn it off' : 'Confirm'}</Button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
