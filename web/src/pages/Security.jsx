import { useEffect, useRef, useState } from 'react';
import {
  PhoneAuthProvider, PhoneMultiFactorGenerator, RecaptchaVerifier, TotpMultiFactorGenerator, multiFactor, sendEmailVerification,
} from 'firebase/auth';
import QRCode from 'qrcode';
import Button from '../components/Button.jsx';
import ConfirmItsYou from '../components/ConfirmItsYou.jsx';
import Icon from '../components/Icon.jsx';
import { amStaff } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import { auth } from '../lib/firebase.js';
import {
  addRecoveryEmail, makeBackupCodes, mySecurity, needsFreshSignIn, removeRecoveryEmail, signOutEverywhere, twoStepMessage,
} from '../lib/security.js';
import NeedsAccount from './NeedsAccount.jsx';
import '../components/Dialog.css';
import './Security.css';

const dateOf = (value) => (value ? new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '');
const isApp = (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID;

/** mimyne.com/settings/security: 2-step verification and the ways back in. */
export default function Security() {
  const { user, status } = useSession();
  if (status === 'loading' || status === 'off') return null;
  if (!user) return <NeedsAccount what="your security settings" />;
  return <Settings key={user.uid} uid={user.uid} />;
}

function Settings({ uid }) {
  const { signOut } = useSession();
  const me = auth.currentUser;
  const [factors, setFactors] = useState(() => [...multiFactor(me).enrolledFactors]);
  const [verified, setVerified] = useState(me.emailVerified);
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [staff, setStaff] = useState(false);
  const [adding, setAdding] = useState(null); // 'app' | 'phone'
  const [codes, setCodes] = useState(null); // new backup codes, shown once
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => mySecurity().then((next) => {
    setInfo(next);
    setInfoError(null);
  }, (err) => setInfoError(err.message));

  useEffect(() => {
    load();
    amStaff(uid).then(setStaff, () => {});
    // A sign-in restored from this browser can predate verifying the email elsewhere.
    if (!me.emailVerified) {
      me.reload()
        .then(async () => {
          if (!auth.currentUser?.emailVerified) return;
          await auth.currentUser.getIdToken(true);
          setVerified(true);
        })
        .catch(() => {});
    }
  }, [uid]);

  /** Runs `action`; when it needs a fresh sign-in, asks for one and runs it once more. */
  function fresh(action) {
    return action().catch((err) => {
      if (!needsFreshSignIn(err)) throw err;
      return new Promise((resolve, reject) => {
        setConfirming({
          done: () => {
            setConfirming(null);
            action().then(resolve, reject);
          },
          cancel: () => {
            setConfirming(null);
            reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
          },
        });
      });
    });
  }

  /** A button's work: shows its failure, unless the person backed out. */
  async function run(which, action) {
    setBusy(which);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err?.code !== 'cancelled') setError(twoStepMessage(err));
    }
    setBusy(null);
  }

  async function added() {
    setAdding(null);
    setFactors([...multiFactor(auth.currentUser).enrolledFactors]);
    // The first second step comes with backup codes, so losing it isn't losing the account.
    const now = await mySecurity().catch(() => null);
    if (now) setInfo(now);
    if (now && now.codesLeft === 0) {
      await run('codes', async () => setCodes((await fresh(makeBackupCodes)).codes));
      load();
    }
  }

  function remove(factor) {
    const last = factors.length === 1;
    if (!window.confirm(last ? 'Turn off 2-step verification? Your account will only need your password again.' : `Remove ${factor.displayName || 'this second step'}?`)) return;
    run(`remove-${factor.uid}`, async () => {
      await fresh(() => multiFactor(auth.currentUser).unenroll(factor.uid));
      setFactors([...multiFactor(auth.currentUser).enrolledFactors]);
    });
  }

  const on = factors.length > 0;
  // 2-step needs the Firebase project on Identity Platform; the file service
  // says whether it's switched on (TWO_STEP). Until then none of it shows,
  // except second steps someone already has, so they can still remove them.
  const twoStep = info?.twoStep === true;

  return (
    <div className="security">
      <header className="security__head">
        <h1 className="security__title">Security</h1>
        <p className="muted">Keep your Mimyne account yours.</p>
      </header>

      {twoStep && staff && !on && (
        <p className="security__banner" role="status">
          <Icon name="lock" size={16} />
          Staff tools will need 2-step verification. Turn it on now so you aren&apos;t locked out of them.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="security__section" aria-labelledby="email">
        <div className="security__row">
          <div>
            <h2 className="security__h2" id="email">Email</h2>
            <p className="muted security__address">{me.email}</p>
          </div>
          <span className={`security__state ${verified ? 'is-on' : ''}`}>{verified ? 'Verified' : 'Not verified'}</span>
        </div>
        {!verified && <VerifyEmail onVerified={() => setVerified(true)} />}
      </section>

      {(twoStep || on) && (
      <section className="security__section" aria-labelledby="two-step">
        <div className="security__row">
          <div>
            <h2 className="security__h2" id="two-step">2-step verification</h2>
            <p className="muted">After your password, a code from your phone. Someone with your password alone can&apos;t get in.</p>
          </div>
          <span className={`security__state ${on ? 'is-on' : ''}`}>{on ? 'On' : 'Off'}</span>
        </div>

        {factors.map((factor) => (
          <div className="security__item" key={factor.uid}>
            <Icon name={isApp(factor) ? 'lock' : 'message'} size={16} />
            <div className="security__item-text">
              <span>{isApp(factor) ? factor.displayName || 'Authenticator app' : `Text message · ${factor.phoneNumber ?? ''}`}</span>
              <span className="muted">Added {dateOf(factor.enrollmentTime)}</span>
            </div>
            <Button size="sm" variant="ghost" loading={busy === `remove-${factor.uid}`} onClick={() => remove(factor)}>Remove</Button>
          </div>
        ))}

        {!twoStep ? null : !verified ? (
          <p className="muted">Verify your email above to turn this on.</p>
        ) : adding === 'app' ? (
          <AddApp fresh={fresh} onDone={added} onCancel={() => setAdding(null)} />
        ) : adding === 'phone' ? (
          <AddPhone fresh={fresh} onDone={added} onCancel={() => setAdding(null)} />
        ) : (
          <div className="security__actions">
            <Button variant={on ? 'secondary' : 'inverse'} icon="lock" onClick={() => setAdding('app')}>Add authenticator app</Button>
            <Button icon="message" onClick={() => setAdding('phone')}>Add phone</Button>
          </div>
        )}
      </section>
      )}

      {codes && <NewCodes codes={codes} onClose={() => setCodes(null)} />}

      {twoStep && on && (
        <section className="security__section" aria-labelledby="codes">
          <div className="security__row">
            <div>
              <h2 className="security__h2" id="codes">Backup codes</h2>
              <p className="muted">One-time codes for when you don&apos;t have your phone. Keep them somewhere safe, like a password manager.</p>
            </div>
          </div>
          <div className="security__row">
            <span className="security__count">
              {info ? `${info.codesLeft} of 10 left${info.codesMadeAt ? ` · made ${dateOf(info.codesMadeAt)}` : ''}` : infoError ?? '…'}
            </span>
            <Button
              size="sm"
              loading={busy === 'codes'}
              onClick={() => {
                if (info?.codesLeft && !window.confirm('Make new codes? The ones you have now will stop working.')) return;
                run('codes', async () => {
                  setCodes((await fresh(makeBackupCodes)).codes);
                  load();
                });
              }}
            >
              {info?.codesLeft ? 'Make new codes' : 'Make codes'}
            </Button>
          </div>
        </section>
      )}

      {twoStep && (
        <section className="security__section" aria-labelledby="recovery">
          <div className="security__row">
            <div>
              <h2 className="security__h2" id="recovery">Recovery email</h2>
              <p className="muted">A second address that can turn off 2-step verification if you lose your phone and your codes.</p>
            </div>
          </div>
          <RecoveryEmail info={info} fresh={fresh} busy={busy} run={run} reload={load} />
        </section>
      )}

      <section className="security__section" aria-labelledby="devices">
        <div className="security__row">
          <div>
            <h2 className="security__h2" id="devices">Signed-in devices</h2>
            <p className="muted">Sign out of Mimyne on every computer and phone, including this one. Others sign out within the hour.</p>
          </div>
          <Button
            size="sm"
            loading={busy === 'everywhere'}
            onClick={() => {
              if (!window.confirm('Sign out everywhere?')) return;
              run('everywhere', async () => {
                await fresh(signOutEverywhere);
                await signOut();
              });
            }}
          >
            Sign out everywhere
          </Button>
        </div>
      </section>

      {confirming && <ConfirmItsYou onDone={confirming.done} onClose={confirming.cancel} />}
    </div>
  );
}

function VerifyEmail({ onVerified }) {
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState(null);
  return (
    <div className="security__panel">
      <p>Open the link we emailed you to verify this address. It proves the account is yours.</p>
      <div className="security__actions">
        <Button size="sm" disabled={sent} onClick={() => sendEmailVerification(auth.currentUser).then(() => setSent(true), (e) => setNote(twoStepMessage(e)))}>
          {sent ? 'Sent. Check your inbox' : 'Send verification email'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              await auth.currentUser.getIdToken(true);
              onVerified();
            } else setNote("It isn't verified yet. Open the link in the email first.");
          }}
        >
          I&apos;ve verified it
        </Button>
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

function CodeForm({ label = 'Verify', onSubmit, busy }) {
  const [code, setCode] = useState('');
  return (
    <form className="security__code" onSubmit={(e) => { e.preventDefault(); onSubmit(code.replace(/\D/g, '')); }}>
      <label className="field">
        Code
        <input className="field__input" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <Button type="submit" variant="inverse" loading={busy}>{label}</Button>
    </form>
  );
}

function AddApp({ fresh, onDone, onCancel }) {
  const [secret, setSecret] = useState(null);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    fresh(async () => TotpMultiFactorGenerator.generateSecret(await multiFactor(auth.currentUser).getSession()))
      .then(async (s) => {
        if (!live) return;
        setSecret(s);
        setQr(await QRCode.toDataURL(s.generateQrCodeUrl(auth.currentUser.email ?? 'Mimyne account', 'Mimyne'), { margin: 1, width: 184 }));
      })
      .catch((err) => live && (err?.code === 'cancelled' ? onCancel() : setError(twoStepMessage(err))));
    return () => {
      live = false;
    };
  }, []);

  async function verify(code) {
    setBusy(true);
    setError(null);
    try {
      await fresh(() => multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Authenticator app'));
      onDone();
    } catch (err) {
      if (err?.code !== 'cancelled') setError(twoStepMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="security__panel">
      {!secret ? (
        error ? <p className="form-error" role="alert">{error}</p> : <p className="muted">Getting a code ready…</p>
      ) : (
        <>
          <ol className="security__steps">
            <li>Open an authenticator app, such as Google Authenticator, 1Password or Authy.</li>
            <li>Scan this code, or enter the key by hand.</li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          <div className="security__qr">
            {qr && <img src={qr} width={184} height={184} alt="QR code for your authenticator app" />}
            <code className="security__key" aria-label="Key">{secret.secretKey.match(/.{1,4}/g).join(' ')}</code>
          </div>
          <CodeForm onSubmit={verify} busy={busy} label="Turn on" />
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      )}
      <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function AddPhone({ fresh, onDone, onCancel }) {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const captcha = useRef(null);
  const verifier = useRef(null);

  useEffect(() => () => verifier.current?.clear(), []);

  async function send(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const number = phone.replace(/[^\d+]/g, '');
      const id = await fresh(async () => {
        const session = await multiFactor(auth.currentUser).getSession();
        verifier.current ??= new RecaptchaVerifier(auth, captcha.current, { size: 'invisible' });
        return new PhoneAuthProvider(auth).verifyPhoneNumber({ phoneNumber: number.startsWith('+') ? number : `+1${number}`, session }, verifier.current);
      });
      setSent(id);
    } catch (err) {
      if (err?.code !== 'cancelled') setError(twoStepMessage(err));
    }
    setBusy(false);
  }

  async function verify(code) {
    setBusy(true);
    setError(null);
    try {
      const assertion = PhoneMultiFactorGenerator.assertion(PhoneAuthProvider.credential(sent, code));
      await fresh(() => multiFactor(auth.currentUser).enroll(assertion, 'Phone'));
      onDone();
    } catch (err) {
      if (err?.code !== 'cancelled') setError(twoStepMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="security__panel">
      {!sent ? (
        <form className="security__code" onSubmit={send}>
          <label className="field">
            Phone number
            <input className="field__input" type="tel" autoComplete="tel" placeholder="+1 555 123 4567" required value={phone} onChange={(e) => setPhone(e.target.value)} />
            <span className="field__hint">With the country code. Texts may cost you what your carrier charges.</span>
          </label>
          <Button type="submit" variant="inverse" loading={busy}>Text me a code</Button>
        </form>
      ) : (
        <>
          <p>Enter the code we texted to {phone}.</p>
          <CodeForm onSubmit={verify} busy={busy} label="Turn on" />
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div ref={captcha} />
      <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function NewCodes({ codes, onClose }) {
  const text = `Mimyne backup codes\nEach works once. Use one at mimyne.com/security/recover.\n\n${codes.join('\n')}\n`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="security__section security__codes" aria-label="Your new backup codes">
      <h2 className="security__h2">Your backup codes</h2>
      <p className="muted">Save these now. You won&apos;t see them again. Each one works once.</p>
      <ul className="security__code-list">
        {codes.map((c) => <li key={c}><code>{c}</code></li>)}
      </ul>
      <div className="security__actions">
        <Button size="sm" icon="copy" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</Button>
        <Button size="sm" icon="download" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="mimyne-backup-codes.txt">Download</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>I&apos;ve saved them</Button>
      </div>
    </section>
  );
}

function RecoveryEmail({ info, fresh, busy, run, reload }) {
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  if (!info) return null;
  if (!info.emailReady) return <p className="muted">Recovery email isn&apos;t available yet. Keep your backup codes somewhere safe.</p>;

  const form = (
    <form
      className="security__code"
      onSubmit={(e) => {
        e.preventDefault();
        run('recovery', async () => {
          await fresh(() => addRecoveryEmail(email.trim()));
          setEditing(false);
          setEmail('');
          await reload();
        });
      }}
    >
      <label className="field">
        {info.recovery ? 'New address' : 'Address'}
        <input className="field__input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Button type="submit" loading={busy === 'recovery'}>Send confirmation</Button>
    </form>
  );

  return (
    <>
      {info.recovery && (
        <div className="security__item">
          <Icon name="send" size={16} />
          <div className="security__item-text">
            <span>{info.recovery.email}</span>
            <span className="muted">Confirmed {dateOf(info.recovery.since)}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>Change</Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'remove-recovery'}
            onClick={() => window.confirm('Remove your recovery email?') && run('remove-recovery', async () => {
              await fresh(removeRecoveryEmail);
              await reload();
            })}
          >
            Remove
          </Button>
        </div>
      )}
      {info.pending && <p className="security__pending">Check {info.pending} for a link to confirm it. It works for 24 hours.</p>}
      {(!info.recovery || editing) && form}
    </>
  );
}
