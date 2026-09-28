import { useEffect, useState } from 'react';
import Button from '../Button.jsx';
import Icon from '../Icon.jsx';
import { fetchHubEarnings, fetchPayoutAccount, money, monthName, openStripeDashboard, setHubProFromBalance, startPayouts } from '../../data/support.js';
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
  ['standing', 'Owner in good standing: no strike, mute, suspension or ban, and no open report'],
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
        {view.unclaimed && (
          <p className="earnings__warn" role="status">
            Set up payouts by {day(view.unclaimed.expiresAt)}: {money(view.unclaimed.cents)} of this balance starts to expire then, under the program's
            terms. A released balance keeps for a year while payouts are not set up; setting them up claims all of it.
          </p>
        )}
        <p className="muted earnings__note">
          A month's earnings are added on the 5th of the next month and held before they are released: 90 days for a new owner, the card-dispute
          window, 30 once six months in a row have earned with nothing reversed. Payouts go out on the 15th from the released balance when it
          reaches $25; smaller balances carry over.
        </p>
      </section>

      <History entries={view.history ?? []} />

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

      <Payouts />

      <HubPro hub={hub} view={view} />
    </div>
  );
}

// The ledger, as the owner reads it: each month's earning, a reversal when a
// Plus payment that funded a month was refunded, and each payout with its
// Stripe reference. Newest first. Nothing in it is ever edited.
const KINDS = { earning: 'Earned', reversal: 'Reversed', payout: 'Paid out', hub_pro: 'Hub Pro', expiry: 'Expired', adjustment: 'Adjustment' };
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function standing(entry) {
  if (entry.state === 'paid') return entry.at ? `Sent ${day(entry.at)}` : 'Sent';
  if (entry.state === 'spent') return entry.until ? `From the balance, on until ${day(entry.until)}` : 'From the balance';
  if (entry.state === 'expired') return 'Unclaimed for a year';
  if (entry.state === 'review') return 'Waiting for review';
  if (entry.state === 'held') return entry.releaseAt ? `Held until ${day(entry.releaseAt)}` : 'Held';
  if (entry.state === 'settled') return 'Paid out';
  return 'Released';
}

function History({ entries }) {
  return (
    <section className="card earnings__card">
      <h2 className="earnings__h2">History</h2>
      {entries.length === 0 ? (
        <p className="muted">Nothing recorded yet. A month's earning appears here once the month closes, and each payout with its reference.</p>
      ) : (
        <ul className="earnings__history">
          {entries.map((entry) => (
            <li key={entry.id} className={`earnings__entry is-${entry.kind}`}>
              <span className="earnings__entry-what">
                <strong>{KINDS[entry.kind] ?? entry.kind}</strong>
                {entry.month && <span className="muted"> {monthName(entry.month)}</span>}
              </span>
              <span className="earnings__entry-state muted">
                {standing(entry)}
                {entry.reference && <span className="earnings__entry-ref"> {entry.reference}</span>}
              </span>
              <span className="earnings__entry-cents">{money(entry.cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Where the money goes: the owner's Stripe account. Stripe checks who they
// are and takes the tax details in its own pages; this only starts it and
// says how far it got.
const NEEDS = {
  'individual.verification.document': 'a photo of your ID',
  'individual.dob': 'your date of birth',
  'individual.address.line1': 'your address',
  external_account: 'a bank account or debit card to pay out to',
  'tos_acceptance.date': "agreeing to Stripe's terms",
};

function Payouts() {
  const [account, setAccount] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPayoutAccount()
      .then((data) => live && setAccount(data ?? { set: false }))
      .catch((error) => live && (error.message === 'Payouts are not set up yet.' ? setAccount({ notReady: true }) : setProblem(error.message)));
    return () => { live = false; };
  }, []);

  async function begin(replace = false) {
    setBusy(true);
    setProblem(null);
    try {
      const started = await startPayouts(replace);
      if (started?.url) window.location.assign(started.url);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openStripe() {
    setBusy(true);
    setProblem(null);
    try {
      const link = await openStripeDashboard();
      if (link?.url) window.open(link.url, '_blank', 'noopener');
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card earnings__card">
      <h2 className="earnings__h2">Payouts</h2>
      {problem && <p className="earnings__problem" role="alert">{problem}</p>}
      {!account && !problem && <p className="muted">Loading…</p>}
      {account?.notReady && <p className="muted">Payouts are not set up at Mimyne's end yet. Your balance keeps until they are.</p>}
      {account?.off && <p className="muted">Plus supports Hubs isn't running.</p>}
      {account && !account.notReady && !account.off && !account.set && (
        <>
          <p className="muted">
            Earnings are paid through Stripe, which checks that you are 18 or older and takes the tax details it needs. You will be sent to Stripe
            and brought back here.
          </p>
          <div className="review-row__actions">
            <Button size="sm" variant="primary" loading={busy} onClick={() => begin(false)}>Set up payouts</Button>
          </div>
        </>
      )}
      {account?.set && (
        <>
          <dl className="earnings__facts">
            <div>
              <dt>Payout account</dt>
              <dd>{account.status === 'verified' ? 'Verified' : account.status === 'pending' ? 'Being checked by Stripe' : 'Not finished'}</dd>
            </div>
            {account.pausedUntil && (
              <div>
                <dt>Paused until</dt>
                <dd>{new Date(account.pausedUntil).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
          {account.needs?.length > 0 && (
            <p className="muted">Stripe still needs {account.needs.map((n) => NEEDS[n] ?? n.replace(/[._]/g, ' ')).join(', ')}.</p>
          )}
          {account.payoutFailure && (
            <p className="earnings__problem" role="alert">
              Stripe could not pay your bank{account.payoutFailure.at ? ` on ${new Date(account.payoutFailure.at).toLocaleDateString()}` : ''}
              {account.payoutFailure.message ? `: ${account.payoutFailure.message}` : '.'} The money is still in your Stripe balance; check your bank
              details in your Stripe dashboard.
            </p>
          )}
          <div className="review-row__actions">
            {account.status !== 'verified' && (
              <Button size="sm" variant="primary" loading={busy} onClick={() => begin(false)}>Continue with Stripe</Button>
            )}
            {account.status !== 'incomplete' && (
              <Button size="sm" variant={account.status === 'verified' ? 'primary' : 'ghost'} loading={busy} onClick={openStripe}>Open your Stripe dashboard</Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => { if (window.confirm('Move your payouts to a different Stripe account? Payouts pause for 7 days after a change.')) begin(true); }}
            >
              Change account
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// Hub Pro paid from the balance instead of a card, once Mimyne offers it:
// $11.99 comes out on the 15th before the payout, only when the released
// balance covers it, and never while a card subscription still does. Until
// it is offered, the card only says how Hub Pro stands.
function HubPro({ hub, view }) {
  const pro = view.hubPro ?? {};
  const [on, setOn] = useState(pro.fromBalance === true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!pro.available && !pro.active) return null;

  async function choose(next) {
    setBusy(true);
    setProblem(null);
    try {
      const saved = await setHubProFromBalance(hub.id, next);
      setOn(saved?.fromBalance === true);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card earnings__card">
      <h2 className="earnings__h2">Hub Pro</h2>
      {problem && <p className="earnings__problem" role="alert">{problem}</p>}
      <p className="muted">
        {pro.active
          ? `Hub Pro is on until ${day(pro.until)}, paid ${pro.source === 'balance' ? "from this Hub's balance" : 'by card'}.`
          : `${hub.name} does not have Hub Pro.`}
      </p>
      {pro.available && (
        <>
          <label className="earnings__choice">
            <input type="checkbox" checked={on} disabled={busy} onChange={(e) => choose(e.target.checked)} />
            <span>Pay Hub Pro from this Hub's balance, {money(pro.priceCents)} a month</span>
          </label>
          <p className="muted earnings__note">
            It comes out on the 15th, before the payout, only when the released balance covers it: a month the balance cannot cover is simply not
            bought, and nothing is taken while a card subscription still covers the Hub. Each month bought is in History.
          </p>
        </>
      )}
    </section>
  );
}
