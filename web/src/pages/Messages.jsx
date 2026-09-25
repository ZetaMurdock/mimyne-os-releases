import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLoaderData, useParams } from 'react-router-dom';
import { Avatar, HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import { FileCard, PendingFile } from '../components/FileCard.jsx';
import { getConversations, getHubSync, getPostSync, getRoom, getUser, sendMessage } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import { fileKind, formatBytes, timeAgo } from '../lib/format.js';
import NeedsAccount from './NeedsAccount.jsx';
import './Messages.css';

export function messagesLoader() {
  return getConversations();
}

export default function Messages() {
  const { user } = useSession();
  return user ? <Inbox /> : <NeedsAccount what="your messages" />;
}

function describe(convo) {
  if (convo.kind === 'group') {
    const hub = getHubSync(convo.hub);
    return { title: convo.title, icon: <HubIcon hub={hub} size={40} /> };
  }
  const person = getUser(convo.with);
  return { title: person.name, icon: <Avatar user={person} size={40} />, person };
}

function preview(message, me) {
  const who = message.from === me ? 'You: ' : '';
  if (message.text) return who + message.text;
  if (message.files) return `${who}Sent ${message.files.length === 1 ? message.files[0].name : `${message.files.length} files`}`;
  if (message.post) return `${who}Shared a post`;
  if (message.invite) return `${who}Invited you to ${getRoom(message.invite.room)?.name}`;
  return '';
}

function Inbox() {
  const loaded = useLoaderData();
  const { id } = useParams();
  const { user } = useSession();
  const [conversations, setConversations] = useState(loaded);
  const active = conversations.find((c) => c.id === id) ?? conversations[0];

  useEffect(() => {
    // Opening a conversation reads it.
    if (active?.unread) active.unread = false;
  }, [active]);

  async function send(draft) {
    await sendMessage(active.id, { from: user.id, ...draft });
    setConversations((list) => [...list].sort((a, b) => b.at - a.at));
  }

  return (
    <div className="inbox">
      <nav className="inbox__list" aria-label="Conversations">
        <h1 className="inbox__heading">Messages</h1>
        {conversations.map((c) => {
          const { title, icon } = describe(c);
          const last = c.messages[c.messages.length - 1];
          return (
            <NavLink
              key={c.id}
              to={`/messages/${c.id}`}
              className={({ isActive }) => `inbox__row ${isActive || (!id && c === active) ? 'is-active' : ''}`}
              preventScrollReset
            >
              {icon}
              <span className="inbox__row-text">
                <span className="inbox__row-top">
                  <span className="inbox__row-title">{title}</span>
                  <span className="inbox__row-time">{timeAgo(c.at)}</span>
                </span>
                <span className={`inbox__row-preview ${c.unread ? 'is-unread' : ''}`}>{preview(last, user.id)}</span>
              </span>
              {c.unread && <span className="inbox__unread" aria-label="Unread" />}
            </NavLink>
          );
        })}
      </nav>

      {active && <Conversation key={active.id} convo={active} onSend={send} />}
    </div>
  );
}

function Conversation({ convo, onSend }) {
  const { user } = useSession();
  const { title, icon, person } = describe(convo);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef(null);
  const end = useRef(null);
  const count = convo.messages.length;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  async function submit(event) {
    event.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    await onSend({ text: text.trim(), files: files.length ? files : undefined });
    setText('');
    setFiles([]);
    setSending(false);
  }

  const sharedFiles = convo.messages.flatMap((m) => m.files ?? []);

  return (
    <>
      <section className="inbox__thread" aria-label={`Conversation with ${title}`}>
        <header className="inbox__head">
          {icon}
          <span className="inbox__head-text">
            <span className="inbox__head-title">{title}</span>
            {person?.activity && <span className="inbox__head-status">● {person.activity}</span>}
          </span>
        </header>

        <div className="inbox__messages">
          {convo.messages.map((m) => (
            <Message key={m.id} message={m} mine={m.from === user.id} group={convo.kind === 'group'} />
          ))}
          <div ref={end} />
        </div>

        <form className="inbox__composer" onSubmit={submit}>
          {files.length > 0 && (
            <div className="inbox__pending">
              {files.map((f) => (
                <PendingFile key={f.name} file={f} onRemove={() => setFiles((list) => list.filter((x) => x !== f))} />
              ))}
            </div>
          )}
          <div className="inbox__field">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const picked = [...e.target.files].map((f) => ({ name: f.name, size: f.size, kind: fileKind(f) }));
                setFiles((list) => [...list, ...picked]);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" icon="paperclip" iconOnly aria-label="Attach a file" onClick={() => fileInput.current.click()} />
            <input
              className="inbox__input"
              aria-label={`Message ${title}`}
              placeholder={`Message ${title}. Any file, any size.`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit" variant="primary" icon="send" iconOnly aria-label="Send" loading={sending} />
          </div>
        </form>
      </section>

      <aside className="inbox__side">
        <div className="inbox__who">
          {icon}
          <strong>{title}</strong>
        </div>
        <section className="inbox__side-block">
          <h2 className="label">Files in this chat</h2>
          {sharedFiles.length === 0 && <p className="muted">None yet.</p>}
          {sharedFiles.map((f, i) => (
            <div key={`${f.name}-${i}`} className="inbox__file">
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
  const author = getUser(message.from);
  const side = mine ? 'is-mine' : '';

  if (message.invite) {
    const room = getRoom(message.invite.room);
    const hub = getHubSync(message.invite.hub);
    return (
      <div className={`msg msg--card ${side}`}>
        <div className="msg__invite">
          <span className="msg__invite-front" style={{ background: room.front }} />
          <span className="msg__invite-text">
            <strong>
              {author.name} invited you to {message.invite.access === 'edit' ? 'edit' : 'join'} {room.name}
            </strong>
            <span className="muted">A room in {hub.name}</span>
          </span>
        </div>
        <div className="msg__invite-actions">
          <Button variant="inverse">Open in Mimyne</Button>
          <Button>Later</Button>
        </div>
      </div>
    );
  }

  if (message.post) {
    const post = getPostSync(message.post);
    return (
      <Link to={`/p/${post.id}`} className={`msg msg--card msg__post ${side}`}>
        <span className="msg__post-thumb" />
        <span className="msg__post-text">
          <span className="muted">{getUser(post.author).name} · post</span>
          <strong>{post.title ?? post.body}</strong>
        </span>
      </Link>
    );
  }

  return (
    <div className={`msg ${side}`}>
      {group && !mine && <span className="msg__author">{author.name}</span>}
      {message.text && <p className="msg__bubble">{message.text}</p>}
      {message.files?.map((f) => (
        <div key={f.name} className="msg__file">
          <FileCard file={f} compact />
        </div>
      ))}
    </div>
  );
}
