import { lazy, Suspense, useState } from 'react';
import { TWO_STEP_REQUIRED } from '../lib/security.js';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';

const TwoStepChallenge = lazy(() => import('./TwoStepChallenge.jsx'));

// New passwords; the project's password policy asks for the same.
export const MIN_PASSWORD = 10;

const nice = (error) => {
  const code = error?.code ?? '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return "That email and password don't match an account.";
  if (code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return `Use at least ${MIN_PASSWORD} characters for the password.`;
  if (code === 'auth/account-exists-with-different-credential') return 'That email signs in another way. Use the one you signed up with.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for mimyne.com and try again.';
  return String(error?.message ?? error).replace('Firebase: ', '');
};

// Sign in the same three ways as the app: Google, Microsoft, or email.
export default function SignInDialog({ onClose }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  // Set when the account has 2-step verification on: Firebase is waiting for the code.
  const [twoStep, setTwoStep] = useState(null);

  /** True when the error was "now the second step", and shows it. */
  async function secondStep(err) {
    if (err?.code !== TWO_STEP_REQUIRED) return false;
    const [{ getMultiFactorResolver }, { auth }] = await Promise.all([import('firebase/auth'), import('../lib/firebase.js')]);
    setTwoStep(getMultiFactorResolver(auth, err));
    setBusy(null);
    return true;
  }

  async function withProvider(which) {
    setBusy(which);
    setError(null);
    const { signInWithPopup } = await import('firebase/auth');
    const { auth, googleProvider, microsoftProvider } = await import('../lib/firebase.js');
    try {
      await signInWithPopup(auth, which === 'google' ? googleProvider : microsoftProvider);
      onClose();
    } catch (err) {
      if (await secondStep(err)) return;
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') setError(nice(err));
      setBusy(null);
    }
  }

  async function withEmail(event) {
    event.preventDefault();
    setError(null);
    if (mode === 'register' && password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    setBusy('email');
    const { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } = await import('firebase/auth');
    const { auth } = await import('../lib/firebase.js');
    try {
      if (mode === 'register') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        // Proof the address is theirs, as in the app. Failing to send doesn't fail the sign-up.
        sendEmailVerification(user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err) {
      if (await secondStep(err)) return;
      setError(nice(err));
      setBusy(null);
    }
  }

  if (twoStep) {
    return (
      <Dialog title="2-step verification" onClose={onClose}>
        <Suspense fallback={null}>
          <TwoStepChallenge resolver={twoStep} onDone={onClose} onBack={() => setTwoStep(null)} />
        </Suspense>
      </Dialog>
    );
  }

  return (
    <Dialog title={mode === 'register' ? 'Make a Mimyne account' : 'Sign in to Mimyne'} onClose={onClose}>
      <p className="muted" style={{ fontSize: 14 }}>The same account as the Mimyne app.</p>
      <Button size="lg" variant="inverse" loading={busy === 'google'} disabled={!!busy} onClick={() => withProvider('google')}>
        Continue with Google
      </Button>
      <Button size="lg" loading={busy === 'microsoft'} disabled={!!busy} onClick={() => withProvider('microsoft')}>
        Continue with Microsoft
      </Button>
      <div className="divider-text">or with email</div>
      <form onSubmit={withEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          Email
          <input className="field__input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input
            className="field__input"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={mode === 'register' ? MIN_PASSWORD : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" size="lg" variant="primary" loading={busy === 'email'} disabled={!!busy}>
          {mode === 'register' ? 'Make account' : 'Sign in'}
        </Button>
      </form>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setMode(mode === 'register' ? 'sign-in' : 'register');
          setError(null);
        }}
      >
        {mode === 'register' ? 'Already have an account? Sign in' : 'New to Mimyne? Make an account'}
      </button>
    </Dialog>
  );
}
