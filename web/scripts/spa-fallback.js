// GitHub Pages serves 404.html for any path it doesn't have, so a copy of
// index.html there lets /h/ashfall or /feed load the app and route itself.
// .nojekyll stops Pages from running the site through Jekyll.
import { copyFileSync, writeFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
