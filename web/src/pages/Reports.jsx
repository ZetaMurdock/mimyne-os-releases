import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { usePerson } from '../data/people.js';
import { ACTIONS, ACTION_LEVEL, LEVEL_NAME, allowedAt, decideReport, fetchStandingOf } from '../data/moderation.js';
import { REASONS, setReportStatus, staffLevelOf, watchReports } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import NeedsAccount from './NeedsAccount.jsx';
import './Reports.css';

const REASON = Object.fromEntries(REASONS.map((r) => [r.id, r.label]));
const KIND = {
  person: 'Profile', post: 'Post', comment: 'Comment', message: 'Message', hub: 'Hub',
  room: 'Room', clip: 'Clip', file: 'File', workspace: 'Workspace',
};

/** Reports for Mimyne's staff: the Owner and Developers. Everyone else sees nothing here. */
export default function Reports() {
  const { user, status } = useSession();
  const [level, setLevel] = useState(undefined);

  useEffect(() => {
    let live = true;
    setLevel(undefined);
    if (user) staffLevelOf(user.uid).then((found) => live && setLevel(found));
    return () => {
      live = false;
    };
  }, [user?.uid]);

  if (status !== 'ready' && status !== 'signed-out' && !user) return null;
  if (!user) return <NeedsAccount what="this page" />;
  if (level === undefined) return null;
  if (!level) {
    return (
      <div className="reports reports--empty">
        <h1 className="reports__title">Nothing here</h1>
        <p className="muted">This page is for Mimyne&apos;s team.</p>
      </div>
    );
  }
  return <ReportList me={user.uid} level={level} />;
}

function ReportList({ me, level }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);
  const [show, setShow] = useState('open');

  useEffect(() => watchReports(setReports, () => setError("The reports couldn't load.")), []);

  // How often each person has been reported while open: repeat names first.
  const against = useMemo(() => {
    const n = new Map();
    for (const r of reports ?? []) if (r.status === 'open') n.set(r.targetUid, (n.get(r.targetUid) ?? 0) + 1);
    return n;
  }, [reports]);
  const shown = (reports ?? []).filter((r) => r.status === show);
  const open = (reports ?? []).filter((r) => r.status === 'open').length;

  return (
    <div className="reports">
      <header className="reports__head">
        <div>
          <h1 className="reports__title">Reports</h1>
          <p className="muted">{reports ? `${open} open` : 'Loading…'} · you are {LEVEL_NAME[level] ?? level}</p>
        </div>
        <div className="reports__tabs" role="tablist">
          {['open', 'resolved'].map((s) => (
            <Button key={s} size="sm" variant="secondary" selected={show === s} role="tab" aria-selected={show === s} onClick={() => setShow(s)}>
              {s === 'open' ? 'Open' : 'Resolved'}
            </Button>
          ))}
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      {reports && shown.length === 0 && (
        <p className="reports__none muted">{show === 'open' ? 'No open reports. All quiet.' : 'Nothing resolved yet.'}</p>
      )}
      <ul className="reports__list">
        {shown.map((r) => (
          <ReportRow key={r.id} report={r} me={me} level={level} repeat={against.get(r.targetUid) ?? 0} onError={setError} />
        ))}
      </ul>
    </div>
  );
}

// What the target already has against them, for the row: from the file
// service (files-worker/src/moderation.js), which holds the record.
function standingLine(s) {
  if (!s) return null;
  const parts = [];
  if (s.banned) parts.push('banned');
  if (s.suspended) parts.push(`suspended until ${new Date(s.suspendedUntil).toLocaleDateString()}`);
  if (s.muted) parts.push(`muted until ${new Date(s.mutedUntil).toLocaleDateString()}`);
  if (s.strikes) parts.push(`${s.strikes} active ${s.strikes === 1 ? 'strike' : 'strikes'}`);
  if (s.warnings) parts.push(`${s.warnings} ${s.warnings === 1 ? 'warning' : 'warnings'}`);
  return parts.length ? parts.join(' · ') : 'nothing on record';
}

function ReportRow({ report: r, me, level, repeat, onError }) {
  const target = usePerson(r.targetUid);
  const reporter = usePerson(r.reporterUid);
  const [busy, setBusy] = useState(false);
  const [standing, setStanding] = useState(null);
  const [standingUnknown, setStandingUnknown] = useState(false);
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');

  useEffect(() => {
    let live = true;
    if (r.status !== 'open') return undefined;
    fetchStandingOf(r.targetUid)
      .then((s) => live && (s ? setStanding(s) : setStandingUnknown(true)))
      .catch(() => live && setStandingUnknown(true));
    return () => { live = false; };
  }, [r.targetUid, r.status]);

  async function mark(status) {
    setBusy(true);
    try {
      await setReportStatus(me, r.id, status);
    } catch {
      onError("That report couldn't be changed.");
    }
    setBusy(false);
  }

  // One decision: the file service records it, resolves the report with
  // the outcome, and tells the person. A ban asks first. Dismissing is
  // the one decision that changes nothing about the person, so it is the
  // plain resolve, written here.
  async function act(action) {
    if (action === 'dismiss') { await mark('resolved'); return; }
    if (action === 'ban' && !window.confirm(`Ban @${target.username}? They can read but never post again until cleared, and Hubs they own stop earning.`)) return;
    setBusy(true);
    try {
      const extra = {};
      if (note.trim()) extra.note = note.trim();
      if ((action === 'mute' || action === 'suspend') && days) extra.days = Number(days);
      const done = await decideReport(r.id, action, extra);
      if (done?.standing) setStanding(done.standing);
    } catch (error) {
      onError(error.message || 'That could not be done.');
    }
    setBusy(false);
  }

  return (
    <li className="report-row">
      <div className="report-row__who">
        <Avatar person={target} size={36} />
        <div className="report-row__names">
          <Link to={`/people/${r.targetUid}`} className="report-row__target">{target.name}</Link>
          <span className="muted">@{target.username}{repeat > 1 && <strong className="report-row__repeat"> · {repeat} open reports</strong>}</span>
        </div>
        <span className="report-row__kind">{KIND[r.kind] ?? r.kind}</span>
      </div>
      <p className="report-row__reason">
        <Icon name="flag" size={14} /> {REASON[r.reason] ?? r.reason}
      </p>
      {r.excerpt && <blockquote className="report-row__excerpt">{r.excerpt}</blockquote>}
      {r.details && <p className="report-row__details">&ldquo;{r.details}&rdquo;</p>}
      <footer className="report-row__foot">
        <span className="muted">
          By <Link to={`/people/${r.reporterUid}`}>@{reporter.username}</Link> · {timeAgo(r.at)}
        </span>
        <span className="report-row__spacer" />
        {r.link && <Button size="sm" variant="ghost" to={r.link}>Go to it</Button>}
        {r.status !== 'open' && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => mark('open')}>Reopen</Button>
        )}
      </footer>
      {r.status === 'open' && (
        <div className="report-row__decide">
          <p className="muted report-row__standing">
            On record for @{target.username}: {standing ? standingLine(standing) : standingUnknown ? 'could not be read' : 'loading…'}
          </p>
          <div className="report-row__fields">
            <input
              className="report-row__note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A note for them and for the log (optional)"
              aria-label="Note"
              maxLength={500}
              disabled={busy}
            />
            <input
              className="report-row__days"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              placeholder="days"
              aria-label="Days, for a mute or suspension"
              inputMode="numeric"
              disabled={busy}
            />
          </div>
          <div className="report-row__actions">
            {ACTIONS.filter((a) => a.id !== 'clear' || standing?.banned || standing?.muted || standing?.suspended).map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant={a.id === 'dismiss' ? 'secondary' : a.id === 'ban' ? 'inverse' : 'ghost'}
                title={allowedAt(level, a.id) ? a.hint : `Needs ${LEVEL_NAME[ACTION_LEVEL[a.id]]} or above`}
                disabled={busy || !allowedAt(level, a.id)}
                onClick={() => act(a.id)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
