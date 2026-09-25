import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Avatar, HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Dialog from '../components/Dialog.jsx';
import Icon from '../components/Icon.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import { SharedPost, SharedProfile } from '../components/ShareCards.jsx';
import { LinkedText } from '../components/LinkPreview.jsx';
import { FileCard, PendingFile } from '../components/FileCard.jsx';
import {
  deleteMessage, editMessage, getHubCard, openDirect, sendMessage, watchConversations, watchMessages,
} from '../data/api.js';
import { lookupUsername } from '../data/identity.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import { uploadPicked } from '../lib/files.js';
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
  // A conversation counts as started once the server has had it, even while
  // a later change (a new last message) is still on its way.
  const started = useRef(new Set());
  for (const c of conversations ?? []) if (!c.pending) started.current.add(c.id);
  const ready = active && started.current.has(active.id);

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

      {ready ? (
        <Conversation key={active.id} convo={active} me={me} />
      ) : (
        <div className="inbox__blank muted">{active ? 'Starting the conversation…' : conversations ? 'Pick a conversation.' : ''}</div>
      )}

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
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const fileInput = useRef(null);
  const input = useRef(null);
  const end = useRef(null);

  useEffect(() => watchMessages(convo.id, setMessages, () => setError("Messages couldn't load.")), [convo.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function addFiles(list) {
    const picked = [...list].map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file }));
    setFiles((prev) => [...prev, ...picked].slice(0, 10));
  }

  async function submit(event) {
    event.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    setError(null);
    try {
      const labels = [];
      for (const picked of files) labels.push(await uploadPicked(picked, (p) => setProgress((prev) => ({ ...prev, [picked.id]: p }))));
      await sendMessage(convo.id, me.uid, {
        text,
        files: labels,
        replyTo: replyTo ? { id: replyTo.id, from: replyTo.from, text: replyTo.text || describeAttachment(replyTo) } : null,
      });
      setText('');
      setFiles([]);
      setReplyTo(null);
    } catch (err) {
      setError(err.code === 'permission-denied' ? "This message couldn't be sent." : err.message);
    } finally {
      setSending(false);
      setProgress({});
    }
  }

  async function saveEdit(message, words) {
    setEditing(null);
    if (!words.trim() || words.trim() === message.text) return;
    try {
      await editMessage(convo.id, message.id, words);
    } catch {
      setError("That edit didn't save.");
    }
  }

  async function remove(message) {
    if (!window.confirm('Delete this message for everyone?')) return;
    try {
      await deleteMessage(convo.id, message.id);
    } catch {
      setError("That message couldn't be deleted.");
    }
  }

  const sharedFiles = messages.flatMap((m) => m.files);
  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <>
      <section className="inbox__thread" aria-label={`Conversation with ${title}`}>
        <header className="inbox__head">
          {person ? <Link to={`/people/${person.uid}`}>{icon(36)}</Link> : icon(36)}
          <span className="inbox__head-text">
            <span className="inbox__head-title">{title}</span>
            {person && <Link to={`/people/${person.uid}`} className="inbox__head-sub">@{person.username}</Link>}
          </span>
        </header>

        <div className="inbox__messages">
          {messages.length === 0 && <p className="muted inbox__none">Say hi.</p>}
          {messages.map((m) => (
            <Message
              key={m.id}
              message={m}
              meUid={me.uid}
              mine={m.from === me.uid}
              group={convo.kind !== 'direct'}
              answered={m.replyTo ? byId.get(m.replyTo.id) : null}
              editing={editing === m.id}
              onReply={() => {
                setReplyTo(m);
                input.current?.focus();
              }}
              onEdit={() => setEditing(m.id)}
              onSaveEdit={(words) => saveEdit(m, words)}
              onCancelEdit={() => setEditing(null)}
              onDelete={() => remove(m)}
              onForward={() => setForwarding(m)}
            />
          ))}
          <div ref={end} />
        </div>

        <form className="inbox__composer" onSubmit={submit}>
          {replyTo && <ReplyBar message={replyTo} mine={replyTo.from === me.uid} onCancel={() => setReplyTo(null)} />}
          {files.length > 0 && (
            <div className="inbox__pending">
              {files.map(({ id, file, display = true }) => (
                <PendingFile
                key={id}
                file={file}
                progress={progress[id]}
                display={display}
                onDisplay={(show) => setFiles((list) => list.map((f) => (f.id === id ? { ...f, display: show } : f)))}
                onRemove={() => setFiles((list) => list.filter((f) => f.id !== id))}
              />
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
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" icon="paperclip" iconOnly aria-label="Attach a file" onClick={() => fileInput.current.click()} />
            <input
              ref={input}
              className="inbox__input"
              aria-label={`Message ${title}`}
              placeholder={`Message ${title}. Any file, any size.`}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && replyTo && setReplyTo(null)}
              // Pictures and GIFs pasted straight in go along as files.
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  addFiles(e.clipboardData.files);
                }
              }}
            />
            <Button type="submit" variant="primary" icon="send" iconOnly aria-label="Send" loading={sending} />
          </div>
        </form>
      </section>

      <aside className="inbox__side">
        <div className="inbox__who">
          {icon(72)}
          <strong>{title}</strong>
          {person && (
            <Button size="sm" variant="secondary" to={`/people/${person.uid}`}>
              View profile
            </Button>
          )}
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

      {forwarding && (
        <ShareDialog
          title="Forward"
          payload={{
            text: forwarding.text,
            // Only your own uploads can go along: the rules keep each file
            // in the folder of whoever attached it.
            files: forwarding.files.filter((f) => f.path.startsWith(`uploads/${me.uid}/`)),
            post: forwarding.post ?? undefined,
            profileUid: forwarding.profileUid ?? undefined,
          }}
          onClose={() => setForwarding(null)}
        />
      )}
    </>
  );
}

const describeAttachment = (m) =>
  m.files?.length ? `📎 ${m.files[0].name}` : m.post ? 'A shared post' : m.profileUid ? 'A shared profile' : '';

function ReplyBar({ message, mine, onCancel }) {
  const author = usePerson(mine ? null : message.from);
  return (
    <div className="reply-bar">
      <Icon name="reply" size={14} />
      <span className="reply-bar__text">
        Replying to <strong>{mine ? 'yourself' : author.name}</strong>: {message.text || describeAttachment(message)}
      </span>
      <button type="button" className="reply-bar__close" aria-label="Cancel reply" onClick={onCancel}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function Message({ message, meUid, mine, group, answered, editing, onReply, onEdit, onSaveEdit, onCancelEdit, onDelete, onForward }) {
  const author = usePerson(group && !mine ? message.from : null);
  const quoted = usePerson(message.replyTo && message.replyTo.from !== meUid ? message.replyTo.from : null);
  const [draft, setDraft] = useState(message.text);

  return (
    <div className={`msg ${mine ? 'is-mine' : ''}`} id={`m-${message.id}`}>
      {group && !mine && <span className="msg__author">{author.name}</span>}
      {message.replyTo && (
        <button
          type="button"
          className="msg__quote"
          onClick={() => document.getElementById(`m-${message.replyTo.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
        >
          <Icon name="reply" size={12} />
          <span>
            {message.replyTo.from === meUid ? 'You' : quoted.name}:{' '}
            {answered ? answered.text || describeAttachment(answered) : message.replyTo.text || 'a deleted message'}
          </span>
        </button>
      )}
      {editing ? (
        <form
          className="msg__edit"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveEdit(draft);
          }}
        >
          <input
            className="inbox__input msg__edit-input"
            autoFocus
            maxLength={4000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancelEdit()}
            aria-label="Edit message"
          />
          <span className="msg__edit-hint">Enter to save · Esc to cancel</span>
        </form>
      ) : (
        message.text && (
          <LinkedText
            text={message.text}
            className="msg__bubble"
            after={message.edited && <span className="msg__edited"> (edited)</span>}
          />
        )
      )}
      {message.files.map((f) => (
        <div key={f.path} className="msg__file">
          <FileCard file={f} compact />
        </div>
      ))}
      {message.post && <SharedPost post={message.post} />}
      {message.profileUid && <SharedProfile uid={message.profileUid} />}
      {!editing && (
        <div className="msg__tools" role="group" aria-label="Message actions">
          <button type="button" aria-label="Reply" title="Reply" onClick={onReply}>
            <Icon name="reply" size={14} />
          </button>
          <button type="button" aria-label="Forward" title="Forward" onClick={onForward}>
            <Icon name="forward" size={14} />
          </button>
          {message.text && (
            <button type="button" aria-label="Copy text" title="Copy text" onClick={() => navigator.clipboard?.writeText(message.text).catch(() => {})}>
              <Icon name="copy" size={14} />
            </button>
          )}
          {mine && message.text && (
            <button type="button" aria-label="Edit" title="Edit" onClick={onEdit}>
              <Icon name="pen" size={14} />
            </button>
          )}
          {mine && (
            <button type="button" aria-label="Delete" title="Delete" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
      )}
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
