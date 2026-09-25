import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Avatar, HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Dialog from '../components/Dialog.jsx';
import { FileCard, PendingFile } from '../components/FileCard.jsx';
import { getHubCard, openDirect, sendMessage, watchConversations, watchMessages } from '../data/api.js';
import { lookupUsername } from '../data/identity.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import { uploadFile } from '../lib/files.js';
import { formatBytes, timeAgo } from '../lib/format.js';
import NeedsAccount from './NeedsAccount.jsx';
import './Messages.css';

export default function Messages() {
  const { user, status } = useSession();
  if (status === 'loading') return null;
  return user ? <Inbox me={user} /> : <NeedsAccount what="your messages" />;
}

// When each conversation was last opened on this device, for the unread dot.
const SEEN_KEY = 'mimyne.seen';
function seenMap() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) ?? {};
  } catch {
    return {};
  }
}
function markSeen(id) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seenMap(), [id]: Date.now() }));
  } catch {
    // Storage blocked: the dot just stays.
  }
}

function Inbox({ me }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const active = conversations?.find((c) => c.id === id) ?? (id ? null : conversations?.[0]);

  useEffect(() => watchConversations(me.uid, setConversations, () => setError("Messages couldn't load.")), [me.uid]);
  useEffect(() => {
    if (active) markSeen(active.id);
  }, [active?.id, active?.at]);

  return (
    <div className="inbox">
      <nav className="inbox__list" aria-label="Conversations">
        <div className="inbox__heading">
          <h1>Messages</h1>
          <Button variant="ghost" icon="pen" iconOnly aria-label="New message" onClick={() => setStarting(true)} />
        </div>
        {error && <p className="form-error">{error}</p>}
        {conversations?.length === 0 && <p className="muted inbox__none">No conversations yet. Start one with the pen above.</p>}
        {conversations?.map((c) => (
          <Row key={c.id} convo={c} me={me} active={c === active} unread={c.lastFrom && c.lastFrom !== me.uid && c.at > (seenMap()[c.id] ?? 0) && c !== active} />
        ))}
      </nav>

      {active ? <Conversation key={active.id} convo={active} me={me} /> : <div className="inbox__blank muted">{conversations ? 'Pick a conversation.' : ''}</div>}

      {starting && (
        <NewMessage
          me={me}
          onClose={() => setStarting(false)}
          onOpen={(convoId) => {
            setStarting(false);
            navigate(`/messages/${convoId}`);
          }}
        />
      )}
    </div>
  );
}

/** What a conversation is called, and its picture. */
function useTitle(convo) {
  const person = usePerson(convo.other);
  const [hub, setHub] = useState(null);
  useEffect(() => {
    if (convo.hubId) getHubCard(convo.hubId).then(setHub);
  }, [convo.hubId]);
  if (convo.kind === 'direct') return { title: person.name, icon: (size) => <Avatar person={person} size={size} />, person };
  if (hub) return { title: convo.title || hub.name, icon: (size) => <HubIcon hub={hub} size={size} /> };
  return { title: convo.title || 'Group', icon: (size) => <HubIcon hub={{ name: convo.title || 'G', color: '#3F3F46' }} size={size} /> };
}

function Row({ convo, me, active, unread }) {
  const { title, icon } = useTitle(convo);
  const preview = convo.lastText ? `${convo.lastFrom === me.uid ? 'You: ' : ''}${convo.lastText}` : 'New conversation';
  return (
    <NavLink to={`/messages/${convo.id}`} className={`inbox__row ${active ? 'is-active' : ''}`} preventScrollReset>
      {icon(40)}
      <span className="inbox__row-text">
        <span className="inbox__row-top">
          <span className="inbox__row-title">{title}</span>
          <span className="inbox__row-time">{timeAgo(convo.at)}</span>
        </span>
        <span className={`inbox__row-preview ${unread ? 'is-unread' : ''}`}>{preview}</span>
      </span>
      {unread && <span className="inbox__unread" aria-label="Unread" />}
    </NavLink>
  );
}

function Conversation({ convo, me }) {
  const { title, icon, person } = useTitle(convo);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);
  const end = useRef(null);

  useEffect(() => watchMessages(convo.id, setMessages, () => setError("Messages couldn't load.")), [convo.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function submit(event) {
    event.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    setError(null);
    try {
      const labels = [];
      for (const { id, file } of files) labels.push(await uploadFile(file, (p) => setProgress((prev) => ({ ...prev, [id]: p }))));
      await sendMessage(convo.id, me.uid, { text, files: labels });
      setText('');
      setFiles([]);
    } catch (err) {
      setError(err.code === 'permission-denied' ? "This message couldn't be sent." : err.message);
    } finally {
      setSending(false);
      setProgress({});
    }
  }

  const sharedFiles = messages.flatMap((m) => m.files);

  return (
    <>
      <section className="inbox__thread" aria-label={`Conversation with ${title}`}>
        <header className="inbox__head">
          {icon(36)}
          <span className="inbox__head-text">
            <span className="inbox__head-title">{title}</span>
            {person && <span className="inbox__head-sub">@{person.username}</span>}
          </span>
        </header>

        <div className="inbox__messages">
          {messages.length === 0 && <p className="muted inbox__none">Say hi.</p>}
          {messages.map((m) => (
            <Message key={m.id} message={m} mine={m.from === me.uid} group={convo.kind !== 'direct'} />
          ))}
          <div ref={end} />
        </div>

        <form className="inbox__composer" onSubmit={submit}>
          {files.length > 0 && (
            <div className="inbox__pending">
              {files.map(({ id, file }) => (
                <PendingFile key={id} file={file} progress={progress[id]} onRemove={() => setFiles((list) => list.filter((f) => f.id !== id))} />
              ))}
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="inbox__field">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const picked = [...e.target.files].map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file }));
                setFiles((list) => [...list, ...picked].slice(0, 10));
                e.target.value = '';
              }}
            />
            <Button variant="ghost" icon="paperclip" iconOnly aria-label="Attach a file" onClick={() => fileInput.current.click()} />
            <input
              className="inbox__input"
              aria-label={`Message ${title}`}
              placeholder={`Message ${title}. Any file, any size.`}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="primary" icon="send" iconOnly aria-label="Send" loading={sending} />
          </div>
        </form>
      </section>

      <aside className="inbox__side">
        <div className="inbox__who">
          {icon(72)}
          <strong>{title}</strong>
        </div>
        <section className="inbox__side-block">
          <h2 className="label">Files in this chat</h2>
          {sharedFiles.length === 0 && <p className="muted">None yet.</p>}
          {sharedFiles.map((f) => (
            <div key={f.path} className="inbox__file">
              <span>{f.name}</span>
              <span className="muted">{formatBytes(f.size)}</span>
            </div>
          ))}
        </section>
      </aside>
    </>
  );
}

function Message({ message, mine, group }) {
  const author = usePerson(group && !mine ? message.from : null);
  return (
    <div className={`msg ${mine ? 'is-mine' : ''}`}>
      {group && !mine && <span className="msg__author">{author.name}</span>}
      {message.text && <p className="msg__bubble">{message.text}</p>}
      {message.files.map((f) => (
        <div key={f.path} className="msg__file">
          <FileCard file={f} compact />
        </div>
      ))}
    </div>
  );
}

function NewMessage({ me, onClose, onOpen }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const uid = await lookupUsername(name.replace(/^@/, ''));
      if (!uid) throw new Error('Nobody has that username.');
      onOpen(await openDirect(me.uid, uid));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title="New message" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          Their username
          <input className="field__input" required placeholder="@username" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!name.trim()}>
          Open conversation
        </Button>
      </form>
    </Dialog>
  );
}
