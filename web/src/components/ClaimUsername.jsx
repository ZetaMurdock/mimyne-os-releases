import { useState } from 'react';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import { claimUsername, usernameProblem } from '../data/identity.js';

// Everyone has a username before they get in, on the site as in the app.
export default function ClaimUsername({ firebaseUser, onDone, onSignOut }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const problem = name ? usernameProblem(name) : null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await claimUsername(firebaseUser.uid, name, { displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="Pick your username">
      <p className="muted" style={{ fontSize: 14 }}>
        It's how people find you on Mimyne. You can change it once a week.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          Username
          <input className="field__input" autoComplete="username" required value={name} onChange={(e) => setName(e.target.value)} />
          <span className="field__hint">{problem ?? '3 to 20 letters, numbers or underscores.'}</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" size="lg" variant="primary" loading={busy} disabled={!name || !!problem}>
          Continue
        </Button>
      </form>
      <button type="button" className="link-button" onClick={onSignOut}>
        Sign out
      </button>
    </Dialog>
  );
}
