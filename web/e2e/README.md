# Browser tests

These tests run the whole site in Chromium against the Firebase emulators.
They use the real Firestore rules from the app repository, with a stand-in for
the files Worker (`fixtures.js`). Each test signs up new people with random
names, so the tests never trip over each other.

## Running them

You need Java 21 or newer, the Firebase CLI (`npm install -g firebase-tools`)
and a checkout of `ZetaMurdock/mimyne-os` beside this repository (or set
`MIMYNE_OS_DIR` to where it is). Then, in `web/`:

```sh
npx playwright install chromium   # once
npm run test:e2e
```

This copies the rules over, starts the emulators and a dev server, runs every
`*.spec.js` here, and stops them again.

## In CI

`.github/workflows/checks.yml` runs them on every pull request that touches
`web/`. It reads the rules from `mimyne-os` main, which are the live ones.
That is why a site change that needs new rules fails until those rules are
merged and deployed.

The workflow needs one repository secret, `APP_REPO_TOKEN`. To make one:

1. Go to GitHub → Settings → Developer settings → Fine-grained tokens, and
   generate a new token.
2. Resource owner: ZetaMurdock. Repository access: only `mimyne-os`.
3. Permissions: Contents, read-only. Nothing else.
4. Add it to `mimyne-os-releases` under Settings → Secrets and variables →
   Actions, as a new repository secret named `APP_REPO_TOKEN`.

## What they cover

- `rooms.spec.js`: a new Hub's General room and its chat, seen by someone
  else. Also opening a Room made a moment ago, which used to crash the page.
- `canvas.spec.js`: notes don't jump when dropped, stay put after a reload,
  and undo takes a move back.
- `reports.spec.js`: reporting a Hub and a post. Only staff see reports, and
  staff resolve them.
- `files.spec.js`: the storage meter, and an upload refused when storage is full.
