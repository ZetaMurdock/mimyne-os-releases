import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { lookupUsername } from '../data/identity.js';
import { LEVELS, fetchStaffLevel, fetchTeam, sendTestMail, setTeamMember } from '../data/moderation.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import NeedsAccount from './NeedsAccount.jsx';
import './Team.css';

// /staff/team, for the Owner: the audit team and their levels. Triage reads
// the queue and dismisses or warns; an Auditor strikes and mutes; a Senior
// suspends, bans and clears. Developers are Senior by their account type and
// are not listed here. Every appointment goes in the audit log.
const LEVEL = {
  triage: ['Triage', 'Reads the queue; dismisses and warns'],
  auditor: ['Auditor', 'Strikes and mutes as well'],
  senior: ['Senior', 'Suspends, bans and clears as well'],
};

export default function Team() {
  const { user } = useSession();
  const [level, setLevel] = useState(undefined);

  useEffect(() => {
    let live = true;
    if (!user) { setLevel(null); return undefined; }
    fetchStaffLevel().then((data) => live && setLevel(data?.level ?? null)).catch(() => live && setLevel(null));
    return () => { live = false; };
  }, [user?.uid]);

  if (!user) return <NeedsAccount what="this page" />;
  if (level === undefined) return null;
  if (level !== 'owner') {
    return (
      <div className="team team--empty">
        <h1 className="team__title">Nothing here</h1>
        <p className="muted">This page is for Mimyne's Owner.</p>
      </div>
    );
  }
  return <TeamList />;
}

function TeamList() {
  const [team, setTeam] = useState(null);
  const [problem, setProblem] = useState(null);
  const [name, setName] = useState('');
  const [pick, setPick] = useState('triage');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  const load = () => fetchTeam().then((data) => setTeam(data?.team ?? [])).catch((error) => setProblem(error.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    const username = name.trim().replace(/^@/, '');
    if (!username) return;
    setBusy(true);
    setSaid(null);
    try {
      const uid = await lookupUsername(username);
      if (!uid) { setSaid(`There is no @${username}.`); return; }
      await setTeamMember(uid, pick);
      setSaid(`@${username} is ${LEVEL[pick][0]} now.`);
      setName('');
      await load();
    } catch (error) {
      setSaid(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function change(uid, level) {
    setBusy(true);
    setSaid(null);
    try {
      await setTeamMember(uid, level);
      await load();
    } catch (error) {
      setSaid(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team">
      <header>
        <h1 className="team__title">The audit team</h1>
        <p className="muted">
          Who decides on reports, and how far each may go. Developers are Senior by their account type and do not appear here. Every
          appointment and every decision is in the audit log.
        </p>
      </header>

      {problem && <p className="team__problem" role="alert">{problem}</p>}

      <section className="card team__card">
        <h2 className="team__h2">Levels</h2>
        <dl className="team__levels">
          {Object.entries(LEVEL).map(([id, [label, does]]) => (
            <div key={id}>
              <dt>{label}</dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card team__card">
        <h2 className="team__h2">Appoint someone</h2>
        <form className="team__form" onSubmit={add}>
          <input className="team__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="username" aria-label="Username" disabled={busy} />
          <select className="team__select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Level" disabled={busy}>
            {LEVELS.filter((l) => l !== 'owner').map((l) => <option key={l} value={l}>{LEVEL[l][0]}</option>)}
          </select>
          <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!name.trim()}>Appoint</Button>
        </form>
        {said && <p className="muted team__said" role="status">{said}</p>}
      </section>

      <section className="card team__card">
        <h2 className="team__h2">{team ? `${team.length} on the team` : 'The team'}</h2>
        {!team && !problem && <p className="muted">Loading…</p>}
        {team && team.length === 0 && <p className="muted">Nobody appointed yet.</p>}
        {team && team.length > 0 && (
          <ul className="team__list">
            {team.map((m) => <Member key={m.uid} member={m} busy={busy} onChange={change} />)}
          </ul>
        )}
      </section>

      <MailTest />
    </div>
  );
}

function Member({ member: m, busy, onChange }) {
  const person = usePerson(m.uid);
  return (
    <li className="team__member">
      <Link to={`/people/${m.uid}`} className="team__name">{person.name}</Link>
      <span className="muted">@{person.username}</span>
      <select className="team__select" value={m.level} onChange={(e) => onChange(m.uid, e.target.value)} aria-label={`Level for @${person.username}`} disabled={busy}>
        {LEVELS.filter((l) => l !== 'owner').map((l) => <option key={l} value={l}>{LEVEL[l][0]}</option>)}
      </select>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`Take @${person.username} off the team?`)) onChange(m.uid, null); }}>Remove</Button>
    </li>
  );
}

// Proof that Mimyne's email works, for whoever set it up (docs/operations.md,
// "Email"): the file service mails the Owner themselves.
function MailTest() {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);

  async function send() {
    setBusy(true);
    setSaid(null);
    try {
      const sent = await sendTestMail();
      setSaid(`Sent to ${sent?.to ?? 'your address'}. Look in your inbox, and in spam the first time.`);
    } catch (error) {
      setSaid(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card team__card">
      <h2 className="team__h2">Email</h2>
      <p className="muted">
        Moderation notices, payout emails and recovery links all go out through the file service. Send yourself one to see that it works.
      </p>
      <div className="team__form">
        <Button size="sm" variant="secondary" loading={busy} onClick={send}>Send me a test email</Button>
      </div>
      {said && <p className="muted team__said" role="status">{said}</p>}
    </section>
  );
}
