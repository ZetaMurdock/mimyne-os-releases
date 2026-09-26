import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import { HubIcon } from '../components/Avatar.jsx';
import { getHubCards } from '../data/api.js';
import { watchHubPro, watchMyPlans } from '../data/billing.js';
import { useSession } from '../data/session.jsx';
import { auth } from '../lib/firebase.js';
import { COMPARE, PRICES, checkoutUrl, money, onSale } from '../lib/plans.js';
import './Pricing.css';

const YEARLY_SAVING = PRICES.plus.amount * 12 - PRICES.plus_yearly.amount;
const BUNDLE_SAVING = PRICES.deep.amount + PRICES.plus_yearly.amount - PRICES.bundle.amount;

const dateOf = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/** mimyne.com/pricing: the plans, what's in them, and your own. */
export default function Pricing() {
  const { user, signIn } = useSession();
  const [yearly, setYearly] = useState(false);
  const [mine, setMine] = useState({ deep: null, plus: null });

  useEffect(() => (user ? watchMyPlans(user.uid, setMine) : setMine({ deep: null, plus: null })), [user?.uid]);

  const buyer = user ? { uid: user.uid, email: auth.currentUser?.email ?? undefined } : null;
  const plusPlan = yearly ? 'plus_yearly' : 'plus';

  return (
    <div className="pricing">
      <header className="pricing__hero">
        <h1 className="pricing__title">Start free. Go deeper when you&apos;re ready.</h1>
        <p className="pricing__lead">The social side stays free.</p>
        <div className="pricing__toggle" role="radiogroup" aria-label="Billing">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'is-on' : ''} onClick={() => setYearly(false)}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
            Yearly <span className="pricing__save">−{money(YEARLY_SAVING)}</span>
          </button>
        </div>
      </header>

      {user && (mine.deep?.active || mine.plus?.active) && <YourPlan mine={mine} />}

      <section className="pricing__plans" aria-label="Plans">
        <Plan
          name="Free + Surface"
          price="$0"
          per="Always free"
          items={['Hubs, Rooms and chat', 'Notes and writing in the app', '5 GB storage']}
          action={<Button variant="ghost" to="/">Explore</Button>}
        />
        <Plan
          name="Deep"
          price={money(PRICES.deep.amount)}
          per="per year"
          items={['File writer and API nodes', 'Logic Forge, agents, automations', 'Yearly app key']}
          action={<BuyButton plan="deep" buyer={buyer} have={mine.deep} onSignIn={signIn} label="Get Deep" />}
        />
        <Plan
          featured
          name="Mimyne Plus"
          price={money(PRICES[plusPlan].amount)}
          per={yearly ? 'per year' : 'per month'}
          items={['100 GB storage, 25 GB files', 'Up to 10 Hubs, bigger canvases', 'Hub themes and chat search']}
          action={<BuyButton strong plan={plusPlan} buyer={buyer} have={mine.plus} onSignIn={signIn} label="Get Plus" />}
        />
        <Plan
          name="Deep + Plus"
          price={money(PRICES.bundle.amount)}
          per="per year"
          items={['Everything in Deep', 'Everything in Plus', `Save ${money(BUNDLE_SAVING)} a year`]}
          action={<BuyButton plan="bundle" buyer={buyer} have={mine.deep?.active && mine.plus?.active ? mine.deep : null} onSignIn={signIn} label="Get both" />}
        />
      </section>

      <section className="pricing__compare">
        <h2 className="pricing__h2">Free and Plus</h2>
        <div className="pricing__table-wrap">
          <table className="pricing__table">
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Free</th>
                <th scope="col">Plus</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([feature, free, plus]) => (
                <tr key={feature}>
                  <th scope="row">{feature}</th>
                  <td>{free}</td>
                  <td>{plus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pricing__fine">Plus features are planned for launch and still being tested. Conversion size depends on the format.</p>
      </section>

      <HubPro buyer={buyer} onSignIn={signIn} />

      <p className="pricing__fine pricing__legal">
        USD. Tax may apply at checkout. Payments by Lemon Squeezy. <a href="/terms.html">Terms</a>
      </p>
    </div>
  );
}

function Plan({ name, price, per, items, action, featured = false }) {
  return (
    <article className={`plan ${featured ? 'plan--featured' : ''}`}>
      <h2 className="plan__name">{name}</h2>
      <p className="plan__price">
        <span className="plan__amount">{price}</span>
        <span className="plan__per">{per}</span>
      </p>
      <ul className="plan__items">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="plan__action">{action}</div>
    </article>
  );
}

/** Buy, sign in to buy, "Available at launch", or what you already have. */
function BuyButton({ plan, buyer, have, onSignIn, label, hub, strong = false }) {
  const variant = strong ? 'inverse' : 'secondary';
  if (have?.active) {
    return have.portal ? (
      <Button variant="secondary" href={have.portal} icon="check">Yours · Manage</Button>
    ) : (
      <Button variant="secondary" selected disabled>Yours</Button>
    );
  }
  if (!onSale(plan)) return <span className="plan__soon">Available at launch</span>;
  if (!buyer) return <Button variant={variant} onClick={onSignIn}>Sign in to buy</Button>;
  return <Button variant={variant} href={checkoutUrl(plan, { ...buyer, hub })}>{label}</Button>;
}

function YourPlan({ mine }) {
  const rows = [
    mine.deep?.active && ['Deep', mine.deep],
    mine.plus?.active && ['Mimyne Plus', mine.plus],
  ].filter(Boolean);
  return (
    <section className="pricing__mine" aria-label="Your plan">
      {rows.map(([name, e]) => (
        <p key={name}>
          <strong>{name}</strong>
          <span className="muted">
            {e.status === 'cancelled' ? ' · ends ' : ' · renews '}
            {e.until ? dateOf(e.until) : ''}
          </span>
          {e.portal && <a href={e.portal} className="pricing__manage">Manage</a>}
        </p>
      ))}
    </section>
  );
}

function HubPro({ buyer, onSignIn }) {
  const { pledged } = useSession();
  const [owned, setOwned] = useState(null);

  useEffect(() => {
    if (!buyer) return undefined;
    let live = true;
    getHubCards([...pledged]).then((hubs) => live && setOwned(hubs.filter((h) => h.ownerId === buyer.uid)), () => live && setOwned([]));
    return () => {
      live = false;
    };
  }, [buyer?.uid, pledged]);

  return (
    <section className="pricing__hub">
      <div className="pricing__hub-copy">
        <h2 className="pricing__h2">Hub Pro</h2>
        <p className="muted">For one Hub you own. Separate from your own Plus.</p>
      </div>
      <article className="plan plan--hub">
        <p className="plan__price">
          <span className="plan__amount">{money(PRICES.hub_pro.amount)}</span>
          <span className="plan__per">per month</span>
        </p>
        <ul className="plan__items">
          {[
            '5,000 members and 50 Rooms (250 and 10 free)',
            '100 GB shared storage, custom roles',
            'Activity analytics',
            'Gift Plus: a month per 25 active members, up to 10 a month',
          ].map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="plan__action plan__action--hubs">
          {!onSale('hub_pro') ? (
            <span className="plan__soon">Available at launch</span>
          ) : !buyer ? (
            <Button variant="secondary" onClick={onSignIn}>Sign in to buy</Button>
          ) : owned === null ? (
            <span className="muted">Finding your Hubs…</span>
          ) : owned.length === 0 ? (
            <span className="muted">Start a Hub first, then give it Hub Pro here.</span>
          ) : (
            owned.map((hub) => <HubRow key={hub.id} hub={hub} buyer={buyer} onSignIn={onSignIn} />)
          )}
        </div>
      </article>
    </section>
  );
}

function HubRow({ hub, buyer, onSignIn }) {
  const [pro, setPro] = useState(null);
  useEffect(() => watchHubPro(hub.id, setPro), [hub.id]);
  return (
    <div className="plan__hub">
      <HubIcon hub={hub} size={28} />
      <span className="plan__hub-name">{hub.name}</span>
      <BuyButton plan="hub_pro" buyer={buyer} have={pro} onSignIn={onSignIn} label="Get Hub Pro" hub={hub.id} />
    </div>
  );
}
