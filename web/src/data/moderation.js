// Moderation: what Mimyne's staff decide about an account, and what a person
// sees of their own standing. The file service holds the record
// (files-worker/src/moderation.js); nothing here reads Firestore directly.
import { ask } from './support.js';

/** What staff can do, from a report or on an account. */
export const ACTIONS = [
  { id: 'dismiss', label: 'Dismiss', hint: 'Closes the report, nothing else' },
  { id: 'warn', label: 'Warn', hint: 'On the record and an email; costs nothing' },
  { id: 'strike', label: 'Strike', hint: 'Expires in 90 days; a Hub they own does not earn meanwhile' },
  { id: 'mute', label: 'Mute', hint: 'No posting, commenting or messaging; 3 days unless you say otherwise' },
  { id: 'suspend', label: 'Suspend', hint: 'The same, 7 days unless you say otherwise' },
  { id: 'ban', label: 'Ban', hint: 'For good, until cleared; their minutes count for nothing' },
  { id: 'clear', label: 'Clear', hint: 'Lifts a mute, suspension or ban; strikes still expire on their own' },
];

/** Your own standing: warnings, strikes and their dates, a mute, a suspension, a ban. Never who decided. */
export const fetchMyStanding = () => ask('/moderation/me');

/** Staff: someone's standing and history, with who decided. */
export const fetchStandingOf = (uid) => ask(`/moderation/of?uid=${encodeURIComponent(uid)}`);

/** Staff: decide on a report. Resolves it with the outcome. `extra` may carry `days` (mute, suspend) and `note`. */
export const decideReport = (reportId, action, extra = {}) => ask('/moderation/decide', { method: 'POST', body: { reportId, action, ...extra } });

/** Staff: decide on an account itself, with no report. */
export const decideAccount = (uid, action, extra = {}) => ask('/moderation/decide', { method: 'POST', body: { uid, action, ...extra } });
