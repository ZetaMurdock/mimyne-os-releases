import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { useSession } from '../data/session.jsx';

export default function NeedsAccount({ what }) {
  const { signIn } = useSession();
  return (
    <div className="card" style={{ width: 'min(520px, 100% - 32px)', margin: '96px auto 0', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <Icon name="lock" size={24} />
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Sign in to see {what}</h1>
      <p className="muted">Hub pages are open to everyone. Your feed and messages need a Mimyne account.</p>
      <Button variant="primary" onClick={signIn}>
        Sign in
      </Button>
    </div>
  );
}
