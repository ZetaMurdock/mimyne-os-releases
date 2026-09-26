import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';
import { SessionProvider } from './data/session.jsx';
// Fonts are served from mimyne.com itself, not Google Fonts, so a visit
// doesn't send anyone's address to Google (all three are SIL Open Font License).
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/geist/wght.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';

// Each social page is loaded only when it's opened, and not built at all while
// SOCIAL is off, so the published site doesn't carry Firebase until it's on.
const page = (load, loaderName) => async () => {
  const mod = await load();
  return {
    Component: mod.default,
    ...(loaderName ? { loader: mod[loaderName] } : {}),
    ...(mod.shouldRevalidate ? { shouldRevalidate: mod.shouldRevalidate } : {}),
  };
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        errorElement: <NotFound />,
        children: [
          { index: true, element: <Home /> },
          // Written out here rather than imported so the build can drop these
          // routes, and everything behind them, when it's off (see lib/features.js).
          ...(import.meta.env.DEV || import.meta.env.VITE_SOCIAL === 'true'
            ? [
                { path: 'h/:slug', lazy: page(() => import('./pages/Hub.jsx'), 'hubLoader') },
                { path: 'h/:hubId/p/:postId', lazy: page(() => import('./pages/Thread.jsx'), 'threadLoader') },
                { path: 'u/:name', lazy: page(() => import('./pages/Profile.jsx'), 'profileLoader') },
                { path: 'people/:uid', lazy: page(() => import('./pages/Profile.jsx'), 'profileLoader') },
                { path: 'people/:uid/p/:postId', lazy: page(() => import('./pages/Thread.jsx'), 'threadLoader') },
                { path: 'hubs/new', lazy: page(() => import('./pages/NewHub.jsx')) },
                { path: 'feed', lazy: page(() => import('./pages/Feed.jsx'), 'feedLoader') },
                { path: 'messages', lazy: page(() => import('./pages/Messages.jsx')) },
                { path: 'messages/:id', lazy: page(() => import('./pages/Messages.jsx')) },
                { path: 'staff/reports', lazy: page(() => import('./pages/Reports.jsx')) },
                { path: 'pricing', lazy: page(() => import('./pages/Pricing.jsx')) },
                { path: 'settings/security', lazy: page(() => import('./pages/Security.jsx')) },
                { path: 'security/recover', lazy: page(() => import('./pages/Recover.jsx')) },
                { path: 'security/confirm', lazy: page(() => import('./pages/SecurityLink.jsx')) },
              ]
            : []),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

// mimyne.com never runs inside another site's frame, where a hidden page
// could trick someone into clicking (GitHub Pages can't send the headers
// that forbid framing).
const framed = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

if (framed) {
  document.getElementById('root').innerHTML = '<p style="padding:24px;font:15px system-ui;color:#fff">Mimyne can\'t be shown inside another page. <a href="https://mimyne.com/" target="_top" rel="noopener" style="color:#c4b5fd">Open mimyne.com</a></p>';
} else createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
