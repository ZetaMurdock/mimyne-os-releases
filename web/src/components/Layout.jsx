import { lazy, Suspense } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigation } from 'react-router-dom';
import SiteHeader from './SiteHeader.jsx';
import { useSession } from '../data/session.jsx';
import './Layout.css';

// Only signed-in people get the notch, so it loads when someone signs in.
const NotchDock = lazy(() => import('./Notch.jsx'));

// A staging build says so on every page, so nobody mistakes it for the real
// site. Read from the build settings, not lib/firebase.js, which this page
// must not load when the social side is off.
const STAGING = !!import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'mimyne-os';

export default function Layout() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const leaving = useNavigation().state === 'loading';

  return (
    <div className={`app ${user ? 'app--notch' : ''}`}>
      {user ? (
        <Suspense fallback={null}>
          <NotchDock />
        </Suspense>
      ) : (
        <SiteHeader home={pathname === '/'} />
      )}
      <main className={`app__page ${leaving ? 'is-leaving' : ''}`}>
        <div key={pathname} className="app__enter">
          <Outlet />
        </div>
      </main>
      {STAGING && (
        <div className="app__staging" title="A practice copy of Mimyne with its own accounts and data. Nothing here reaches mimyne.com.">
          Staging · test data
        </div>
      )}
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
