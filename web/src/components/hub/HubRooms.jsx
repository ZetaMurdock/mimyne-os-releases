import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../Avatar.jsx';
import Button from '../Button.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import Canvas from '../canvas/Canvas.jsx';
import RoomChat from './RoomChat.jsx';
import {
  clearRoomWorkspace, createRoom, deleteRoom, leaveHere, levelIn, roomIdFor, roomName, roomRights, stampHere, updateRoom, watchHere, watchLatest, watchRooms,
} from '../../data/rooms.js';
import { watchCanvas, watchPreview } from '../../data/canvas.js';
import { linkWorkspace, myAppWorkspaces, watchAppPreview, watchAppWorkspace } from '../../data/appWorkspaces.js';
import { usePerson } from '../../data/people.js';
import { watchStatusSettings } from '../../data/status.js';
import { timeAgo } from '../../lib/format.js';
import './HubRooms.css';

const ACCESS_LABEL = { edit: 'You can edit', add: 'You can add notes', view: 'You can view' };
const SORTS = [
  { id: 'busy', label: 'Busiest first' },
  { id: 'recent', label: 'Recently edited' },
  { id: 'order', label: 'In order' },
];

const plural = (name) => (/s$/i.test(name) ? name : `${name}s`);
const roleName = (roles, level, fallback) => roles.find((r) => r.level === level)?.name ?? fallback;

/** Who a level of people is, in the Hub's own words: "the Warden and Keepers". */
function whoLabel(who, roles) {
  if (who === 'owner') return `the ${roleName(roles, 'owner', 'owner')}`;
  if (who === 'mods') return `the ${roleName(roles, 'owner', 'owner')} and ${plural(roleName(roles, 'mod', 'mod'))}`;
  if (who === 'pledged') return 'pledged people';
  return 'everyone';
}

/** A locked Room's front: "Keepers only". */
function onlyLabel(who, roles) {
  if (who === 'owner') return `${roleName(roles, 'owner', 'Owner')} only`;
  if (who === 'mods') return `${plural(roleName(roles, 'mod', 'Mod'))} only`;
  return 'Pledged only';
}

const rightsLabel = (rights) => ACCESS_LABEL[rights.edit ? 'edit' : rights.add ? 'add' : 'view'];

/**
 * A Hub's Rooms. Each is a workspace: a canvas of notes, files, shapes,
 * lists and arrows, with a chat under it. The grid shows them as cards;
 * opening one fills the tab with it.
 */
export default function HubRooms({ hub, members, roles, roleOf, user, access, roomId, onRoom, onSignIn }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // a room, or 'new'
  const [writing, setWriting] = useState(false);
  const madeGeneral = useRef(false);
  const level = levelIn(hub, user, members, access.isPledged);
  const here = useHere(hub.id, user, roomId, writing);

  useEffect(() => watchRooms(hub.id, setRooms, () => setError("This Hub's Rooms couldn't load.")), [hub.id]);

  // A Hub from before Rooms: its owner or a mod opens the first one.
  useEffect(() => {
    if (rooms && rooms.length === 0 && access.canModerate && user && !madeGeneral.current) {
      madeGeneral.current = true;
      createRoom(hub.id, { name: 'General', tag: 'general', topic: 'Say hi.' }, user.uid).catch(() => {});
    }
  }, [rooms, access.canModerate, user, hub.id]);

  const open = roomId && rooms ? rooms.find((r) => r.id === roomId) : null;
  // A workspace from the app is shown, never changed, here.
  const rightsOf = (room) => {
    const r = roomRights(room, level, !!access.canPost);
    return room.workspace ? { ...r, add: false, edit: false } : r;
  };

  let body;
  if (roomId && rooms && !open) {
    body = (
      <div className="rooms-empty">
        <p>That Room isn't here any more.</p>
        <Button onClick={() => onRoom(null)}>All Rooms</Button>
      </div>
    );
  } else if (open) {
    body = (
      <RoomView
        key={open.id}
        hub={hub}
        room={open}
        rights={rightsOf(open)}
        user={user}
        access={access}
        members={members}
        roles={roles}
        roleOf={roleOf}
        here={here}
        onBack={() => onRoom(null)}
        onSettings={() => setEditing(open)}
        onSignIn={onSignIn}
        onWriting={setWriting}
      />
    );
  } else {
    body = (
      <RoomGrid
        hub={hub}
        rooms={rooms}
        error={error}
        roles={roles}
        members={members}
        here={here}
        rightsOf={rightsOf}
        canModerate={access.canModerate}
        signedIn={!!user}
        onOpen={onRoom}
        onNew={() => setEditing('new')}
        onSettings={setEditing}
      />
    );
  }

  return (
    <>
      {body}
      {editing && (
        <RoomDialog
          hub={hub}
          room={editing === 'new' ? null : editing}
          rooms={rooms ?? []}
          roles={roles}
          user={user}
          onClose={() => setEditing(null)}
          onMade={onRoom}
          onDeleted={() => onRoom(null)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------------ grid

function RoomGrid({ hub, rooms, error, roles, members, here, rightsOf, canModerate, signedIn, onOpen, onNew, onSettings }) {
  const [sort, setSort] = useState('busy');
  const sorted = useMemo(() => {
    const count = (id) => Object.values(here).filter((h) => h.room === id).length;
    const list = [...(rooms ?? [])];
    if (sort === 'busy') list.sort((a, b) => count(b.id) - count(a.id) || (b.editedAt ?? 0) - (a.editedAt ?? 0) || a.order - b.order);
    if (sort === 'recent') list.sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
    return list;
  }, [rooms, sort, here]);
  const inRoom = (id) => Object.entries(here).filter(([, h]) => h.room === id).map(([uid, h]) => ({ uid, ...h }));

  return (
    <section className="rooms-grid" aria-label="Rooms">
      <header className="rooms-grid__head">
        <h2 className="rooms-grid__title">Rooms</h2>
        <select className="rooms-grid__sort" aria-label="Sort Rooms" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </header>
      {error && <p className="form-error">{error}</p>}
      <div className="rooms-grid__list">
        {rooms === null && [0, 1, 2].map((i) => <div key={i} className="room-tile room-tile--skeleton" aria-hidden="true" />)}
        {sorted.map((room) => (
          <RoomTile
            key={room.id}
            hub={hub}
            room={room}
            rights={rightsOf(room)}
            roles={roles}
            members={members}
            inside={inRoom(room.id)}
            signedIn={signedIn}
            canModerate={canModerate}
            onOpen={() => onOpen(room.id)}
            onSettings={() => onSettings(room)}
          />
        ))}
        {canModerate && (
          <button type="button" className="room-tile room-tile--add" onClick={onNew}>
            <Icon name="plus" size={20} />
            <strong>Add a workspace as a room</strong>
            <span>A canvas for notes, files and lists, with a chat under it</span>
          </button>
        )}
        {rooms?.length === 0 && !canModerate && <p className="muted">No Rooms yet.</p>}
      </div>
    </section>
  );
}

function RoomTile({ hub, room, rights, roles, members, inside, signedIn, canModerate, onOpen, onSettings }) {
  const live = inside.length > 0 && rights.view;
  const writer = inside.find((h) => h.writing);
  return (
    <article className={`room-tile ${live ? 'is-live' : ''} ${rights.view ? '' : 'is-locked'}`}>
      <button type="button" className="room-tile__open" onClick={onOpen} aria-label={`Open ${room.name}`} disabled={!rights.view} />
      <div className="room-tile__front">
        {rights.view ? (room.pending ? <span className="room-tile__blank">Setting up…</span> : room.workspace ? <AppPreview workspaceId={room.workspace} /> : <Preview hubId={hub.id} roomId={room.id} />) : (
          <span className="room-tile__lock"><Icon name="lock" size={14} /> {onlyLabel(room.access.view, roles)}</span>
        )}
        {live && <span className="room-tile__live">● LIVE</span>}
        {room.workspace && rights.view && <span className="room-tile__app">From the app</span>}
        {canModerate && (
          <button type="button" className="room-tile__gear" aria-label={`Settings for ${room.name}`} title="Room settings" onClick={onSettings}>
            <Icon name="gear" size={14} />
          </button>
        )}
      </div>
      <div className="room-tile__body">
        <div className="room-tile__title">
          <h3 className="room-tile__name">
            {room.kind === 'announce' && <Icon name="megaphone" size={14} />}
            {room.name}
          </h3>
          <span className="room-tile__tag">#{room.tag}</span>
        </div>
        {rights.view ? (
          <div className="room-tile__status">
            {writer ? (
              <Writer uid={writer.uid} members={members} />
            ) : live ? (
              <Inside people={inside} members={members} />
            ) : (
              <span className="room-tile__who is-quiet">
                Quiet{room.editedAt ? ` · edited ${timeAgo(room.editedAt)}` : room.topic ? ` · ${room.topic}` : ''}
              </span>
            )}
            <span className="room-tile__access">{signedIn ? rightsLabel(rights) : 'View only'}</span>
          </div>
        ) : (
          <p className="room-tile__who is-quiet">Only {whoLabel(room.access.view, roles)} can see inside</p>
        )}
      </div>
    </article>
  );
}

function Writer({ uid, members }) {
  const person = usePerson(uid, members.find((m) => m.uid === uid)?.name);
  return (
    <>
      <Avatar person={person} size={20} />
      <span className="room-tile__who">{person.name} is writing</span>
    </>
  );
}

function Inside({ people, members }) {
  const first = usePerson(people[0]?.uid, members.find((m) => m.uid === people[0]?.uid)?.name);
  const second = usePerson(people[1]?.uid ?? null, members.find((m) => m.uid === people[1]?.uid)?.name);
  const words = people.length === 1 ? `${first.name} is here` : `${first.name}, ${second.name}${people.length > 2 ? ` and ${people.length - 2} more` : ''}`;
  return (
    <>
      <span className="room-tile__faces">
        {people.slice(0, 3).map((p) => <Face key={p.uid} uid={p.uid} members={members} />)}
      </span>
      <span className="room-tile__who">{words}</span>
    </>
  );
}

function Face({ uid, members }) {
  return <Avatar person={usePerson(uid, members.find((m) => m.uid === uid)?.name)} size={20} />;
}

/** The Room's front: its canvas in miniature. */
function Preview({ hubId, roomId }) {
  const [nodes, setNodes] = useState(null);
  useEffect(() => watchPreview(hubId, roomId, setNodes), [hubId, roomId]);
  return <Miniature nodes={nodes} />;
}

/** An app workspace's front: what its owner published, in miniature. */
function AppPreview({ workspaceId }) {
  const [nodes, setNodes] = useState(null);
  useEffect(() => watchAppPreview(workspaceId, setNodes), [workspaceId]);
  return <Miniature nodes={nodes} empty="Nothing published yet" />;
}

function Miniature({ nodes, empty = 'Empty canvas' }) {
  const shown = (nodes ?? []).filter((n) => !n.parentId);
  if (!shown.length) return <span className="room-tile__blank">{nodes ? empty : ''}</span>;
  const boxes = shown.map((n) => {
    const w = n.style.width ?? (n.type === 'list' ? 272 : n.type === 'file' ? 280 : 220);
    const cards = nodes.filter((c) => c.parentId === n.id).length;
    const h = n.style.height ?? (n.type === 'list' ? 80 + cards * 44 : n.type === 'shape' ? 110 : 70);
    return { n, x: n.x - w / 2, y: n.type === 'list' ? n.y - 24 : n.y - h / 2, w, h };
  });
  const minX = Math.min(...boxes.map((b) => b.x)) - 60;
  const minY = Math.min(...boxes.map((b) => b.y)) - 60;
  const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 60;
  const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 60;
  return (
    <svg className="room-tile__preview" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {boxes.map(({ n, x, y, w, h }) => (
        <rect
          key={n.id}
          x={x}
          y={y}
          width={w}
          height={h}
          rx={n.style.shape === 'ellipse' || n.style.shape === 'pill' ? Math.min(w, h) / 2 : 10}
          fill={n.type === 'text' ? 'none' : n.style.color ? `${n.style.color}33` : '#1d1d22'}
          stroke={n.type === 'text' ? 'none' : n.style.color ?? '#3a3a40'}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ a Room

function RoomView({ hub, room, rights, user, access, members, roles, roleOf, here, onBack, onSettings, onSignIn, onWriting }) {
  const [nodes, setNodes] = useState(null);
  const [edges, setEdges] = useState([]);
  const [error, setError] = useState(null);
  const [show, setShow] = useState(readLayout);
  const [chatHeight, setChatHeight] = useState(readChatHeight);
  const [latest, setLatest] = useState(null);
  const [seenAt, setSeenAt] = useState(Date.now());
  const root = useRef(null);
  const chatHeightRef = useRef(chatHeight);
  chatHeightRef.current = chatHeight;

  const ready = rights.view && !room.pending;
  const [app, setApp] = useState(null); // an app workspace's name and owner
  useEffect(() => {
    if (!ready) return undefined;
    if (room.workspace) {
      setNodes(null);
      return watchAppWorkspace(room.workspace, (data) => {
        setApp({ name: data.name, ownerId: data.ownerId, sharing: data.sharing });
        setNodes(data.nodes);
        setEdges(data.edges);
      }, () => setError("This workspace can't be shown here right now. Its owner may have taken it out of this Room."));
    }
    return watchCanvas(hub.id, room.id, setNodes, setEdges, () => setError("This Room's canvas couldn't load."));
  }, [hub.id, room.id, ready, room.workspace]);
  useEffect(() => (ready ? watchLatest(hub.id, room.id, setLatest) : undefined), [hub.id, room.id, ready]);
  useEffect(() => {
    if (show.chat) setSeenAt(Date.now());
  }, [show.chat, latest?.at]);
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('mimyne.roomLayout', JSON.stringify(show));
    } catch {
      // Storage blocked: it just won't be remembered.
    }
  }, [show]);

  const inside = Object.entries(here).filter(([, h]) => h.room === room.id).map(([uid, h]) => ({ uid, ...h }));
  const unreadChat = !show.chat && latest && latest.from !== user?.uid && latest.at > seenAt;

  // Either may be put away, but not both.
  const toggle = (part) => setShow((s) => {
    const next = { ...s, [part]: !s[part] };
    return next.canvas || next.chat ? next : { canvas: part !== 'canvas', chat: part !== 'chat' };
  });

  function startResize(e) {
    e.preventDefault();
    const box = root.current.querySelector('.room-view__body').getBoundingClientRect();
    const move = (ev) => setChatHeight(Math.min(box.height - 160, Math.max(140, box.bottom - ev.clientY)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        localStorage.setItem('mimyne.chatHeight', String(Math.round(chatHeightRef.current)));
      } catch {
        // Not remembered.
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <section ref={root} className="room-view" aria-label={room.name}>
      <header className="room-view__head">
        <button type="button" className="room-view__back" onClick={onBack} aria-label="All Rooms" title="All Rooms">
          <Icon name="back" size={16} />
        </button>
        <div className="room-view__names">
          <h2 className="room-view__name">{room.name}</h2>
          <span className="room-view__tag">#{room.tag}</span>
          {room.topic && <span className="room-view__topic">{room.topic}</span>}
        </div>
        <span className="room-view__spacer" />
        {inside.length > 0 && (
          <span className="room-view__faces" title={`${inside.length} here now`}>
            {inside.slice(0, 5).map((p) => <Face key={p.uid} uid={p.uid} members={members} />)}
            {inside.length > 5 && <span className="room-view__more">+{inside.length - 5}</span>}
          </span>
        )}
        {room.workspace ? (
          <span className="room-tile__access" title={app ? `${app.name}, from the Mimyne app` : 'From the Mimyne app'}>From the app · view only</span>
        ) : rights.view && user && <span className="room-tile__access">{rightsLabel(rights)}</span>}
        <div className="room-view__layout" role="group" aria-label="Show">
          <button type="button" className={show.canvas ? 'is-on' : ''} aria-pressed={show.canvas} onClick={() => toggle('canvas')}>
            <Icon name="layout" size={15} /> Canvas
          </button>
          <button type="button" className={show.chat ? 'is-on' : ''} aria-pressed={show.chat} onClick={() => toggle('chat')}>
            <Icon name="message" size={15} /> Chat
            {unreadChat && <span className="room-view__dot" aria-label="New messages" />}
          </button>
        </div>
        {access.canModerate && (
          <button type="button" className="room-view__icon" aria-label="Room settings" title="Room settings" onClick={onSettings}>
            <Icon name="gear" size={16} />
          </button>
        )}
      </header>

      {!rights.view ? (
        <div className="rooms-empty">
          <Icon name="lock" size={22} />
          <p>Only {whoLabel(room.access.view, roles)} can see inside {room.name}.</p>
        </div>
      ) : (
        <div className="room-view__body">
          {show.canvas ? (
            <div className="room-view__canvas">
              {error ? (
                <p className="form-error">{error}</p>
              ) : nodes === null ? (
                <div className="room-view__loading">Loading the canvas…</div>
              ) : room.workspace && nodes.length === 0 ? (
                <div className="room-view__loading room-view__app-empty">
                  <strong>{app?.name ?? 'This workspace'}</strong>
                  <span>
                    Nothing from it is published yet.{' '}
                    {app?.ownerId === user?.uid ? 'In the Mimyne app, open the workspace and turn on sharing; it shows here as it changes.' : 'It shows here once its owner turns on sharing in the app.'}
                  </span>
                </div>
              ) : (
                <Canvas
                  key={room.workspace ?? 'canvas'}
                  nodes={nodes}
                  edges={edges}
                  rights={user ? rights : { view: true, add: false, edit: false }}
                  uid={user?.uid}
                  hubId={hub.id}
                  roomId={room.id}
                  onWriting={onWriting}
                />
              )}
            </div>
          ) : (
            <button type="button" className="room-view__folded" onClick={() => toggle('canvas')}>
              <Icon name="layout" size={15} /> Canvas · {nodes?.length ?? 0} {nodes?.length === 1 ? 'thing' : 'things'} on it
              <span className="room-view__folded-hint">Show</span>
            </button>
          )}
          {show.canvas && show.chat && (
            <div className="room-view__split" role="separator" aria-orientation="horizontal" aria-label="Drag to resize the chat" onPointerDown={startResize} />
          )}
          {show.chat ? (
            <div className="room-view__chat" style={show.canvas ? { height: chatHeight } : undefined}>
              {room.pending ? <div className="room-view__loading">Setting up the Room…</div> : <RoomChat hub={hub} room={room} user={user} access={access} members={members} roleOf={roleOf} onSignIn={onSignIn} />}
            </div>
          ) : (
            <button type="button" className="room-view__folded" onClick={() => toggle('chat')}>
              <Icon name="message" size={15} /> Chat{unreadChat ? ' · new messages' : ''}
              <span className="room-view__folded-hint">Show</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function readLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('mimyne.roomLayout'));
    if (saved && (saved.canvas || saved.chat)) return { canvas: !!saved.canvas, chat: !!saved.chat };
  } catch {
    // Nothing saved.
  }
  return { canvas: true, chat: true };
}

function readChatHeight() {
  try {
    const h = Number(localStorage.getItem('mimyne.chatHeight'));
    if (h >= 140 && h <= 1200) return h;
  } catch {
    // Nothing saved.
  }
  return 280;
}

/** Keeps you on the Hub's "here" list while you're in its Rooms (unless you're invisible). */
function useHere(hubId, user, roomId, writing) {
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
    const beat = () => document.visibilityState === 'visible' && stampHere(hubId, user.uid, roomId ?? undefined, writing);
    beat();
    const timer = setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [hubId, user?.uid, mode, roomId, writing]);
  // Leaving the Hub takes you off the list at once.
  useEffect(() => () => user && leaveHere(hubId, user.uid), [hubId, user?.uid]);
  return here;
}

// ------------------------------------------------------------ settings

function RoomDialog({ hub, room, rooms, roles, user, onClose, onMade, onDeleted }) {
  const [name, setName] = useState(room?.name ?? '');
  const [tag, setTag] = useState(room?.tag ?? '');
  const [topic, setTopic] = useState(room?.topic ?? '');
  const [kind, setKind] = useState(room?.kind ?? 'chat');
  const [acc, setAcc] = useState(room?.access ?? { view: 'everyone', add: 'everyone', edit: 'pledged' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // What's inside: a canvas made here, or a workspace from the app.
  const [inside, setInside] = useState(room?.workspace ? 'app' : 'canvas');
  const [workspaces, setWorkspaces] = useState(null);
  const [workspace, setWorkspace] = useState(room?.workspace ?? '');
  useEffect(() => {
    if (inside !== 'app' || workspaces || !user) return;
    myAppWorkspaces(user.uid).then(setWorkspaces).catch(() => setWorkspaces([]));
  }, [inside, workspaces, user]);
  const picked = workspaces?.find((w) => w.id === workspace);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const options = (what) => [
    { id: 'everyone', label: what === 'view' ? (hub.visibility === 'public' ? 'Anyone' : 'Everyone in the Hub') : 'Anyone who can post here' },
    { id: 'pledged', label: 'Pledged people' },
    { id: 'mods', label: cap(whoLabel('mods', roles)) },
    { id: 'owner', label: `Only ${whoLabel('owner', roles)}` },
  ];

  async function save(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Give the Room a name.');
    if (inside === 'app' && !workspace) return setError('Pick one of your workspaces from the app.');
    setBusy(true);
    setError(null);
    try {
      const fields = { name, tag: tag || name, topic, kind, access: acc, workspace: inside === 'app' ? workspace : null };
      // A workspace already shown in another Room moves: that Room lets go of it.
      const was = inside === 'app' ? picked?.hubRoom : null;
      if (was && !(was.hub === hub.id && was.room === room?.id)) await clearRoomWorkspace(was.hub, was.room).catch(() => {});
      if (room) {
        // Taking a workspace out, or putting another in: each side says so.
        if (room.workspace && room.workspace !== fields.workspace) await linkWorkspace(room.workspace, null).catch(() => {});
        if (fields.workspace && fields.workspace !== room.workspace) await linkWorkspace(fields.workspace, hub.id, room.id);
        await updateRoom(hub.id, room, fields);
      } else {
        const id = roomIdFor(tag || name);
        // The workspace points here first, so the Room can show it the moment it exists.
        if (fields.workspace) await linkWorkspace(fields.workspace, hub.id, id);
        onMade(await createRoom(hub.id, { ...fields, id, order: Math.min(99, rooms.length) }, user.uid));
      }
      onClose();
    } catch (err) {
      setError(err.message?.startsWith('Give') ? err.message : "That didn't save. Only the owner and mods set up Rooms, and only a workspace's owner can show it in one.");
      setBusy(false);
    }
  }

  async function move(by) {
    const list = [...rooms];
    const i = list.findIndex((r) => r.id === room.id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await Promise.all(list.map((r, order) => (r.order === order ? null : updateRoom(hub.id, r, { order })))).catch(() => setError("The Rooms couldn't be reordered."));
  }

  async function remove() {
    if (!window.confirm(`Delete ${room.name}? Its canvas and chat go with it.`)) return;
    setBusy(true);
    try {
      await deleteRoom(hub.id, room.id);
      onDeleted();
      onClose();
    } catch {
      setError("The Room couldn't be deleted.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={room ? `${room.name} settings` : 'New Room'} onClose={onClose} width={520}>
      <form className="room-form" onSubmit={save}>
        <div className="room-form__row">
          <label className="field room-form__grow">
            Name
            <input className="field__input" value={name} maxLength={60} placeholder="Level design" onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field room-form__tag">
            Tag
            <span className="room-form__name">
              <Icon name="hash" size={14} />
              <input className="field__input" value={tag} maxLength={32} placeholder={roomName(name) || 'maps'} onChange={(e) => setTag(e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, ''))} />
            </span>
          </label>
        </div>
        <div className="room-form__kinds" role="radiogroup" aria-label="What's inside">
          {[
            { id: 'canvas', icon: 'layout', title: 'A canvas', note: 'Notes, files, lists and arrows, made here together' },
            { id: 'app', icon: 'eye', title: 'A workspace from the app', note: 'One of yours, shown here view only, as you change it in the app' },
          ].map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={inside === k.id} className={`room-form__kind ${inside === k.id ? 'is-on' : ''}`} onClick={() => setInside(k.id)}>
              <Icon name={k.icon} size={18} />
              <span>
                <strong>{k.title}</strong>
                <span className="muted">{k.note}</span>
              </span>
            </button>
          ))}
        </div>
        {inside === 'app' && (
          <label className="field">
            Workspace
            {workspaces === null ? (
              <span className="muted room-form__hint">Finding your workspaces…</span>
            ) : workspaces.length === 0 ? (
              <span className="muted room-form__hint">You don't have workspaces synced from the app yet. Sign in to the app with this account first.</span>
            ) : (
              <select className="field__input" value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
                <option value="">Pick one</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.hubRoom && w.id !== room?.workspace ? ' (in another Room; moves here)' : ''}
                  </option>
                ))}
              </select>
            )}
            {picked && !picked.sharing && (
              <span className="room-form__hint room-form__warn">Sharing is off for it in the app, so nothing shows yet. Turn it on from the workspace's Share menu.</span>
            )}
          </label>
        )}
        <label className="field">
          What it's for
          <input className="field__input" value={topic} maxLength={200} placeholder="Maps, blockouts and playtest notes" onChange={(e) => setTopic(e.target.value)} />
        </label>
        <fieldset className="room-form__access">
          <legend>Who can</legend>
          {[
            { key: 'view', label: 'See inside' },
            { key: 'add', label: 'Add notes and files' },
            { key: 'edit', label: 'Edit and move everything' },
          ].map((row) => (
            <label key={row.key} className="room-form__access-row">
              <span>{row.label}</span>
              <select value={acc[row.key]} onChange={(e) => setAcc((a) => ({ ...a, [row.key]: e.target.value }))}>
                {options(row.key).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          ))}
          <p className="muted room-form__hint">People who add notes can always change and remove their own.</p>
        </fieldset>
        <label className="room-form__check">
          <input type="checkbox" checked={kind === 'announce'} onChange={(e) => setKind(e.target.checked ? 'announce' : 'chat')} />
          <span>Only {whoLabel('mods', roles)} post in its chat</span>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="room-form__actions">
          {room && (
            <>
              <Button variant="ghost" size="sm" onClick={() => move(-1)} aria-label="Move earlier">↑</Button>
              <Button variant="ghost" size="sm" onClick={() => move(1)} aria-label="Move later">↓</Button>
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
