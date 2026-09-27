import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { amStaff } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import { decideReview, fetchReviewQueue, money, monthName } from '../data/support.js';
import NeedsAccount from './NeedsAccount.jsx';
import './EarningsReview.css';

// /staff/earnings: the review queue of Plus supports Hubs. At each monthly
// close the file service flags a Hub whose earnings jumped, whose
// contributors are almost all new accounts, or where a member sat near the
// daily cap most days, and keeps that month's earning back until someone
// here decides. Reasons, not verdicts. Staff only: the Owner and Developers.
const REASONS = {
  'earnings-jumped': 'Earnings jumped to more than three times the earlier months',
  'contributors-new': 'Almost all contributors joined in the last 30 days',
  'member-at-cap': 'A member sat near the daily cap most days',
};

export default function EarningsReview() {
  const { user } = useSession();
  const [staff, setStaff] = useState(null);
  useEffect(() => {
    let live = true;
    if (user) amStaff(user.uid).then((yes) => live && setStaff(yes));
    else setStaff(false);
    return () => { live = false; };
  }, [user?.uid]);

  if (!user) return <NeedsAccount what="this page" />;
  if (staff === null) return null;
  if (!staff) {
    return (
      <div className="review review--empty">
        <h1 className="review__title">Nothing here</h1>
        <p className="muted">This page is for Mimyne's staff.</p>
      </div>
    );
  }
  return <Queue />;
}

function Queue() {
  const [show, setShow] = useState('open');
  const [queue, setQueue] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = (status) => fetchReviewQueue(status).then(setQueue).catch((error) => setProblem(error.message));
  useEffect(() => { setQueue(null); setProblem(null); load(show); }, [show]);

  async function decide(flag, action) {
    setBusy(`${flag.hub}:${action}`);
    setProblem(null);
    try {
      await decideReview(flag.hub, flag.month, action);
      setQueue((prev) => ({ ...prev, flags: prev.flags.filter((f) => !(f.hub === flag.hub && f.month === flag.month)) }));
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="review">
      <header className="review__head">
        <div>
          <h1 className="review__title">Earnings review</h1>
          <p className="muted">
            Hubs the monthly close flagged. A flagged month's earning stays held until it is released here; holding keeps it back.
          </p>
        </div>
        <div className="review__tabs" role="tablist">
          {[['open', 'Open'], ['released', 'Released'], ['held', 'Held']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={show === id} className="review__tab" onClick={() => setShow(id)}>{label}</button>
          ))}
        </div>
      </header>

      {problem && <p className="review__problem" role="alert">{problem}</p>}
      {!queue && !problem && <p className="muted">Loading…</p>}
      {queue?.off && <p className="muted">Plus supports Hubs isn't running.</p>}
      {queue && !queue.off && queue.flags.length === 0 && (
        <p className="muted review__none">{show === 'open' ? 'Nothing to review. All quiet.' : 'Nothing here yet.'}</p>
      )}

      {queue && !queue.off && queue.flags.length > 0 && (
        <ul className="review__list">
          {queue.flags.map((flag) => (
            <li key={`${flag.hub}:${flag.month}`} className="review-row">
              <div className="review-row__head">
                <Link to={`/h/${flag.hub}`} className="review-row__hub">{flag.name}</Link>
                <span className="muted">{monthName(flag.month)}</span>
                <span className="review-row__cents">{money(flag.finalCents)}</span>
              </div>
              <ul className="review-row__reasons">
                {flag.reasons.map((r) => <li key={r}>{REASONS[r] ?? r}</li>)}
              </ul>
              <p className="muted review-row__meta">
                {flag.contributors} contributing Plus {flag.contributors === 1 ? 'member' : 'members'}
                {flag.decidedAt ? ` · decided ${new Date(flag.decidedAt).toLocaleDateString()}` : ''}
              </p>
              {show !== 'released' && (
                <div className="review-row__actions">
                  <Button size="sm" variant="primary" loading={busy === `${flag.hub}:release`} disabled={!!busy} onClick={() => decide(flag, 'release')}>
                    Release
                  </Button>
                  {show === 'open' && (
                    <Button size="sm" variant="ghost" loading={busy === `${flag.hub}:hold`} disabled={!!busy} onClick={() => decide(flag, 'hold')}>
                      Keep held
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
