// Reports: anyone signed in flags a person, or something they posted, for
// Mimyne's staff (the Owner and Developers) to look at. The app's staff view
// reads the same reports/ collection (firestore.rules, reports).
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';

export const REASONS = [
  { id: 'spam', label: 'Spam or scams' },
  { id: 'harassment', label: 'Harassment or hate' },
  { id: 'inappropriate', label: 'Sexual, violent or otherwise not allowed' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else' },
];

export const KINDS = ['person', 'post', 'comment', 'message', 'hub', 'room', 'clip', 'file'];

/**
 * Files a report. `about` is { targetUid, kind, link?, excerpt? }: who it's
 * about, what (a KINDS entry), where on the site, and what it said.
 */
export function fileReport(uid, about, reason, details) {
  const report = {
    reporterUid: uid,
    targetUid: about.targetUid,
    kind: KINDS.includes(about.kind) ? about.kind : 'person',
    reason,
    status: 'open',
    createdAt: serverTimestamp(),
  };
  const words = details.trim().slice(0, 1000);
  if (words) report.details = words;
  if (typeof about.link === 'string' && /^\/\S{0,299}$/.test(about.link)) report.link = about.link;
  const excerpt = typeof about.excerpt === 'string' ? about.excerpt.trim().slice(0, 500) : '';
  if (excerpt) report.excerpt = excerpt;
  return addDoc(collection(db, 'reports'), report);
}

/**
 * This account's staff level, or null: the Owner and Developers by their
 * account type (a Developer is Senior), anyone else by the Owner's
 * appointment (staff/<uid>, readable by its own person). The file service
 * works it out the same way for every decision.
 */
export async function staffLevelOf(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, 'account_types', uid)).catch(() => null);
  const t = snap?.data();
  const live = t && (t.days == null || Date.now() < (t.grantedAt?.toMillis?.() ?? 0) + Number(t.days) * 86_400_000);
  if (live && t.type === 'owner') return 'owner';
  if (live && t.type === 'developer') return 'senior';
  const appointed = await getDoc(doc(db, 'staff', uid)).catch(() => null);
  const level = appointed?.data()?.level;
  return ['triage', 'auditor', 'senior'].includes(level) ? level : null;
}

/** Whether this account is staff at any level. */
export async function amStaff(uid) {
  return (await staffLevelOf(uid)) !== null;
}

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** The newest reports, live (staff only). */
export function watchReports(onChange, onError) {
  return onSnapshot(
    query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => onChange(snap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        reporterUid: text(r.reporterUid, 128),
        targetUid: text(r.targetUid, 128),
        kind: KINDS.includes(r.kind) ? r.kind : (r.workspaceId ? 'workspace' : 'person'),
        reason: text(r.reason, 40),
        details: text(r.details, 1000),
        link: /^\/\S*$/.test(r.link ?? '') ? r.link : null,
        excerpt: text(r.excerpt, 500),
        workspaceId: text(r.workspaceId, 200),
        status: r.status === 'resolved' ? 'resolved' : 'open',
        at: r.createdAt?.toMillis?.() ?? Date.now(),
        resolvedAt: r.resolvedAt?.toMillis?.() ?? null,
      };
    })),
    onError,
  );
}

export function setReportStatus(uid, reportId, status) {
  return updateDoc(doc(db, 'reports', reportId), { status, resolvedBy: uid, resolvedAt: serverTimestamp() });
}
