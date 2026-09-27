import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useSession } from '../data/session.jsx';
import { fetchMySupport, money, monthName, saveSupportEven } from '../data/support.js';
import NeedsAccount from './NeedsAccount.jsx';
import './Support.css';

// /settings/support: where your Plus supports Hubs. Part of every Plus
// subscription goes to the Hubs its member spends qualified time in
// (Hub → Earnings shows a Hub's side of it). This is a member's own view -
// which Hubs, and how the month splits - and the one choice they have: to
// split their support evenly between the Hubs they pledge to instead, with
// none of their minutes recorded.
export default function Support() {
  const { user } = useSession();
  if (!user) return <NeedsAccount what="your support" />;
  return <SupportView />;
}

function SupportView() {
  const [mine, setMine] = useState(null);
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    fetchMySupport()
      .then((data) => live && setMine(data))
      .catch((error) => live && setProblem(error.message));
    return () => { live = false; };
  }, []);

  async function choose(even) {
    setSaving(true);
    setProblem(null);
    try {
      const saved = await saveSupportEven(even);
      if (saved && !saved.off) setMine((prev) => ({ ...prev, even: saved.even }));
    } catch (error) {
      setProblem(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="support">
      <h1 className="support__title">Your support</h1>
      <p className="support__lead">
        Part of every Mimyne Plus subscription goes to the Hubs its member actually uses: the time you spend in a Hub, with its tab on
        screen and you doing something, decides where your part goes. Owners sell nothing and you pay nothing extra.
      </p>

      {problem && <p className="support__problem" role="alert">{problem}</p>}

      {!mine && !problem && <p className="muted">Loading…</p>}

      {mine?.off && (
        <section className="card support__section">
          <p className="muted">Plus supports Hubs isn't running yet. When it does, this page shows where your support goes.</p>
        </section>
      )}

      {mine && !mine.off && !mine.plus && (
        <section className="card support__section">
          <h2 className="support__h2">With Plus, your time supports the Hubs you use</h2>
          <p className="muted">
            You don't have Mimyne Plus at the moment. Nothing of yours is recorded for this; you count only as someone active in the Hubs you visit.
          </p>
          <Link to="/pricing" className="support__link">Plans and pricing</Link>
        </section>
      )}

      {mine && !mine.off && mine.plus && (
        <>
          <section className="card support__section">
            <h2 className="support__h2">{monthName(mine.month)}</h2>
            <p className="muted">
              Your support this month is about <strong>{money(mine.budgetCents)}</strong>. These figures are estimates until the month closes; no money
              moves yet.
            </p>
            {mine.even ? (
              <p className="support__even">
                <Icon name="check" size={16} /> Split evenly between the Hubs you pledge to. None of your minutes are recorded.
              </p>
            ) : mine.hubs.length === 0 ? (
              <p className="muted">No qualified time in a Hub yet this month.</p>
            ) : (
              <ul className="support__hubs">
                {mine.hubs.map((h) => (
                  <li key={h.hub} className="support__hub">
                    <Link to={`/h/${h.hub}`} className="support__hub-name">{h.hub}</Link>
                    <span className="support__bar" aria-hidden="true">
                      <span className="support__bar-fill" style={{ width: `${Math.round(h.share * 100)}%` }} />
                    </span>
                    <span className="support__hub-share">{Math.round(h.share * 100)}%</span>
                    <span className="support__hub-cents">{money(h.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card support__section">
            <h2 className="support__h2">How it is split</h2>
            <label className="support__choice">
              <input type="radio" name="support-split" checked={!mine.even} disabled={saving} onChange={() => choose(false)} />
              <span>
                <strong>By the time I spend.</strong> A minute counts when a Hub's tab is on screen and you did something in the last two minutes, or a
                video is playing. Only Plus members' minutes are recorded: one number per Hub per day, kept for the dispute window, never sold or
                used for ads.
              </span>
            </label>
            <label className="support__choice">
              <input type="radio" name="support-split" checked={mine.even} disabled={saving} onChange={() => choose(true)} />
              <span>
                <strong>Evenly between the Hubs I pledge to.</strong> None of your minutes are recorded at all.
              </span>
            </label>
          </section>
        </>
      )}
    </div>
  );
}
