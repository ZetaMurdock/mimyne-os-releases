import { useState } from 'react';
import { useRevalidator } from 'react-router-dom';
import Button from './Button.jsx';
import { useSession } from '../data/session.jsx';

// Pledge → Pledging → Pledged. Signed out, it asks you to sign in first.
// `pledgedHere`: the page already knows (from the Hub's own member list).
export default function PledgeButton({ hub, size = 'md', quiet = false, owner = false, pledgedHere = false }) {
  const { user, pledged, pledge, unpledge, signIn } = useSession();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isPledged = pledged.has(hub.id) || pledgedHere;

  if (!user) {
    return (
      <Button variant={quiet ? 'secondary' : 'primary'} size={size} onClick={signIn}>
        Sign in to pledge
      </Button>
    );
  }
  if (owner || hub.ownerId === user.uid) {
    return <Button size={size} selected disabled>Your Hub</Button>;
  }

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action(hub.id);
      // The page's pledged count and who may post come from its loader.
      revalidator.revalidate();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "You can't pledge to this Hub." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={isPledged ? 'secondary' : quiet ? 'secondary' : 'primary'}
      size={size}
      selected={isPledged}
      loading={busy}
      title={error ?? undefined}
      aria-label={isPledged ? `Pledged to ${hub.name}. Press to leave.` : undefined}
      onClick={() => run(isPledged ? unpledge : pledge)}
    >
      {busy ? (isPledged ? 'Leaving' : 'Pledging') : isPledged ? 'Pledged' : error ? 'Try again' : 'Pledge'}
    </Button>
  );
}
