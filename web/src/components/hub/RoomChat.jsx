import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../Avatar.jsx';
import Button from '../Button.jsx';
import Icon from '../Icon.jsx';
import MediaPicker from '../MediaPicker.jsx';
import ShareDialog from '../ShareDialog.jsx';
import LinkPreview, { Linkify } from '../LinkPreview.jsx';
import { SharedPost, SharedProfile } from '../ShareCards.jsx';
import { FileCard, PendingFile } from '../FileCard.jsx';
import { deleteRoomMessage, editRoomMessage, sendRoomMessage, watchRoomMessages } from '../../data/rooms.js';
import { usePerson } from '../../data/people.js';
import { uploadPicked } from '../../lib/files.js';
import { insertAt, placeCaret } from '../../lib/insert.js';
import { splitLinks } from '../../lib/links.js';

const PAGE = 150;
// Messages from one person this close together share one header.
const RUN_MS = 7 * 60 * 1000;

const describeAttachment = (m) =>
  m.files?.length ? `📎 ${m.files[0].name}` : m.post ? 'A shared post' : m.profileUid ? 'A shared profile' : '';

const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayLabel(at) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function stamp(at) {
  const day = dayLabel(at);
  return `${day === 'Today' || day === 'Yesterday' ? `${day} at` : new Date(at).toLocaleDateString()} ${clock(at)}`;
}

export default function RoomChat({ hub, room, user, access, members, roleOf, onSignIn }) {
  const [messages, setMessages] = useState(null);
  const [count, setCount] = useState(PAGE);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [mention, setMention] = useState(null); // { query, start, pick }
  const scroller = useRef(null);
  const input = useRef(null);
  const fileInput = useRef(null);
  const stick = useRef(true);

  const myName = user?.username ?? null;

  useEffect(() => {
    setMessages(null);
    return watchRoomMessages(hub.id, room.id, setMessages, () => setError("This Room's messages couldn't load."), count);
  }, [hub.id, room.id, count]);

  // Stay at the newest message unless you've scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    setAtBottom(near);
  }

  function toBottom() {
    stick.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }

  const canTalk = !!user && access.canPost && (room.kind === 'chat' || access.canModerate);
  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const mentionsMe = (m) => !!myName && new RegExp(`(^|\\W)@${myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(m.text);

  function addFiles(list) {
    const picked = [...list].map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file }));
    setFiles((prev) => [...prev, ...picked].slice(0, 10));
  }

  const replyLabel = (m) => (m ? { id: m.id, from: m.from, text: m.text || describeAttachment(m) } : null);

  async function submit(event) {
    event?.preventDefault();
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true);
    setError(null);
    try {
      const labels = [];
      for (const picked of files) labels.push(await uploadPicked(picked, (p) => setProgress((prev) => ({ ...prev, [picked.id]: p }))));
      await sendRoomMessage(hub.id, room.id, user.uid, { text, files: labels, replyTo: replyLabel(replyTo) });
      setText('');
      setFiles([]);
      setReplyTo(null);
      stick.current = true;
    } catch (err) {
      setError(err.code === 'permission-denied' ? "This message couldn't be sent here." : err.message);
    } finally {
      setSending(false);
      setProgress({});
      input.current?.focus();
    }
  }

  async function sendMedia(media) {
    setError(null);
    const item = media.kind === 'library' ? media.item : null;
    try {
      if (item?.kind === 'file') {
        await sendRoomMessage(hub.id, room.id, user.uid, { files: [{ name: item.name, size: item.size, type: item.type, path: item.path }], replyTo: replyLabel(replyTo) });
      } else {
        await sendRoomMessage(hub.id, room.id, user.uid, { text: media.kind === 'gif' ? media.url : item.url, replyTo: replyLabel(replyTo) });
      }
      setReplyTo(null);
      stick.current = true;
    } catch (err) {
      setError(err.code === 'permission-denied' ? "That couldn't be sent here." : err.message);
    }
  }

  function addEmoji(char) {
    const next = insertAt(input.current, text, char);
    setText(next.value);
    placeCaret(input.current, next.caret);
  }

  async function saveEdit(message, words) {
    setEditing(null);
    if (!words.trim() || words.trim() === message.text) return;
    try {
      await editRoomMessage(hub.id, room.id, message.id, words);
    } catch {
      setError("That edit didn't save.");
    }
  }

  async function remove(message, skipAsk) {
    if (!skipAsk && !window.confirm('Delete this message for everyone?')) return;
    try {
      await deleteRoomMessage(hub.id, room.id, message.id);
    } catch {
      setError("That message couldn't be deleted.");
    }
  }

  // @someone: people pledged here whose names start with what's typed.
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.name && m.name.toLowerCase().startsWith(q) && m.uid !== user?.uid).slice(0, 8);
  }, [mention, members, user?.uid]);

  function onType(e) {
    setText(e.target.value);
    const upto = e.target.value.slice(0, e.target.selectionStart);
    const match = upto.match(/(^|\s)@([A-Za-z0-9_.]{0,24})$/);
    setMention(match ? { query: match[2], start: upto.length - match[2].length - 1, pick: 0 } : null);
  }

  function pickMention(member) {
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const value = `${before}@${member.name} ${after.replace(/^\s/, '')}`;
    setText(value);
    setMention(null);
    requestAnimationFrame(() => placeCaret(input.current, before.length + member.name.length + 2));
  }

  function onKeyDown(e) {
    if (mention && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setMention((m) => ({ ...m, pick: (m.pick + step + suggestions.length) % suggestions.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(suggestions[mention.pick] ?? suggestions[0]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && replyTo) {
      setReplyTo(null);
    } else if (e.key === 'ArrowUp' && !text) {
      // As in Discord: up on an empty box edits your last message.
      const last = [...(messages ?? [])].reverse().find((m) => m.from === user?.uid && m.text);
      if (last) {
        e.preventDefault();
        setEditing(last.id);
      }
    }
  }

  // Grouped the way Discord does: a header when the author, the day or a
  // reply breaks the run.
  const rows = [];
  let prev = null;
  for (const m of messages ?? []) {
    const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
    const head = newDay || !prev || prev.from !== m.from || m.at - prev.at > RUN_MS || !!m.replyTo;
    rows.push({ m, newDay, head });
    prev = m;
  }

  return (
    <div
      className={`room ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        if (!canTalk || ![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setDragging(false)}
      onDrop={(e) => {
        if (!canTalk || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <div className="room__scroll" ref={scroller} onScroll={onScroll}>
        {messages?.length === count && (
          <button type="button" className="room__older" onClick={() => { stick.current = false; setCount((c) => c + PAGE); }}>
            Load older messages
          </button>
        )}
        {messages && messages.length < count && (
          <div className="room__start">
            <span className="room__start-icon">
              <Icon name={room.kind === 'announce' ? 'megaphone' : 'hash'} size={34} />
            </span>
            <h3>Welcome to #{room.name}</h3>
            <p className="muted">{room.topic || `This is the start of #${room.name} in ${hub.name}.`}</p>
          </div>
        )}
        {messages === null && <RoomSkeleton />}
        {rows.map(({ m, newDay, head }) => (
          <Fragment key={m.id}>
            {newDay && (
              <div className="room__day" role="separator">
                <span>{dayLabel(m.at)}</span>
              </div>
            )}
            <RoomMessage
              message={m}
              head={head}
              meUid={user?.uid}
              role={roleOf(m.from)}
              fallbackName={members.find((x) => x.uid === m.from)?.name}
              answered={m.replyTo ? byId.get(m.replyTo.id) : null}
              highlight={mentionsMe(m)}
              editing={editing === m.id}
              canModerate={access.canModerate}
              canTalk={canTalk}
              onReply={() => {
                setReplyTo(m);
                input.current?.focus();
              }}
              onEdit={() => setEditing(m.id)}
              onSaveEdit={(words) => saveEdit(m, words)}
              onCancelEdit={() => {
                setEditing(null);
                input.current?.focus();
              }}
              onDelete={(skipAsk) => remove(m, skipAsk)}
              onForward={() => setForwarding(m)}
            />
          </Fragment>
        ))}
      </div>

      {!atBottom && (
        <button type="button" className="room__jump" onClick={toBottom}>
          Jump to the newest <Icon name="arrowDown" size={14} />
        </button>
      )}

      {!user ? (
        <div className="room__locked">
          <Icon name="lock" size={16} />
          <span>Sign in to talk in #{room.name}.</span>
          <Button size="sm" variant="primary" onClick={onSignIn}>Sign in</Button>
        </div>
      ) : !canTalk ? (
        <div className="room__locked">
          <Icon name={room.kind === 'announce' ? 'megaphone' : 'lock'} size={16} />
          <span>
            {room.kind === 'announce' && access.canPost
              ? `Only the owner and mods post in #${room.name}.`
              : 'Only people who pledged can talk here. The Hub’s owner set it that way.'}
          </span>
        </div>
      ) : (
        <form className="room__composer" onSubmit={submit}>
          {mention && suggestions.length > 0 && (
            <ul className="room__mentions" role="listbox" aria-label="People to mention">
              <li className="room__mentions-head">People in {hub.name}</li>
              {suggestions.map((m, i) => (
                <MentionOption key={m.uid} member={m} role={roleOf(m.uid)} active={i === mention.pick} onPick={() => pickMention(m)} />
              ))}
            </ul>
          )}
          {replyTo && (
            <div className="room__replying">
              <span>
                Replying to <strong><Name uid={replyTo.from} fallback={members.find((x) => x.uid === replyTo.from)?.name} /></strong>
              </span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          {files.length > 0 && (
            <div className="room__pending">
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
          <div className="room__field">
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
            <button type="button" className="room__icon-btn" aria-label="Attach files" title="Attach files" onClick={() => fileInput.current.click()}>
              <Icon name="plus" size={18} strokeWidth={2.2} />
            </button>
            <textarea
              ref={input}
              className="room__input"
              rows={1}
              aria-label={`Message #${room.name}`}
              placeholder={`Message #${room.name}`}
              maxLength={4000}
              value={text}
              onChange={onType}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setMention(null), 150)}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  addFiles(e.clipboardData.files);
                }
              }}
              style={{ height: `${Math.min(8, Math.max(1, text.split('\n').length)) * 22 + 20}px` }}
            />
            <MediaPicker onEmoji={addEmoji} onPick={sendMedia} placement="up" align="end" />
            <Button type="submit" variant="primary" icon="send" iconOnly aria-label="Send" loading={sending} disabled={!text.trim() && !files.length} />
          </div>
        </form>
      )}

      {dragging && (
        <div className="room__drop" aria-hidden="true">
          <Icon name="upload" size={32} />
          <strong>Drop to attach to #{room.name}</strong>
        </div>
      )}

      {forwarding && (
        <ShareDialog
          title="Forward"
          payload={{
            text: forwarding.text,
            files: forwarding.files.filter((f) => f.path.startsWith(`uploads/${user?.uid}/`)),
            post: forwarding.post ?? undefined,
            profileUid: forwarding.profileUid ?? undefined,
          }}
          onClose={() => setForwarding(null)}
        />
      )}
    </div>
  );
}

function Name({ uid, fallback }) {
  return usePerson(uid, fallback).name;
}

function MentionOption({ member, role, active, onPick }) {
  const person = usePerson(member.uid, member.name);
  return (
    <li role="option" aria-selected={active} className={`room__mention ${active ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); onPick(); }}>
      <Avatar person={person} size={22} />
      <span style={role?.level !== 'member' && role?.color ? { color: role.color } : undefined}>{person.name}</span>
      <span className="muted">@{member.name}</span>
    </li>
  );
}

/** Words with @mentions picked out and links clickable; link previews under. */
function RoomText({ text, edited }) {
  const { rest, links } = splitLinks(text);
  const pieces = rest ? rest.split(/((?:^|(?<=\s))@[A-Za-z0-9_.]{2,24})/) : [];
  return (
    <>
      {rest && (
        <p className="room-msg__text">
          {pieces.map((piece, i) => (/^@[A-Za-z0-9_.]{2,24}$/.test(piece) ? (
            <a key={i} className="room-msg__mention" href={`/u/${piece.slice(1)}`}>{piece}</a>
          ) : (
            <Linkify key={i} text={piece} />
          )))}
          {edited && <span className="room-msg__edited"> (edited)</span>}
        </p>
      )}
      {links.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </>
  );
}

function RoomMessage({
  message, head, meUid, role, fallbackName, answered, highlight, editing, canModerate, canTalk,
  onReply, onEdit, onSaveEdit, onCancelEdit, onDelete, onForward,
}) {
  const author = usePerson(message.from, fallbackName);
  const mine = message.from === meUid;
  const [draft, setDraft] = useState(message.text);
  const nameColor = role?.level !== 'member' && role?.color ? { color: role.color } : undefined;

  useEffect(() => {
    if (editing) setDraft(message.text);
  }, [editing, message.text]);

  return (
    <div className={`room-msg ${head ? 'is-head' : ''} ${highlight ? 'is-mention' : ''} ${editing ? 'is-editing' : ''}`} id={`m-${message.id}`}>
      {message.replyTo && <ReplyLine reply={message.replyTo} answered={answered} />}
      <div className="room-msg__row">
        <span className="room-msg__gutter">
          {head ? (
            <a href={`/people/${message.from}`} aria-label={author.name}>
              <Avatar person={author} size={40} />
            </a>
          ) : (
            <time className="room-msg__time-hover" dateTime={new Date(message.at).toISOString()} title={stamp(message.at)}>
              {clock(message.at)}
            </time>
          )}
        </span>
        <div className="room-msg__body">
          {head && (
            <div className="room-msg__head">
              <a href={`/people/${message.from}`} className="room-msg__name" style={nameColor}>{author.name}</a>
              {role && role.level !== 'member' && <span className="room-msg__badge" style={{ color: role.color, borderColor: `${role.color}55` }}>{role.name}</span>}
              <time className="room-msg__time" dateTime={new Date(message.at).toISOString()} title={new Date(message.at).toLocaleString()}>
                {stamp(message.at)}
              </time>
            </div>
          )}
          {editing ? (
            <form
              className="room-msg__edit"
              onSubmit={(e) => {
                e.preventDefault();
                onSaveEdit(draft);
              }}
            >
              <textarea
                className="room__input room-msg__edit-input"
                autoFocus
                maxLength={4000}
                value={draft}
                rows={Math.min(8, Math.max(1, draft.split('\n').length))}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onCancelEdit();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSaveEdit(draft);
                  }
                }}
                aria-label="Edit message"
              />
              <span className="room-msg__edit-hint">
                Escape to <button type="button" onClick={onCancelEdit}>cancel</button> · Enter to <button type="submit">save</button>
              </span>
            </form>
          ) : (
            message.text && <RoomText text={message.text} edited={message.edited} />
          )}
          {message.files.length > 0 && (
            <div className="room-msg__files">
              {message.files.map((f) => (
                <FileCard key={f.path} file={f} compact />
              ))}
            </div>
          )}
          {message.post && <SharedPost post={message.post} />}
          {message.profileUid && <SharedProfile uid={message.profileUid} />}
        </div>
      </div>
      {!editing && meUid && (
        <div className="room-msg__tools" role="group" aria-label="Message actions">
          {canTalk && (
            <button type="button" aria-label="Reply" title="Reply" onClick={onReply}>
              <Icon name="reply" size={16} />
            </button>
          )}
          <button type="button" aria-label="Forward" title="Forward" onClick={onForward}>
            <Icon name="forward" size={16} />
          </button>
          {message.text && (
            <button type="button" aria-label="Copy text" title="Copy text" onClick={() => navigator.clipboard?.writeText(message.text).catch(() => {})}>
              <Icon name="copy" size={16} />
            </button>
          )}
          {mine && message.text && (
            <button type="button" aria-label="Edit" title="Edit" onClick={onEdit}>
              <Icon name="pen" size={16} />
            </button>
          )}
          {(mine || canModerate) && (
            <button
              type="button"
              className="is-danger"
              aria-label="Delete"
              title="Delete (Shift-click to skip asking)"
              onClick={(e) => onDelete(e.shiftKey)}
            >
              <Icon name="trash" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReplyLine({ reply, answered }) {
  const who = usePerson(reply.from);
  return (
    <button
      type="button"
      className="room-msg__reply"
      onClick={() => {
        const el = document.getElementById(`m-${reply.id}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el?.classList.add('is-flash');
        setTimeout(() => el?.classList.remove('is-flash'), 1400);
      }}
    >
      <span className="room-msg__reply-curve" aria-hidden="true" />
      <Avatar person={who} size={16} />
      <strong>{who.name}</strong>
      <span className="room-msg__reply-text">{answered ? answered.text || describeAttachment(answered) : reply.text || 'A deleted message'}</span>
    </button>
  );
}

function RoomSkeleton() {
  return (
    <div className="room__skeleton" aria-label="Loading messages">
      {[70, 45, 85, 55].map((w, i) => (
        <div key={i} className="room__skeleton-row">
          <span className="room__skeleton-pic" />
          <span className="room__skeleton-lines">
            <span style={{ width: '22%' }} />
            <span style={{ width: `${w}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}
