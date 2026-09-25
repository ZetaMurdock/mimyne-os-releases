import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Hub, { hubLoader } from './pages/Hub.jsx';
import Feed, { feedLoader } from './pages/Feed.jsx';
import Thread, { threadLoader } from './pages/Thread.jsx';
import Messages, { messagesLoader } from './pages/Messages.jsx';
import NotFound from './pages/NotFound.jsx';
import { SessionProvider } from './data/session.jsx';
import './styles/tokens.css';
import './styles/base.css';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        errorElement: <NotFound />,
        children: [
          { index: true, element: <Home /> },
          { path: 'h/:slug', loader: hubLoader, element: <Hub /> },
          { path: 'feed', loader: feedLoader, element: <Feed /> },
          { path: 'p/:id', loader: threadLoader, element: <Thread /> },
          { path: 'messages', loader: messagesLoader, element: <Messages /> },
          { path: 'messages/:id', loader: messagesLoader, element: <Messages /> },
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
