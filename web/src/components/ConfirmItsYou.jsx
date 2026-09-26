import { useState } from 'react';
import {
  EmailAuthProvider, getMultiFactorResolver, reauthenticateWithCredential, reauthenticateWithPopup,
} from 'firebase/auth';
import { auth, googleProvider, microsoftProvider } from '../lib/firebase.js';
import { TWO_STEP_REQUIRED, twoStepMessage } from '../lib/security.js';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import TwoStepChallenge from './TwoStepChallenge.jsx';

/**
 * Signs the person in again before a change to their account's security: the
 * way they signed up (password, Google or Microsoft), then their 2-step code
 * if it's on. `onDone` runs once they have.
 */
export default function ConfirmItsYou({ onDone, onClose }) {
  const user = auth.currentUser;
  const providers = (user?.providerData ?? []).map((p) => p.providerId);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [twoStep, setTwoStep] = useState(null);

  async function attempt(which, run) {
    setBusy(which);
    setError(null);
    try {
      await run();
      onDone();
    } catch (err) {
      if (err?.code === TWO_STEP_REQUIRED) {
        setTwoStep(getMultiFactorResolver(auth, err));
      } else if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setError("That password isn't right.");
      } else if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setError(twoStepMessage(err));
      }
      setBusy(null);
    }
  }

  if (twoStep) {
    return (
      <Dialog title="Confirm it's you" onClose={onClose}>
        <TwoStepChallenge resolver={twoStep} onDone={onDone} onBack={() => setTwoStep(null)} />
      </Dialog>
    );
  }

  return (
    <Dialog title="Confirm it's you" onClose={onClose}>
      <p className="muted" style={{ fontSize: 14 }}>For your security, sign in again before changing this.</p>
      {providers.includes('google.com') && (
        <Button size="lg" variant="inverse" loading={busy === 'google'} disabled={!!busy}
          onClick={() => attempt('google', () => reauthenticateWithPopup(user, googleProvider))}>
          Continue with Google
        </Button>
      )}
      {providers.includes('microsoft.com') && (
        <Button size="lg" loading={busy === 'microsoft'} disabled={!!busy}
          onClick={() => attempt('microsoft', () => reauthenticateWithPopup(user, microsoftProvider))}>
          Continue with Microsoft
        </Button>
      )}
      {providers.includes('password') && (
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            attempt('password', () => reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password)));
          }}
        >
          <label className="field">
            Password
            <input className="field__input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button type="submit" size="lg" variant="primary" loading={busy === 'password'} disabled={!!busy}>Continue</Button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Dialog>
  );
}
