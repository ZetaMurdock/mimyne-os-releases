import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../Avatar.jsx';
import Button from '../Button.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import RoomChat from './RoomChat.jsx';
import {
  createRoom, deleteRoom, leaveHere, roomName, stampHere, updateRoom, watchHere, watchLatest, watchRooms,
} from '../../data/rooms.js';
import { usePerson } from '../../data/people.js';
import { watchStatusSettings } from '../../data/status.js';
import './HubRooms.css';

// When each Room was last read on this device, for its unread mark.
const SEEN_KEY = 'mimyne.roomSeen';
function seenMap() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? {};
  } catch {
    return {};
  }
}
function markSeen(key) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seenMap(), [key]: Date.now() }));
  } catch {
    // Storage blocked: the mark just stays.
  }
}

/**
 * A Hub's Rooms, laid out the way Discord lays out a server: the Rooms down
 * the left, the chat in the middle, who's here and who pledged on the right.
 */
export default function HubRooms({ hub, members, roles, roleOf, user, access, roomId, onRoom, onSignIn }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // a room, or 'new'
  const [showPeople, setShowPeople] = useState(true);
  const [latest, setLatest] = useState({});
  const [, setSeenTick] = useState(0);
  const here = useHere(hub.id, user, roomId);
  const madeGeneral = useRef(false);

  useEffect(() => watchRooms(hub.id, setRooms, () => setError("This Hub's Rooms couldn't load.")), [hub.id]);

  // A Hub from before Rooms: its owner or a mod opens the first one.
  useEffect(() => {
    if (rooms && rooms.length === 0 && access.canModerate && user && !madeGeneral.current) {
      madeGeneral.current = true;
      createRoom(hub.id, { name: 'general', topic: 'Say hi.' }, user.uid).catch(() => {});
    }
  }, [rooms, access.canModerate, user, hub.id]);

  const active = rooms?.find((r) => r.id === roomId) ?? rooms?.[0] ?? null;

  // The newest message in every Room, for the unread marks.
  const roomKey = rooms?.map((r) => r.id).join(',') ?? '';
  useEffect(() => {
    if (!roomKey) return undefined;
    const stops = roomKey.split(',').map((id) => watchLatest(hub.id, id, (m) => setLatest((prev) => ({ ...prev, [id]: m }))));
    return () => stops.forEach((stop) => stop());
  }, [hub.id, roomKey]);

  const seenKey = active ? `${hub.id}/${active.id}` : null;
  useEffect(() => {
    if (!seenKey) return;
    markSeen(seenKey);
    setSeenTick((n) => n + 1);
  }, [seenKey, latest[active?.id]?.at]);

  const seen = seenMap();
  const unread = (room) => {
    const last = latest[room.id];
    return room.id !== active?.id && !!last && last.from !== user?.uid && last.at > (seen[`${hub.id}/${room.id}`] ?? 0);
  };

  async function move(room, by) {
    const list = [...rooms];
    const i = list.indexOf(room);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((r, order) => (r.order === order ? null : updateRoom(hub.id, r, { order })))).catch(() => setError("The Rooms couldn't be reordered."));
  }

  return (
    <div className={`rooms ${showPeople ? '' : 'rooms--no-people'}`}>
      <nav className="rooms__list" aria-label={`${hub.name} Rooms`}>
        <div className="rooms__group">
          <span className="rooms__group-name">Rooms</span>
          {access.canModerate && (
            <button type="button" className="rooms__add" aria-label="New Room" title="New Room" onClick={() => setEditing('new')}>
              <Icon name="plus" size={15} />
            </button>
          )}
        </div>
        {error && <p className="form-error rooms__error">{error}</p>}
        {rooms === null && <span className="rooms__skeleton" aria-hidden="true" />}
        {rooms?.length === 0 && <p className="muted rooms__none">{access.canModerate ? 'Opening #general…' : 'No Rooms yet.'}</p>}
        {rooms?.map((room) => (
          <div key={room.id} className={`rooms__item ${room === active ? 'is-active' : ''} ${unread(room) ? 'is-unread' : ''}`}>
            <button type="button" className="rooms__link" onClick={() => onRoom(room.id)} aria-current={room === active ? 'page' : undefined}>
              <Icon name={room.kind === 'announce' ? 'megaphone' : 'hash'} size={17} />
              <span className="rooms__name">{room.name}</span>
              {unread(room) && <span className="rooms__dot" aria-label="New messages" />}
            </button>
            {access.canModerate && (
              <button type="button" className="rooms__gear" aria-label={`Edit #${room.name}`} title="Edit Room" onClick={() => setEditing(room)}>
                <Icon name="gear" size={14} />
              </button>
            )}
          </div>
        ))}
      </nav>

      <section className="rooms__chat" aria-label={active ? `#${active.name}` : 'Room'}>
        {active ? (
          <>
            <header className="rooms__head">
              <Icon name={active.kind === 'announce' ? 'megaphone' : 'hash'} size={20} />
              <h2 className="rooms__title">{active.name}</h2>
              {active.topic && <p className="rooms__topic">{active.topic}</p>}
              <span className="rooms__head-tools">
                <button
                  type="button"
                  className={`rooms__tool ${showPeople ? 'is-on' : ''}`}
                  aria-pressed={showPeople}
                  aria-label="Show who's here"
                  title="Who's here"
                  onClick={() => setShowPeople((v) => !v)}
                >
                  <Icon name="users" size={18} />
                </button>
              </span>
            </header>
            <RoomChat
              key={active.id}
              hub={hub}
              room={active}
              user={user}
              access={access}
              members={members}
              roleOf={roleOf}
              onSignIn={onSignIn}
            />
          </>
        ) : (
          <div className="rooms__empty">
            <Icon name="hash" size={32} />
            <p>{rooms === null ? 'Loading Rooms…' : 'Pick a Room to start talking.'}</p>
          </div>
        )}
      </section>

      {showPeople && <People hub={hub} members={members} roles={roles} roleOf={roleOf} here={here} rooms={rooms ?? []} />}

      {editing && (
        <RoomDialog
          hub={hub}
          room={editing === 'new' ? null : editing}
          count={rooms?.length ?? 0}
          user={user}
          onMove={(by) => move(editing, by)}
          onClose={() => setEditing(null)}
          onMade={onRoom}
        />
      )}
    </div>
  );
}

/** Keeps you on the Hub's "Here now" list while you're in its Rooms (unless you're invisible). */
function useHere(hubId, user, roomId) {
  const [here, setHere] = useState({});
  const [mode, setMode] = useState(null);
  useEffect(() => watchHere(hubId, setHere), [hubId]);
  useEffect(() => (user ? watchStatusSettings(user.uid, (s) => setMode(s?.mode ?? 'auto')) : undefined), [user?.uid]);
  useEffect(() => {
    if (!user || !mode) return undefined;
    if (mode === 'invisible') {
      leaveHere(hubId, user.uid);
      return undefined;
    }
    const beat = () => document.visibilityState === 'visible' && stampHere(hubId, user.uid, roomId);
    beat();
    const timer = setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [hubId, user?.uid, mode, roomId]);
  // Leaving the Hub takes you off the list at once.
  useEffect(() => () => user && leaveHere(hubId, user.uid), [hubId, user?.uid]);
  return here;
}

function People({ hub, members, roles, roleOf, here, rooms }) {
  const hereIds = Object.keys(here);
  const groups = useMemo(() => {
    const byRole = new Map(roles.map((r) => [r.id, []]));
    const loose = [];
    for (const m of members) {
      if (here[m.uid] !== undefined) continue;
      (byRole.get(m.role) ?? loose).push(m);
    }
    return [...roles].sort((a, b) => a.order - b.order).map((r) => ({ role: r, people: byRole.get(r.id) })).filter((g) => g.people.length)
      .concat(loose.length ? [{ role: null, people: loose }] : []);
  }, [members, roles, here]);
  const roomName = (id) => rooms.find((r) => r.id === id)?.name;

  return (
    <aside className="rooms__people" aria-label="People">
      <h3 className="rooms__people-head">
        <span className="rooms__live-dot" aria-hidden="true" /> Here now — {hereIds.length}
      </h3>
      {hereIds.length === 0 && <p className="muted rooms__people-none">Nobody's in the Rooms right now.</p>}
      <ul>
        {hereIds.map((uid) => (
          <PersonRow key={uid} uid={uid} name={members.find((m) => m.uid === uid)?.name} role={roleOf(uid)} note={roomName(here[uid]) && `in #${roomName(here[uid])}`} live />
        ))}
      </ul>
      {groups.map(({ role, people }) => (
        <div key={role?.id ?? 'loose'}>
          <h3 className="rooms__people-head">
            {role?.name ?? 'Pledged'} — {people.length}
          </h3>
          <ul>
            {people.slice(0, 80).map((m) => (
              <PersonRow key={m.uid} uid={m.uid} name={m.name} role={role} />
            ))}
          </ul>
          {people.length > 80 && <p className="muted rooms__people-none">and {people.length - 80} more</p>}
        </div>
      ))}
      <p className="rooms__people-foot muted">{hub.visibility === 'public' ? 'Anyone can read this Hub’s Rooms.' : 'Only people in this Hub can read its Rooms.'}</p>
    </aside>
  );
}

function PersonRow({ uid, name, role, note, live = false }) {
  const person = usePerson(uid, name);
  return (
    <li className={`rooms__person ${live ? 'is-live' : ''}`}>
      <a href={`/people/${uid}`} className="rooms__person-link">
        <span className="rooms__person-pic">
          <Avatar person={person} size={32} />
          {live && <span className="rooms__person-dot" aria-hidden="true" />}
        </span>
        <span className="rooms__person-text">
          <span className="rooms__person-name" style={role?.level !== 'member' && role?.color ? { color: role.color } : undefined}>
            {person.name}
          </span>
          {note && <span className="rooms__person-note">{note}</span>}
        </span>
      </a>
    </li>
  );
}

function RoomDialog({ hub, room, count, user, onMove, onClose, onMade }) {
  const [name, setName] = useState(room?.name ?? '');
  const [topic, setTopic] = useState(room?.topic ?? '');
  const [kind, setKind] = useState(room?.kind ?? 'chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    if (!roomName(name)) return setError('Give the Room a name.');
    setBusy(true);
    setError(null);
    try {
      if (room) await updateRoom(hub.id, room, { name, topic, kind });
      else onMade(await createRoom(hub.id, { name, topic, kind, order: Math.min(99, count) }, user.uid));
      onClose();
    } catch {
      setError("That didn't save. Only the owner and mods set up Rooms.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete #${room.name}? Its messages go with it.`)) return;
    setBusy(true);
    try {
      await deleteRoom(hub.id, room.id);
      onClose();
    } catch {
      setError("The Room couldn't be deleted.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={room ? `Edit #${room.name}` : 'New Room'} onClose={onClose} width={460}>
      <form className="room-form" onSubmit={save}>
        <div className="room-form__kinds" role="radiogroup" aria-label="Kind of Room">
          {[
            { id: 'chat', icon: 'hash', title: 'Chat', note: 'Everyone who can post here talks.' },
            { id: 'announce', icon: 'megaphone', title: 'Announcements', note: 'Only the owner and mods post. Everyone reads.' },
          ].map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`room-form__kind ${kind === k.id ? 'is-on' : ''}`} onClick={() => setKind(k.id)}>
              <Icon name={k.icon} size={20} />
              <span>
                <strong>{k.title}</strong>
                <span className="muted">{k.note}</span>
              </span>
            </button>
          ))}
        </div>
        <label className="field">
          Name
          <span className="room-form__name">
            <Icon name={kind === 'announce' ? 'megaphone' : 'hash'} size={16} />
            <input className="field__input" value={name} maxLength={32} placeholder="new-room" onChange={(e) => setName(e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, ''))} autoFocus />
          </span>
        </label>
        <label className="field">
          Topic
          <input className="field__input" value={topic} maxLength={200} placeholder="What's this Room for?" onChange={(e) => setTopic(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="room-form__actions">
          {room && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onMove(-1)} aria-label="Move up">↑</Button>
              <Button variant="ghost" size="sm" onClick={() => onMove(1)} aria-label="Move down">↓</Button>
              <Button variant="ghost" size="sm" icon="trash" onClick={remove} disabled={busy}>Delete</Button>
            </>
          )}
          <span className="room-form__spacer" />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="inverse" loading={busy}>
            {room ? 'Save' : 'Make Room'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
