import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { lookupUsername } from '../data/identity.js';
import { amStaff } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import { decideReview, fetchReviewQueue, money, monthName, setAccountBlocked } from '../data/support.js';
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

      <Exclude />
    </div>
  );
}

// An account flagged for abuse counts nothing from then on: the plan's
// last exclusion. By username, so nobody has to find a uid.
function Exclude() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  async function apply(blocked) {
    const username = name.trim().replace(/^@/, '');
    if (!username) return;
    setBusy(true);
    setSaid(null);
    try {
      const uid = await lookupUsername(username);
      if (!uid) { setSaid(`There is no @${username}.`); return; }
      const done = await setAccountBlocked(uid, blocked);
      if (done?.off) { setSaid("Plus supports Hubs isn't running."); return; }
      setSaid(blocked ? `@${username} counts nothing from now on.` : `@${username} counts again.`);
      setName('');
    } catch (error) {
      setSaid(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review-row">
      <h2 className="review__h2">Exclude an account</h2>
      <p className="muted">An account flagged for abuse counts nothing towards any Hub from now on. Its earlier months stay as they were closed.</p>
      <form className="review-row__actions" onSubmit={(e) => { e.preventDefault(); apply(true); }}>
        <input className="review__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="username" aria-label="Username to exclude" disabled={busy} />
        <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!name.trim()}>Exclude</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || !name.trim()} onClick={() => apply(false)}>Count again</Button>
      </form>
      {said && <p className="muted review-row__meta" role="status">{said}</p>}
    </section>
  );
}
