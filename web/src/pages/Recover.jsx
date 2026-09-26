import { useState } from 'react';
import Button from '../components/Button.jsx';
import { useSession } from '../data/session.jsx';
import { recover } from '../lib/security.js';
import '../components/Dialog.css';
import './Security.css';

/**
 * mimyne.com/security/recover: lost the phone or app for 2-step
 * verification. A backup code turns it off now; a recovery email gets a link
 * that does. Either way the password is still needed to sign in after.
 */
export default function Recover() {
  const { signIn } = useSession();
  const [how, setHow] = useState('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await recover(email.trim(), how === 'code' ? code : null);
      setDone(how);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="security">
      <header className="security__head">
        <h1 className="security__title">Get back into your account</h1>
        <p className="muted">For when you can&apos;t get a 2-step verification code.</p>
      </header>

      {done === 'code' ? (
        <div className="security__done" role="status">
          <p>2-step verification is off, and your account was signed out everywhere. Sign in with your password, then turn it back on from Security in your account menu.</p>
          <Button variant="inverse" onClick={signIn}>Sign in</Button>
        </div>
      ) : done === 'email' ? (
        <div className="security__done" role="status">
          <p>If that account has a recovery email, we sent it a link. It works for an hour.</p>
          <p className="muted">Nothing there? Check spam, or use a backup code instead.</p>
        </div>
      ) : (
        <>
          <div className="security__tabs" role="radiogroup" aria-label="How">
            <button type="button" role="radio" aria-checked={how === 'code'} className={how === 'code' ? 'is-on' : ''} onClick={() => setHow('code')}>Backup code</button>
            <button type="button" role="radio" aria-checked={how === 'email'} className={how === 'email' ? 'is-on' : ''} onClick={() => setHow('email')}>Recovery email</button>
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="field">
              Your account&apos;s email
              <input className="field__input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {how === 'code' && (
              <label className="field">
                Backup code
                <input className="field__input" autoComplete="off" spellCheck={false} placeholder="xxxxx-xxxxx" required value={code} onChange={(e) => setCode(e.target.value)} />
                <span className="field__hint">One of the 10 codes you saved when you turned on 2-step verification.</span>
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div>
              <Button type="submit" variant="inverse" loading={busy}>{how === 'code' ? 'Turn off 2-step verification' : 'Email me a link'}</Button>
            </div>
          </form>
          <p className="muted" style={{ fontSize: 13 }}>
            No codes and no recovery email? Mimyne&apos;s team can&apos;t turn it off for you, because that would let anyone who asks into your account.
          </p>
        </>
      )}
    </div>
  );
}
