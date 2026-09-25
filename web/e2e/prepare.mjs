/**
 * The rules the tests run against are the app repository's (mimyne-os), the
 * same ones that are live. This copies them next to e2e/firebase.json from a
 * checkout of that repository: MIMYNE_OS_DIR, or ../../mimyne-os beside this
 * one by default.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(process.env.MIMYNE_OS_DIR ?? join(here, '../../../mimyne-os'));

if (!existsSync(join(app, 'firestore.rules'))) {
  console.error(`No firestore.rules in ${app}. Check out ZetaMurdock/mimyne-os there, or set MIMYNE_OS_DIR to where it is.`);
  process.exit(1);
}
for (const file of ['firestore.rules', 'firestore.indexes.json']) copyFileSync(join(app, file), join(here, file));
console.log(`Rules from ${app}`);
