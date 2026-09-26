// What someone has paid for, as the file service recorded it from Lemon
// Squeezy (entitlements/<uid>, hub_billing/<hubId>; firestore.rules,
// "billing"). Read-only here: nothing in the browser can grant a plan.
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const until = e.until?.toMillis?.() ?? null;
  return {
    active: e.active === true && (!until || until > Date.now()),
    status: typeof e.status === 'string' ? e.status : 'unknown',
    plan: typeof e.plan === 'string' ? e.plan : null,
    until,
    portal: typeof e.portal === 'string' && e.portal.startsWith('https://') ? e.portal : null,
  };
}

/** Your plans, live: { deep, plus } (each null or { active, status, plan, until, portal }). */
export function watchMyPlans(uid, onChange) {
  return onSnapshot(
    doc(db, 'entitlements', uid),
    (snap) => {
      const data = snap.data() ?? {};
      onChange({ deep: cleanEntry(data.deep), plus: cleanEntry(data.plus) });
    },
    () => onChange({ deep: null, plus: null }),
  );
}

/** Whether a Hub has Hub Pro, live: null or { active, until, ... }. */
export function watchHubPro(hubId, onChange) {
  return onSnapshot(doc(db, 'hub_billing', hubId), (snap) => onChange(cleanEntry(snap.data()?.pro)), () => onChange(null));
}
