import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import { HUB_COLORS, createHub, hubAddressProblem } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import NeedsAccount from './NeedsAccount.jsx';
import './NewHub.css';

const toAddress = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

export default function NewHub() {
  const { user } = useSession();
  return user ? <Form me={user} /> : <NeedsAccount what="how to start a Hub" />;
}

function Form({ me }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  const [tagline, setTagline] = useState('');
  const [tag, setTag] = useState('');
  const [color, setColor] = useState(HUB_COLORS[0]);
  const [visibility, setVisibility] = useState('public');
  const [postingPolicy, setPostingPolicy] = useState('signed-in');
  const [rules, setRules] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const id = addressTouched ? address : toAddress(name);
  const addressProblem = id ? hubAddressProblem(id) : null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createHub({ id, name, tagline, tag: tag.replace(/^#/, ''), color, visibility, postingPolicy, rules }, me);
      navigate(`/h/${id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="new-hub" onSubmit={submit}>
      <header className="new-hub__head">
        <HubIcon hub={{ name: name || 'H', color }} size={72} />
        <div>
          <h1 className="new-hub__title">Start a Hub</h1>
          <p className="muted">A home for a crew: a Board to post on, people who pledge, and your own roles.</p>
        </div>
      </header>

      <label className="field">
        Name
        <input className="field__input" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        Address
        <span className="new-hub__address">
          <span className="muted">mimyne.com/h/</span>
          <input
            className="field__input"
            required
            maxLength={32}
            value={id}
            onChange={(e) => {
              setAddressTouched(true);
              setAddress(e.target.value.toLowerCase());
            }}
          />
        </span>
        <span className="field__hint">{addressProblem ?? "It can't be changed later."}</span>
      </label>

      <label className="field">
        One line about it
        <input className="field__input" maxLength={140} value={tagline} onChange={(e) => setTagline(e.target.value)} />
      </label>

      <label className="field">
        Tag
        <input className="field__input" maxLength={30} placeholder="modding" value={tag} onChange={(e) => setTag(e.target.value)} />
      </label>

      <fieldset className="new-hub__group">
        <legend className="field">Colour</legend>
        <div className="new-hub__swatches">
          {HUB_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="new-hub__swatch"
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="new-hub__group">
        <legend className="field">Who can see it</legend>
        <Choice name="visibility" value="public" current={visibility} onChange={setVisibility} title="Public" note="Anyone can read it, even without an account. It can be shared as a link." />
        <Choice name="visibility" value="private" current={visibility} onChange={setVisibility} title="Private" note="Only people in it can see it." />
      </fieldset>

      <fieldset className="new-hub__group">
        <legend className="field">Who can post</legend>
        <Choice name="posting" value="signed-in" current={postingPolicy} onChange={setPostingPolicy} title="Anyone signed in" note="Like most of Mimyne. You can change it later." />
        <Choice name="posting" value="pledged" current={postingPolicy} onChange={setPostingPolicy} title="Only people who pledged" note="Others can read but not post or comment." />
      </fieldset>

      <label className="field">
        House rules
        <textarea className="field__input" maxLength={3000} placeholder="On top of Mimyne's Community Guidelines" value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" size="lg" variant="primary" loading={busy} disabled={!name.trim() || !!addressProblem}>
        Start {name.trim() || 'the Hub'}
      </Button>
    </form>
  );
}

function Choice({ name, value, current, onChange, title, note }) {
  return (
    <label className={`new-hub__choice ${current === value ? 'is-on' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
      <span>
        <strong>{title}</strong>
        <span className="muted">{note}</span>
      </span>
    </label>
  );
}
