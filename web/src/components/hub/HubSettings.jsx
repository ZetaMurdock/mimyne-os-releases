import { useEffect, useState } from 'react';
import { Avatar } from '../Avatar.jsx';
import Button from '../Button.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import RoleChip from '../RoleChip.jsx';
import {
  HUB_COLORS, barPerson, createRole, deleteRole, removeMember, setMemberRole, unbarPerson, updateHubDetails, updateRole, watchBars,
} from '../../data/api.js';
import { usePerson } from '../../data/people.js';
import { MAX_ROLE_NAME, ROLE_LEVELS, assignableRoles, memberActions, roleIdFor, roleNameProblem } from '../../lib/hubRoles.js';
import './HubSettings.css';

/**
 * A Hub's owner tools: its details (name, tagline, tag, colour, who can
 * see it, who can post, the house rules), its roles, its people (their
 * roles, taking someone out, barring), and its look. The owner reaches all
 * of it; a mod reaches People, for what a mod may do there.
 */
export default function HubSettings({ hub, roles, members, user, level, onClose, onChanged, onLook }) {
  const owner = level === 'owner';
  const tabs = owner ? ['details', 'roles', 'people', 'look'] : ['people'];
  const [tab, setTab] = useState(tabs[0]);
  const labels = { details: 'Details', roles: 'Roles', people: 'People', look: 'Look' };
  return (
    <Dialog title={`${hub.name}: settings`} onClose={onClose} width={640}>
      <div className="hubset">
        {tabs.length > 1 && (
          <div className="hubset__tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`hubset__tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
                {labels[t]}
              </button>
            ))}
          </div>
        )}
        {tab === 'details' && <Details hub={hub} onChanged={onChanged} onClose={onClose} />}
        {tab === 'roles' && <Roles hub={hub} roles={roles} members={members} onChanged={onChanged} />}
        {tab === 'people' && <People hub={hub} roles={roles} members={members} user={user} level={level} onChanged={onChanged} />}
        {tab === 'look' && (
          <div className="hubset__look">
            <p className="muted">Its icon, banner, background and which pages are kept for some.</p>
            <Button onClick={onLook}>Open the look</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- details

function Details({ hub, onChanged, onClose }) {
  const [fields, setFields] = useState({
    name: hub.name, tagline: hub.tagline || '', tag: hub.tag || '', color: hub.color, visibility: hub.visibility, postingPolicy: hub.postingPolicy, rules: hub.rules || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setFields((f) => ({ ...f, ...patch }));

  async function save(event) {
    event.preventDefault();
    if (!fields.name.trim()) return setError('Give the Hub a name.');
    setSaving(true);
    setError(null);
    try {
      await updateHubDetails(hub.id, { ...fields, tag: fields.tag.replace(/^#/, '') });
      onChanged?.({ details: fields });
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "The Hub didn't take that. Only its owner changes its details." : err.message);
      setSaving(false);
    }
  }

  return (
    <form className="hubset__form" onSubmit={save}>
      <label className="field">
        Name
        <input className="field__input" value={fields.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        Tagline
        <input className="field__input" value={fields.tagline} maxLength={140} placeholder="What it is, in a line" onChange={(e) => set({ tagline: e.target.value })} />
      </label>
      <label className="field">
        Tag
        <input className="field__input" value={fields.tag} maxLength={30} placeholder="#modding" onChange={(e) => set({ tag: e.target.value })} />
      </label>
      <div className="field">
        Color
        <div className="hubset__colors" role="radiogroup" aria-label="Color">
          {HUB_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={fields.color === c} aria-label={c} className={`hubset__color ${fields.color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
        </div>
      </div>
      <fieldset className="hubset__choices">
        <legend>Who can see it</legend>
        <label><input type="radio" name="visibility" checked={fields.visibility === 'public'} onChange={() => set({ visibility: 'public' })} /> Public: anyone can read it, even without an account.</label>
        <label><input type="radio" name="visibility" checked={fields.visibility === 'private'} onChange={() => set({ visibility: 'private' })} /> Private: only people in it can see it.</label>
      </fieldset>
      <fieldset className="hubset__choices">
        <legend>Who can post</legend>
        <label><input type="radio" name="posting" checked={fields.postingPolicy === 'signed-in'} onChange={() => set({ postingPolicy: 'signed-in' })} /> Anyone signed in.</label>
        <label><input type="radio" name="posting" checked={fields.postingPolicy === 'pledged'} onChange={() => set({ postingPolicy: 'pledged' })} /> Only people who pledged. Others can read but not post or comment.</label>
      </fieldset>
      <label className="field">
        House rules
        <textarea className="field__input hubset__rules" rows={5} maxLength={3000} value={fields.rules} placeholder="On top of the Community Guidelines, as you'd say them" onChange={(e) => set({ rules: e.target.value })} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="hubset__actions">
        <span className="hubset__spacer" />
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>Save</Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ roles

function Roles({ hub, roles, members, onChanged }) {
  const [editing, setEditing] = useState(null); // false = new, a role = that one
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const count = (id) => members.filter((m) => m.role === id).length;
  const LEVEL_LABEL = { owner: 'Runs the Hub', mod: 'Keeps it tidy', member: 'Pledged' };

  async function remove(role) {
    if (count(role.id)) return setError(`${count(role.id)} ${count(role.id) === 1 ? 'person has' : 'people have'} ${role.name}. Give them another role first.`);
    if (!window.confirm(`Remove the role ${role.name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRole(hub.id, role.id);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hubset__list">
      {[...roles].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((role) => (
        <div key={role.id} className="hubset__row">
          <RoleChip role={role} />
          <span className="muted hubset__row-note">{LEVEL_LABEL[role.level]} · {count(role.id)} {count(role.id) === 1 ? 'person' : 'people'}</span>
          <span className="hubset__spacer" />
          <Button size="sm" variant="ghost" icon="pen" iconOnly aria-label={`Change ${role.name}`} onClick={() => setEditing(role)} />
          {role.level !== 'owner' && <Button size="sm" variant="ghost" icon="trash" iconOnly aria-label={`Remove ${role.name}`} disabled={busy} onClick={() => remove(role)} />}
        </div>
      ))}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="hubset__actions">
        <Button size="sm" icon="plus" onClick={() => setEditing(false)} disabled={roles.length >= 50}>New role</Button>
      </div>
      {editing !== null && (
        <RoleForm hub={hub} roles={roles} role={editing || null} onClose={() => setEditing(null)} onChanged={onChanged} />
      )}
    </div>
  );
}

function RoleForm({ hub, roles, role, onClose, onChanged }) {
  const [name, setName] = useState(role?.name ?? '');
  const [color, setColor] = useState(role?.color ?? HUB_COLORS[0]);
  const [level, setLevel] = useState(role?.level === 'mod' ? 'mod' : 'member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    const problem = roleNameProblem(name, roles, role?.id ?? null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (role) await updateRole(hub.id, role.id, { name: name.trim(), color, order: role.order ?? 0 });
      else await createRole(hub.id, roleIdFor(name, roles.map((r) => r.id)), { name: name.trim(), color, level, order: Math.min(49, roles.length) });
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "The Hub didn't take that role." : err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title={role ? role.name : 'A new role'} onClose={onClose}>
      <form className="hubset__form" onSubmit={save}>
        <label className="field">
          Name
          <input className="field__input" value={name} maxLength={MAX_ROLE_NAME} autoFocus placeholder="Builder" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          Color
          <div className="hubset__colors" role="radiogroup" aria-label="Color">
            {HUB_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`hubset__color ${color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        {!role ? (
          <fieldset className="hubset__choices">
            <legend>What it may do</legend>
            {ROLE_LEVELS.map((l) => (
              <label key={l}><input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} /> {l === 'mod' ? 'Keep the Hub tidy: a mod.' : 'Pledged: a member.'}</label>
            ))}
            <p className="muted">What a role may do is set when it is made.</p>
          </fieldset>
        ) : (
          <p className="muted">A role's name and colour can change; what it may do stays as it was made.</p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="hubset__actions">
          <span className="hubset__spacer" />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{role ? 'Save' : 'Make the role'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ----------------------------------------------------------------- people

function People({ hub, roles, members, user, level, onChanged }) {
  const [bars, setBars] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => watchBars(hub.id, setBars, () => setBars([])), [hub.id]);
  const choices = assignableRoles(roles);
  const roleOf = (id) => roles.find((r) => r.id === id) ?? null;

  const run = async (uid, work) => {
    setBusy(uid);
    setError(null);
    try {
      await work();
      onChanged?.();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "That wasn't allowed." : err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="hubset__list">
      <p className="muted">{members.length} pledged{bars.length ? `, ${bars.length} barred` : ''}.</p>
      {members.map((m) => {
        const may = memberActions({ actorUid: user.uid, actorLevel: level, member: m, ownerId: hub.ownerId });
        return (
          <PersonRow
            key={m.uid}
            member={m}
            role={roleOf(m.role)}
            owner={m.uid === hub.ownerId}
            choices={choices}
            may={may}
            busy={busy === m.uid}
            onRole={(role) => run(m.uid, () => setMemberRole(hub.id, m.uid, { role: role.id, level: role.level }))}
            onRemove={() => window.confirm(`Take ${m.name} out of ${hub.name}?`) && run(m.uid, () => removeMember(hub.id, m.uid))}
            onBar={() => {
              const reason = window.prompt(`Bar ${m.name} from ${hub.name}? They can still read a public Hub, but not pledge, post or comment. A reason, if you like:`, '');
              if (reason === null) return;
              run(m.uid, async () => {
                await barPerson(hub.id, m.uid, reason, user);
                await removeMember(hub.id, m.uid);
              });
            }}
          />
        );
      })}
      {bars.length > 0 && (
        <>
          <h3 className="label hubset__heading">Barred</h3>
          {bars.map((b) => (
            <BarredRow key={b.uid} bar={b} busy={busy === b.uid} onUnbar={() => run(b.uid, () => unbarPerson(hub.id, b.uid))} />
          ))}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

function PersonRow({ member, role, owner, choices, may, busy, onRole, onRemove, onBar }) {
  const person = usePerson(member.uid, member.name);
  return (
    <div className="hubset__row">
      <Avatar person={person} size={28} />
      <span className="hubset__row-name">{person.name}</span>
      {may.role ? (
        <select className="hubset__select" value={role?.id ?? ''} disabled={busy} aria-label={`${person.name}'s role`} onChange={(e) => { const next = choices.find((r) => r.id === e.target.value); if (next) onRole(next); }}>
          {choices.map((r) => <option key={r.id} value={r.id}>{r.name}{r.level === 'mod' ? ' (mod)' : ''}</option>)}
        </select>
      ) : (
        <RoleChip role={role} />
      )}
      {owner && <span className="muted">runs the Hub</span>}
      <span className="hubset__spacer" />
      {may.remove && <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Take out</Button>}
      {may.bar && <Button size="sm" variant="ghost" icon="lock" disabled={busy} onClick={onBar}>Bar</Button>}
    </div>
  );
}

function BarredRow({ bar, busy, onUnbar }) {
  const person = usePerson(bar.uid);
  return (
    <div className="hubset__row">
      <Icon name="lock" size={14} />
      <span className="hubset__row-name">{person.name}</span>
      {bar.reason && <span className="muted hubset__row-note">{bar.reason}</span>}
      <span className="hubset__spacer" />
      <Button size="sm" variant="ghost" disabled={busy} onClick={onUnbar}>Let back in</Button>
    </div>
  );
}
