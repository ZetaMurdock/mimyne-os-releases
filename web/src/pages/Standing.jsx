import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { fetchMyStanding } from '../data/moderation.js';
import { REASONS } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import NeedsAccount from './NeedsAccount.jsx';
import './Standing.css';

// /settings/standing: what Mimyne's staff have decided about your account
// under the guidelines, and when each thing clears. Most people see nothing
// here, and that is the point: nobody is warned, muted or banned without
// being able to see it and when it ends.
const REASON = Object.fromEntries(REASONS.map((r) => [r.id, r.label]));
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

export default function Standing() {
  const { user } = useSession();
  if (!user) return <NeedsAccount what="your standing" />;
  return <StandingView />;
}

function StandingView() {
  const [mine, setMine] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    fetchMyStanding()
      .then((data) => live && setMine(data))
      .catch((error) => live && setProblem(error.message));
    return () => { live = false; };
  }, []);

  return (
    <div className="standing">
      <h1 className="standing__title">Your standing</h1>
      <p className="standing__lead">
        What Mimyne's staff have decided about your account under the <a href="/guidelines.html">guidelines</a>, and when each thing clears.
      </p>

      {problem && <p className="standing__problem" role="alert">{problem}</p>}
      {!mine && !problem && <p className="muted">Loading…</p>}

      {mine?.clean && mine.warnings === 0 && (
        <section className="card standing__section standing__section--clean">
          <Icon name="check" size={18} />
          <p>Nothing on your account. Thank you.</p>
        </section>
      )}

      {mine && (mine.banned || mine.suspended || mine.muted) && (
        <section className="card standing__section standing__section--now">
          {mine.banned && (
            <p>
              <strong>Your account is banned</strong>{mine.bannedAt ? ` since ${day(mine.bannedAt)}` : ''}.{mine.banReason ? ` ${mine.banReason}` : ''} You can read, but not post,
              comment or message, and Hubs you own do not earn. To appeal, email mimyne.support@gmail.com.
            </p>
          )}
          {!mine.banned && mine.suspended && (
            <p>
              <strong>Your account is suspended</strong> until {day(mine.suspendedUntil)}. You can read, but not post, comment or message, and Hubs you own
              do not earn until then.
            </p>
          )}
          {!mine.banned && !mine.suspended && mine.muted && (
            <p>
              <strong>Your account is muted</strong> until {day(mine.mutedUntil)}. You can read, but not post, comment or message until then.
            </p>
          )}
        </section>
      )}

      {mine && mine.history.strikes.length > 0 && (
        <section className="card standing__section">
          <h2 className="standing__h2">Strikes</h2>
          <p className="muted">
            A strike expires 90 days on. While you have one, a Hub you own does not earn from Plus supports Hubs. Strikes add up: they can lead
            to a mute, a suspension or a ban.
          </p>
          <ul className="standing__list">
            {mine.history.strikes.map((s) => (
              <li key={`${s.at}-${s.expiresAt}`} className={s.active ? 'is-active' : 'is-past'}>
                <span className="standing__what">{REASON[s.reason] ?? (s.reason ? s.reason : 'Under the guidelines')}</span>
                <span className="standing__when muted">
                  {s.at ? day(s.at) : ''}{s.expiresAt ? (s.active ? `, expires ${day(s.expiresAt)}` : `, expired ${day(s.expiresAt)}`) : ''}
                </span>
                {s.note && <span className="standing__note">{s.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine && mine.history.warnings.length > 0 && (
        <section className="card standing__section">
          <h2 className="standing__h2">Warnings</h2>
          <p className="muted">A warning costs nothing by itself. It is on the record so that a further problem is not treated as the first.</p>
          <ul className="standing__list">
            {mine.history.warnings.map((w) => (
              <li key={w.at}>
                <span className="standing__what">{REASON[w.reason] ?? (w.reason ? w.reason : 'Under the guidelines')}</span>
                <span className="standing__when muted">{w.at ? day(w.at) : ''}</span>
                {w.note && <span className="standing__note">{w.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
