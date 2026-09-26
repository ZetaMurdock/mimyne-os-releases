import { Link } from 'react-router-dom';
import Button from './Button.jsx';
import { useSession } from '../data/session.jsx';
import { useWindowsDownload } from '../lib/useWindowsDownload.js';
import { SOCIAL } from '../lib/features.js';
import './SiteHeader.css';

// Signed out, the site has a plain header. Signing in swaps it for the notch.
export default function SiteHeader({ home = false }) {
  const { signIn } = useSession();
  const { href: download } = useWindowsDownload();

  return (
    <header className="site-header">
      <Link to="/" className="site-header__title">
        Mimyne
      </Link>
      <nav className="site-header__nav" aria-label="Site">
        {SOCIAL && <Link to="/pricing">Pricing</Link>}
        <a href="/guidelines.html">Guidelines</a>
      </nav>
      <span className="site-header__spacer" />
      {SOCIAL && (
        <button type="button" className="site-header__signin" onClick={signIn}>
          Sign in
        </button>
      )}
      {!home && (
        <Button variant="inverse" href={download} icon="download" className="site-header__get">
          Get Mimyne for Windows
        </Button>
      )}
    </header>
  );
}
