import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { usePerson } from '../data/people.js';
import { REASONS, amStaff, setReportStatus, watchReports } from '../data/reports.js';
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
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    let live = true;
    setStaff(null);
    if (user) amStaff(user.uid).then((yes) => live && setStaff(yes));
    return () => {
      live = false;
    };
  }, [user?.uid]);

  if (status !== 'ready' && status !== 'signed-out' && !user) return null;
  if (!user) return <NeedsAccount what="this page" />;
  if (staff === null) return null;
  if (!staff) {
    return (
      <div className="reports reports--empty">
        <h1 className="reports__title">Nothing here</h1>
        <p className="muted">This page is for Mimyne&apos;s team.</p>
      </div>
    );
  }
  return <ReportList me={user.uid} />;
}

function ReportList({ me }) {
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
          <p className="muted">{reports ? `${open} open` : 'Loading…'}</p>
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
          <ReportRow key={r.id} report={r} me={me} repeat={against.get(r.targetUid) ?? 0} onError={setError} />
        ))}
      </ul>
    </div>
  );
}

function ReportRow({ report: r, me, repeat, onError }) {
  const target = usePerson(r.targetUid);
  const reporter = usePerson(r.reporterUid);
  const [busy, setBusy] = useState(false);

  async function mark(status) {
    setBusy(true);
    try {
      await setReportStatus(me, r.id, status);
    } catch {
      onError("That report couldn't be changed.");
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
        {r.status === 'open' ? (
          <Button size="sm" variant="inverse" icon="check" loading={busy} onClick={() => mark('resolved')}>Resolve</Button>
        ) : (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => mark('open')}>Reopen</Button>
        )}
      </footer>
    </li>
  );
}
