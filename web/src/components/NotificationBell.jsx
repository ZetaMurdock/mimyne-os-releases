import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from './Avatar.jsx';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import { describeNotice, markAllRead, markRead, noticeLink, watchInbox } from '../data/notifications.js';
import { loadProfile, usePerson } from '../data/people.js';
import { timeAgo } from '../lib/format.js';
import './NotificationBell.css';

const canNotify = () => typeof Notification !== 'undefined';

/**
 * The bell: the same inbox as the app's, live. New notices also pop up on
 * the computer (the browser's own notifications, once allowed), as the app
 * does in Windows; only ones that arrive while the page is open, never the
 * backlog.
 */
export default function NotificationBell({ me }) {
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  const [permission, setPermission] = useState(() => (canNotify() ? Notification.permission : 'unsupported'));
  const shown = useRef(null);
  const unread = notices.filter((n) => !n.read).length;

  useEffect(() => {
    shown.current = null;
    return watchInbox(me.uid, (list) => {
      setNotices(list);
      // The first answer is the backlog: remember it, pop up nothing.
      if (!shown.current) {
        shown.current = new Set(list.map((n) => `${n.id}@${n.at}`));
        return;
      }
      for (const n of list) {
        const key = `${n.id}@${n.at}`;
        if (n.read || shown.current.has(key)) continue;
        shown.current.add(key);
        popUp(n, (link) => {
          markRead(me.uid, n.id).catch(() => {});
          navigate(link);
        });
      }
    });
  }, [me.uid, navigate]);

  function open(n) {
    if (!n.read) markRead(me.uid, n.id).catch(() => {});
    navigate(noticeLink(n));
  }

  async function allow() {
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(Notification.permission);
    }
  }

  return (
    <Menu
      label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      trigger={({ toggle, ...aria }) => (
        <button type="button" className="notch__icon bell" onClick={toggle} {...aria}>
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="bell__badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
      )}
    >
      <div className="bell__panel">
        <div className="bell__head">
          <strong>Notifications</strong>
          {unread > 0 && (
            <button type="button" className="link-button bell__all" onClick={() => markAllRead(me.uid, notices).catch(() => {})}>
              Mark all read
            </button>
          )}
        </div>
        {permission === 'default' && (
          <button type="button" className="bell__allow" onClick={allow}>
            <Icon name="bell" size={14} /> Get notifications on this computer
          </button>
        )}
        {notices.length === 0 ? (
          <p className="menu__note">You're all caught up.</p>
        ) : (
          <div className="bell__list">
            {notices.map((n) => (
              <Row key={n.id} notice={n} onOpen={() => open(n)} />
            ))}
          </div>
        )}
      </div>
    </Menu>
  );
}

function Row({ notice, onOpen }) {
  const person = usePerson(notice.fromUid);
  return (
    <button type="button" className={`bell__row ${notice.read ? '' : 'is-unread'}`} onClick={onOpen}>
      <Avatar person={person} size={32} />
      <span className="bell__text">
        <span>
          <strong>{person.name}</strong> {describeNotice(notice)}
        </span>
        <span className="bell__time">{timeAgo(notice.at ?? Date.now())}</span>
      </span>
      {!notice.read && <span className="bell__dot" aria-label="Unread" />}
    </button>
  );
}

async function popUp(notice, onClick) {
  if (!canNotify() || Notification.permission !== 'granted') return;
  const person = await loadProfile(notice.fromUid).catch(() => null);
  const name = person?.displayName || person?.username || 'Someone';
  try {
    const shown = new Notification(`${name} ${describeNotice(notice)}`.slice(0, 120), {
      tag: notice.id,
      icon: person?.picture?.startsWith('https://') ? person.picture : '/favicon-192.png',
    });
    shown.onclick = () => {
      window.focus();
      onClick(noticeLink(notice));
      shown.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker: the bell still has it.
  }
}
