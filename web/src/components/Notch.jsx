import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useNavigation } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import Icon from './Icon.jsx';
import Menu, { MenuItem } from './Menu.jsx';
import { findHub, getHubsById, hasUnread } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import './Notch.css';

// Between pages the notch drops, squashes into the Mimyne title and holds
// there while the next page loads, then springs back out, hovers for a
// moment and rises once the new page is in.
const STEP_MS = { drop: 120, squash: 180, spring: 220, hover: 120, rise: 160 };
const NEXT = { drop: 'squash', squash: 'spring', spring: 'hover', hover: 'rise', rise: 'idle' };

function useNotchSequence() {
  const loading = useNavigation().state === 'loading';
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (phase === 'idle') {
      if (loading) setPhase('drop');
      return;
    }
    if (phase === 'squash' && loading) return;
    const timer = setTimeout(() => setPhase(NEXT[phase]), STEP_MS[phase]);
    return () => clearTimeout(timer);
  }, [phase, loading]);

  return phase;
}

// True once the page has scrolled away from the top.
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > threshold));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [threshold]);

  return scrolled;
}

// The squash needs to know where the title sits so it can slide to the
// middle and how narrow the bar gets around it.
function useSquashGeometry(barRef, titleRef) {
  useLayoutEffect(() => {
    const bar = barRef.current;
    const title = titleRef.current;
    if (!bar || !title) return;
    const measure = () => {
      const pill = title.offsetWidth + 40;
      bar.style.setProperty('--to-center', `${bar.offsetWidth / 2 - (title.offsetLeft + title.offsetWidth / 2)}px`);
      bar.style.setProperty('--pill-inset', `${Math.max(0, (bar.offsetWidth - pill) / 2)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [barRef, titleRef]);
}

export default function NotchDock() {
  const scrolled = useScrolled();
  return (
    <div className={`notch-dock ${scrolled ? 'is-pinned' : ''}`}>
      <Notch />
    </div>
  );
}

function Notch() {
  const { user, pledged, signOut } = useSession();
  const navigate = useNavigate();
  const phase = useNotchSequence();
  const bar = useRef(null);
  const title = useRef(null);
  const [query, setQuery] = useState('');
  useSquashGeometry(bar, title);

  const { pathname, search } = useLocation();
  const onBuddies = pathname === '/feed' && new URLSearchParams(search).get('f') === 'buddies';
  const hubs = getHubsById([...pledged]);

  function findAndOpen(event) {
    event.preventDefault();
    const hub = findHub(query);
    if (hub) {
      navigate(`/h/${hub.id}`);
      setQuery('');
    }
  }

  return (
    <nav className="notch" data-phase={phase} ref={bar} aria-label="Mimyne">
      <span className="notch__bg" aria-hidden="true" />

      <Link to="/feed" className="notch__title" ref={title}>
        Mimyne
      </Link>

      <div className="notch__rest">
        <form className="notch__search" role="search" onSubmit={findAndOpen}>
          <Icon name="search" size={16} strokeWidth={2} />
          <input type="search" placeholder="Search Hubs" aria-label="Search Hubs" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>

        <span className="notch__divider" />

        <div className="notch__hubs" role="group" aria-label="Hubs you pledge to">
          {hubs.map((hub) => (
            <NavLink key={hub.id} to={`/h/${hub.id}`} className="notch__hub" aria-label={hub.name} title={hub.name}>
              <HubIcon hub={hub} size={32} />
            </NavLink>
          ))}
          <Link to="/feed#find-hubs" className="notch__add" aria-label="Find a Hub to pledge to" title="Find a Hub">
            <Icon name="plus" size={14} strokeWidth={2.2} />
          </Link>
        </div>

        <span className="notch__spacer" />

        <Menu
          label="Notifications"
          trigger={({ toggle, ...aria }) => (
            <button type="button" className="notch__icon" onClick={toggle} {...aria}>
              <Icon name="bell" size={18} />
            </button>
          )}
        >
          <p className="menu__note">You're all caught up.</p>
        </Menu>
        <NavLink to="/messages" className="notch__icon" aria-label="Messages">
          <Icon name="message" size={18} />
          {hasUnread() && <span className="notch__dot" />}
        </NavLink>
        <Link to="/feed" className={`notch__link ${pathname === '/feed' && !onBuddies ? 'active' : ''}`}>
          Feed
        </Link>
        <Link to="/feed?f=buddies" className={`notch__link notch__link--buddies ${onBuddies ? 'active' : ''}`}>
          Buddies
        </Link>

        <span className="notch__divider" />

        <Menu
          label="Your account"
          trigger={({ toggle, ...aria }) => (
            <button type="button" className="notch__me" onClick={toggle} {...aria}>
              <Avatar user={user} size={30} ring="var(--border)" />
              <span className="notch__name">{user.name}</span>
            </button>
          )}
        >
          <MenuItem onClick={signOut}>Sign out</MenuItem>
        </Menu>
        <Menu
          label="More"
          trigger={({ toggle, ...aria }) => (
            <button type="button" className="notch__icon" onClick={toggle} {...aria}>
              <Icon name="more" size={18} />
            </button>
          )}
        >
          <MenuItem as="a" href="/guidelines.html">Community Guidelines</MenuItem>
          <MenuItem as="a" href="/privacy.html">Privacy Policy</MenuItem>
          <MenuItem as="a" href="/terms.html">Terms of Service</MenuItem>
        </Menu>
      </div>
    </nav>
  );
}
