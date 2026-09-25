import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router-dom';
import NotchDock from './Notch.jsx';
import SiteHeader from './SiteHeader.jsx';
import { useSession } from '../data/session.jsx';
import './Layout.css';

export default function Layout() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const leaving = useNavigation().state === 'loading';

  return (
    <div className={`app ${user ? 'app--notch' : ''}`}>
      {user ? <NotchDock /> : <SiteHeader home={pathname === '/'} />}
      <main className={`app__page ${leaving ? 'is-leaving' : ''}`}>
        <div key={pathname} className="app__enter">
          <Outlet />
        </div>
      </main>
      <footer className="app__footer">
        <span>Mimyne, a Wonderma Corporation product</span>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
        <a href="/guidelines.html">Guidelines</a>
        <a href="mailto:mimyne.support@gmail.com">mimyne.support@gmail.com</a>
      </footer>
      <ScrollRestoration />
    </div>
  );
}
