import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
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
        <h1 className="pricing__title">
          Start free.
          <br />
          Go deeper when you&apos;re ready.
        </h1>
        <p className="pricing__lead">
          The social side stays free. Choose Deep for your desktop tools, Plus for your everyday social space, or both.
        </p>
        <div className="pricing__toggle" role="radiogroup" aria-label="Billing">
          <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? 'is-on' : ''} onClick={() => setYearly(false)}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
            Yearly <span className="pricing__save">Plus saves {money(YEARLY_SAVING)}</span>
          </button>
        </div>
      </header>

      {user && (mine.deep?.active || mine.plus?.active) && <YourPlan mine={mine} />}

      <section className="pricing__plans" aria-label="Plans">
        <Plan
          name="Free + Surface"
          price="$0"
          per="Always free"
          blurb="Your people and your starting point."
          items={['Free social account on mimyne.com', 'Notes and writing in the desktop app', 'Surface key, renewed free each year', '5 GB storage · files up to 2 GB']}
          action={<Button variant="secondary" to="/">Explore Mimyne</Button>}
        />
        <Plan
          name="Deep"
          price={money(PRICES.deep.amount)}
          per="per year"
          blurb="The desktop tools behind your next big idea."
          items={['File writer and API nodes', 'Logic Forge, agents and automations', 'Yearly app license key', 'Plus sold separately']}
          action={<BuyButton plan="deep" buyer={buyer} have={mine.deep} onSignIn={signIn} label="Get Deep" />}
        />
        <Plan
          featured
          name="Mimyne Plus"
          price={money(PRICES[plusPlan].amount)}
          per={yearly ? 'per year' : 'per month'}
          blurb="More space for everything you share."
          items={['100 GB storage · files up to 25 GB', 'Own up to 10 Hubs', 'Larger canvases and Hub themes', 'Search across all your chats']}
          note={yearly
            ? `About ${money(Math.floor((PRICES.plus_yearly.amount / 12) * 100) / 100)}/month, billed yearly.`
            : `${money(PRICES.plus.amount * 12)} over 12 monthly payments.`}
          action={<BuyButton plan={plusPlan} buyer={buyer} have={mine.plus} onSignIn={signIn} label="Get Plus" />}
        />
        <Plan
          name="Deep + Plus"
          price={money(PRICES.bundle.amount)}
          per="per year"
          blurb="Your desktop and social space, together."
          items={['Everything in Deep', 'Everything in Plus', `Save ${money(BUNDLE_SAVING)} versus separate yearly plans`, 'One yearly subscription']}
          action={<BuyButton plan="bundle" buyer={buyer} have={mine.deep?.active && mine.plus?.active ? mine.deep : null} onSignIn={signIn} label="Get both" />}
        />
      </section>

      <section className="pricing__compare">
        <h2 className="pricing__h2">What changes with Plus?</h2>
        <p className="muted">Planned launch benefits, unless marked otherwise. These upgrades are still being built and tested.</p>
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
        <p className="pricing__fine">
          Conversion size depends on the format and engine. Support for multi-gigabyte conversions is still in development;
          upload limits do not guarantee conversion support.
        </p>
      </section>

      <HubPro buyer={buyer} onSignIn={signIn} />

      <p className="pricing__fine pricing__legal">
        Prices in USD. Tax may be added at checkout depending on where you live. Payments are handled by Lemon Squeezy.
        See the <a href="/terms.html">Terms of Service</a>.
      </p>
    </div>
  );
}

function Plan({ name, price, per, blurb, items, note, action, featured = false }) {
  return (
    <article className={`plan ${featured ? 'plan--featured' : ''}`}>
      <h2 className="plan__name">{name}</h2>
      <p className="plan__price">
        <span className="plan__amount">{price}</span>
        <span className="plan__per">{per}</span>
      </p>
      <p className="plan__blurb">{blurb}</p>
      <ul className="plan__items">
        {items.map((item) => (
          <li key={item}>
            <Icon name="check" size={14} strokeWidth={2.5} />
            {item}
          </li>
        ))}
      </ul>
      {note && <p className="plan__note">{note}</p>}
      <div className="plan__action">{action}</div>
    </article>
  );
}

/** Buy, sign in to buy, "Available at launch", or what you already have. */
function BuyButton({ plan, buyer, have, onSignIn, label, hub }) {
  if (have?.active) {
    return have.portal ? (
      <Button variant="secondary" href={have.portal} icon="check">Yours · Manage</Button>
    ) : (
      <Button variant="secondary" selected disabled>Yours</Button>
    );
  }
  if (!onSale(plan)) return <span className="plan__soon">Available at launch</span>;
  if (!buyer) return <Button variant="primary" onClick={onSignIn}>Sign in to buy</Button>;
  return <Button variant="primary" href={checkoutUrl(plan, { ...buyer, hub })}>{label}</Button>;
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
        <p className="pricing__kicker">For community owners</p>
        <h2 className="pricing__h2">Your Hub, with room to grow.</h2>
        <p className="muted">Hub Pro adds capacity and tools to one Hub. It&apos;s separate from your personal Plus subscription.</p>
      </div>
      <article className="plan plan--hub">
        <h3 className="plan__name">Hub Pro</h3>
        <p className="plan__price">
          <span className="plan__amount">{money(PRICES.hub_pro.amount)}</span>
          <span className="plan__per">per month, per Hub</span>
        </p>
        <ul className="plan__items">
          {[
            'Up to 5,000 members, compared with 250 free',
            '50 Rooms, compared with 10 free',
            '5,000 notes per Room and custom roles',
            '100 GB of shared Hub storage',
            'Member and Room activity analytics',
            'One month of Plus to gift per 25 active members, up to 10 gifts each month',
          ].map((item) => (
            <li key={item}>
              <Icon name="check" size={14} strokeWidth={2.5} />
              {item}
            </li>
          ))}
        </ul>
        <p className="plan__note">
          Active members are unique members who messaged or interacted with the Hub in the previous 7 days.
        </p>
        <div className="plan__action plan__action--hubs">
          {!onSale('hub_pro') ? (
            <span className="plan__soon">Available at launch</span>
          ) : !buyer ? (
            <Button variant="primary" onClick={onSignIn}>Sign in to buy</Button>
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
