import { useEffect, useState } from 'react';
import { Avatar, HubIcon } from './Avatar.jsx';
import Button from './Button.jsx';
import Dialog from './Dialog.jsx';
import Icon from './Icon.jsx';
import { getHubCard, openDirect, sendMessage, watchConversations } from '../data/api.js';
import { lookupUsername } from '../data/identity.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import './ShareDialog.css';

/**
 * Passing something on: copy its link, or send it into one of your
 * conversations (or to anyone by username). `payload` is what the message
 * carries: a shared post ({post}), a profile ({profileUid}), or words and
 * files for a forwarded message.
 */
export default function ShareDialog({ title = 'Share', link, payload, onClose }) {
  const { user } = useSession();
  const [copied, setCopied] = useState(false);
  const [conversations, setConversations] = useState(null);
  const [sent, setSent] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const url = link ? new URL(link, location.origin).href : null;

  useEffect(() => (user && payload ? watchConversations(user.uid, (list) => setConversations(list.filter((c) => !c.pending))) : undefined), [user?.uid, payload]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function sendTo(convoId) {
    setBusy(convoId);
    setError(null);
    try {
      await sendMessage(convoId, user.uid, payload);
      setSent((prev) => new Set(prev).add(convoId));
    } catch (err) {
      setError(err.code === 'permission-denied' ? "That conversation won't take it." : err.message);
    } finally {
      setBusy(null);
    }
  }

  async function sendToName(event) {
    event.preventDefault();
    setError(null);
    try {
      const uid = await lookupUsername(name.replace(/^@/, ''));
      if (!uid) throw new Error('Nobody has that username.');
      await sendTo(await openDirect(user.uid, uid));
      setName('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      {url && (
        <div className="share__link">
          <input className="field__input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
          <Button variant="secondary" icon={copied ? 'check' : 'link'} onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}

      {user && payload && (
        <>
          <p className="label share__heading">Send in a message</p>
          <form className="share__name" onSubmit={sendToName}>
            <input className="field__input" placeholder="@username" aria-label="Their username" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Send
            </Button>
          </form>
          <div className="share__list">
            {conversations?.length === 0 && <p className="muted share__none">No conversations yet.</p>}
            {conversations?.slice(0, 20).map((c) => (
              <ConvoRow key={c.id} convo={c} sent={sent.has(c.id)} busy={busy === c.id} onSend={() => sendTo(c.id)} />
            ))}
          </div>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Dialog>
  );
}

function ConvoRow({ convo, sent, busy, onSend }) {
  const person = usePerson(convo.other);
  const [hub, setHub] = useState(null);
  useEffect(() => {
    if (convo.hubId) getHubCard(convo.hubId).then(setHub).catch(() => {});
  }, [convo.hubId]);
  const title = convo.kind === 'direct' ? person.name : convo.title || hub?.name || 'Group';
  return (
    <div className="share__row">
      {convo.kind === 'direct' ? <Avatar person={person} size={32} /> : <HubIcon hub={hub ?? { name: title, color: '#3F3F46' }} size={32} />}
      <span className="share__row-name">{title}</span>
      <Button size="sm" variant={sent ? 'secondary' : 'primary'} disabled={sent} loading={busy} onClick={onSend}>
        {sent ? (
          <>
            <Icon name="check" size={14} /> Sent
          </>
        ) : (
          'Send'
        )}
      </Button>
    </div>
  );
}
