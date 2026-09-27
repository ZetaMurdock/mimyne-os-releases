import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { fetchHubEarnings, money, monthName } from '../../data/support.js';
import './HubEarnings.css';

// Hub → Earnings, for its owner: what the Hub would be owed this month if
// it closed now, from the Plus members who spent qualified time here - the
// part of each one's support that this Hub's share of their time earns.
// Estimates, while the program is in its shadow months: no money moves.
// The count of contributors shows from five up, so nobody can work out
// who paid.
const CHECKS = [
  ['age', 'At least 30 days old'],
  ['contributors', 'At least 5 Plus members contributing this month'],
  ['active', 'At least 15 people active in the last 28 days'],
];

export default function HubEarnings({ hub }) {
  const [view, setView] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    setView(null);
    fetchHubEarnings(hub.id)
      .then((data) => live && setView(data))
      .catch((error) => live && setProblem(error.message));
    return () => { live = false; };
  }, [hub.id]);

  if (problem) return <p className="earnings__problem" role="alert">{problem}</p>;
  if (!view) return <p className="muted">Loading…</p>;
  if (view.off) return <p className="muted">Plus supports Hubs isn't running yet. When it does, this shows what {hub.name} earns.</p>;

  return (
    <div className="earnings">
      <section className="card earnings__card">
        <h2 className="earnings__h2">{monthName(view.month)}</h2>
        <p className="earnings__big">
          {money(view.closed ? view.finalCents : view.estimatedCents)} <span className="earnings__tag">{view.closed ? 'final' : 'estimated'}</span>
        </p>
        <p className="muted">
          {view.closed
            ? `What ${hub.name} earned from the Plus members who spent time here that month, as the month closed. It is held before it is paid out.`
            : `What ${hub.name} would be owed if the month closed now: the part of each contributing Plus member's support that their time here earns. Nothing is paid out yet.`}
        </p>
        <dl className="earnings__facts">
          <div>
            <dt>3-month average</dt>
            <dd>{money(view.average3Cents)}</dd>
          </div>
          <div>
            <dt>Plus members contributing</dt>
            <dd>{view.fewContributors ? 'Fewer than 5 so far' : view.contributors}</dd>
          </div>
          <div>
            <dt>People active, last 28 days</dt>
            <dd>{view.activePeople}</dd>
          </div>
          <div>
            <dt>Qualified minutes from Plus members</dt>
            <dd>{Math.round(view.halfMinutes / 2)}</dd>
          </div>
        </dl>
      </section>

      <section className="card earnings__card">
        <h2 className="earnings__h2">Balance</h2>
        <dl className="earnings__facts">
          <div>
            <dt>Released</dt>
            <dd>{money(view.balanceCents)}</dd>
          </div>
          <div>
            <dt>Held</dt>
            <dd>{money(view.heldCents)}</dd>
          </div>
          <div>
            <dt>Next release</dt>
            <dd>{view.nextReleaseAt ? new Date(view.nextReleaseAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Nothing held'}</dd>
          </div>
        </dl>
        <p className="muted earnings__note">
          A month's earnings are added on the 5th of the next month and held before they are released: 90 days for a new owner, the card-dispute
          window. Payouts, once they begin, go out monthly from the released balance when it reaches $25; smaller balances carry over.
        </p>
      </section>

      <section className="card earnings__card">
        <h2 className="earnings__h2">{view.eligible ? 'Eligible to earn' : 'Not yet eligible'}</h2>
        <ul className="earnings__checks">
          {CHECKS.map(([key, label]) => (
            <li key={key} className={view.eligibility[key] ? 'is-met' : ''}>
              <Icon name={view.eligibility[key] ? 'check' : 'close'} size={16} />
              {label}
            </li>
          ))}
        </ul>
        <p className="muted earnings__note">
          A minute counts when the Hub's tab is on screen and the person did something in the last two minutes, or a video is playing. Your own
          minutes never count. You see counts here, never who.
        </p>
      </section>
    </div>
  );
}
