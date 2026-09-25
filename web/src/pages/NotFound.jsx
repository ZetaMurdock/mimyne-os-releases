import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import Button from '../components/Button.jsx';

export default function NotFound() {
  const error = useRouteError();
  const missing = !error || (isRouteErrorResponse(error) && error.status === 404);

  return (
    <div style={{ width: 'min(520px, 100% - 32px)', margin: '120px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800 }}>{missing ? 'Nothing here' : 'Something broke'}</h1>
      <p className="muted">{missing ? "That page doesn't exist, or it was taken down." : 'Try again in a moment.'}</p>
      <Button to="/" variant="secondary">
        Go home
      </Button>
    </div>
  );
}
