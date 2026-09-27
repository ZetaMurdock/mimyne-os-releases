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

// The audit team's levels, and which level each decision needs. Developers
// are Senior by their account type; the Owner is everything; anyone else is
// on the team only while the Owner says so (Staff > The team).
export const LEVELS = ['triage', 'auditor', 'senior', 'owner'];
const RANK = { triage: 1, auditor: 2, senior: 3, owner: 4 };
export const ACTION_LEVEL = { dismiss: 'triage', warn: 'triage', strike: 'auditor', mute: 'auditor', suspend: 'senior', ban: 'senior', clear: 'senior' };
export const LEVEL_NAME = { triage: 'Triage', auditor: 'Auditor', senior: 'Senior', owner: 'Owner' };
export const allowedAt = (level, action) => (RANK[level] ?? 0) >= (RANK[ACTION_LEVEL[action]] ?? Infinity);

/** Your level as the file service sees it: { level } with null for no one on the team. */
export const fetchStaffLevel = () => ask('/staff/me');
/** Owner: the appointed team. */
export const fetchTeam = () => ask('/staff');
/** Owner: appoint someone at a level, or with null take them off the team. */
export const setTeamMember = (uid, level) => ask('/staff', { method: 'POST', body: { uid, level } });

/** Your own standing: warnings, strikes and their dates, a mute, a suspension, a ban. Never who decided. */
export const fetchMyStanding = () => ask('/moderation/me');

/** Staff: someone's standing and history, with who decided. */
export const fetchStandingOf = (uid) => ask(`/moderation/of?uid=${encodeURIComponent(uid)}`);

/** Staff: decide on a report. Resolves it with the outcome. `extra` may carry `days` (mute, suspend) and `note`. */
export const decideReport = (reportId, action, extra = {}) => ask('/moderation/decide', { method: 'POST', body: { reportId, action, ...extra } });

/** Staff: decide on an account itself, with no report. */
export const decideAccount = (uid, action, extra = {}) => ask('/moderation/decide', { method: 'POST', body: { uid, action, ...extra } });
