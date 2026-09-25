import { useState } from 'react';
import Button from './Button.jsx';
import { useSession } from '../data/session.jsx';

// Pledge → Pledging → Pledged. Signed out, it asks you to sign in first.
export default function PledgeButton({ hub, size = 'md', quiet = false }) {
  const { user, pledged, pledge, unpledge, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const isPledged = pledged.has(hub.id);

  if (!user) {
    return (
      <Button variant={quiet ? 'secondary' : 'primary'} size={size} onClick={signIn}>
        Sign in to pledge
      </Button>
    );
  }

  if (isPledged) {
    return (
      <Button size={size} selected onClick={() => unpledge(hub.id)} aria-label={`Pledged to ${hub.name}. Press to leave.`}>
        Pledged
      </Button>
    );
  }

  return (
    <Button
      variant={quiet ? 'secondary' : 'primary'}
      size={size}
      loading={busy}
      onClick={() => {
        setBusy(true);
        setTimeout(() => {
          pledge(hub.id);
          setBusy(false);
        }, 350);
      }}
    >
      {busy ? 'Pledging' : 'Pledge'}
    </Button>
  );
}
