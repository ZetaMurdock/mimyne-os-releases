import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';
import { SessionProvider } from './data/session.jsx';
import './styles/tokens.css';
import './styles/base.css';

// Each social page is loaded only when it's opened, and not built at all while
// SOCIAL is off, so the published site carries none of the sample data.
const page = (load, loaderName) => async () => {
  const mod = await load();
  return { Component: mod.default, loader: mod[loaderName] };
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
          // routes, and the sample data behind them, when it's off (see lib/features.js).
          ...(import.meta.env.DEV || import.meta.env.VITE_SOCIAL === 'true'
            ? [
                { path: 'h/:slug', lazy: page(() => import('./pages/Hub.jsx'), 'hubLoader') },
                { path: 'feed', lazy: page(() => import('./pages/Feed.jsx'), 'feedLoader') },
                { path: 'p/:id', lazy: page(() => import('./pages/Thread.jsx'), 'threadLoader') },
                { path: 'messages', lazy: page(() => import('./pages/Messages.jsx'), 'messagesLoader') },
                { path: 'messages/:id', lazy: page(() => import('./pages/Messages.jsx'), 'messagesLoader') },
              ]
            : []),
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
