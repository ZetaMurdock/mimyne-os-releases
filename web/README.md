# mimyne.com

The website: home and download, public Hub pages, the feed, posts with
comments, and messages. Built with Vite and React in plain JavaScript, the
same stack as the Mimyne app's interface, so components here can move into
the app.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # writes dist/, ready for GitHub Pages
```

## Where things are

- `src/styles/tokens.css`: colours, spacing, corners, type and motion. Change
  a value here and it changes everywhere.
- `src/components/`: the shared pieces (Notch, Button, PostCard, Composer,
  Comment, RoomTile, FileCard, ApproveBar, PledgeButton, HubCard…).
- `src/pages/`: Home, Hub, Feed, Thread (a post), Messages.
- `src/data/api.js`: the only place pages get data from. It reads sample data
  in `mock.js` today; pointing it at Mimyne's Firebase is the next step.
- `src/data/session.jsx`: who is signed in and which Hubs they pledged to.
  "Sign in" signs you in as the sample account until Firebase Auth is wired.

## Publishing

Every push to `main` that touches `web/` or `docs/` runs
`.github/workflows/pages.yml`, which builds this folder and publishes it to
mimyne.com. GitHub Pages must be set to deploy from GitHub Actions
(Settings → Pages → Source).

The published site has the home page and the legal pages. Hubs, the feed,
posts and messages still run on sample data, so the build leaves them out
until they're connected to Firebase; `npm run dev` always has them, and
`VITE_SOCIAL=true npm run build` builds them in.

The Privacy Policy, Terms, Guidelines and the `/u/` profile page still live
in `/docs`; `public/` links to them so they keep their URLs.
