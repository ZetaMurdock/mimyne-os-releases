import { useEffect, useRef, useState } from 'react';
import {
  PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier, TotpMultiFactorGenerator,
} from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { twoStepMessage } from '../lib/security.js';
import Button from './Button.jsx';
import './TwoStepChallenge.css';

const isApp = (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID;
const labelOf = (hint) => (isApp(hint) ? hint.displayName || 'Authenticator app' : `Text to ${hint.phoneNumber ?? 'your phone'}`);

/**
 * The second step of a sign-in: a code from an authenticator app, or one
 * texted to a phone. `resolver` is Firebase's, from the
 * auth/multi-factor-auth-required error; `onDone` gets the signed-in result.
 */
export default function TwoStepChallenge({ resolver, onDone, onBack }) {
  const hints = resolver.hints;
  const [hint, setHint] = useState(() => hints.find(isApp) ?? hints[0]);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(null); // the verification id of a texted code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const captcha = useRef(null);
  const verifier = useRef(null);

  useEffect(() => () => verifier.current?.clear(), []);

  function pick(next) {
    setHint(next);
    setCode('');
    setSent(null);
    setError(null);
  }

  async function sendText() {
    setBusy(true);
    setError(null);
    try {
      verifier.current ??= new RecaptchaVerifier(auth, captcha.current, { size: 'invisible' });
      setSent(await new PhoneAuthProvider(auth).verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, verifier.current));
    } catch (err) {
      setError(twoStepMessage(err));
    }
    setBusy(false);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const digits = code.replace(/\D/g, '');
    try {
      const assertion = isApp(hint)
        ? TotpMultiFactorGenerator.assertionForSignIn(hint.uid, digits)
        : PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(sent, digits));
      onDone(await resolver.resolveSignIn(assertion));
    } catch (err) {
      setError(twoStepMessage(err));
      setBusy(false);
    }
  }

  const needsText = !isApp(hint) && !sent;

  return (
    <div className="two-step">
      <p className="muted" style={{ fontSize: 14 }}>
        {isApp(hint)
          ? 'Enter the 6-digit code from your authenticator app.'
          : sent ? `Enter the code we texted to ${hint.phoneNumber ?? 'your phone'}.` : `We'll text a code to ${hint.phoneNumber ?? 'your phone'}.`}
      </p>
      {hints.length > 1 && (
        <div className="two-step__choices" role="radiogroup" aria-label="Second step">
          {hints.map((h) => (
            <button
              key={h.uid}
              type="button"
              role="radio"
              aria-checked={h.uid === hint.uid}
              className={`two-step__choice ${h.uid === hint.uid ? 'is-on' : ''}`}
              onClick={() => pick(h)}
            >
              {labelOf(h)}
            </button>
          ))}
        </div>
      )}
      {needsText ? (
        <Button size="lg" variant="primary" loading={busy} onClick={sendText}>Text me a code</Button>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            Code
            <input
              className="field__input two-step__code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <Button type="submit" size="lg" variant="primary" loading={busy}>Verify</Button>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div ref={captcha} />
      <div className="two-step__foot">
        {onBack && <button type="button" className="link-button" onClick={onBack}>Back</button>}
        <a className="link-button" href="/security/recover">Lost your device?</a>
      </div>
    </div>
  );
}
