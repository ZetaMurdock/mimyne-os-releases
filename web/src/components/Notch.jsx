import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useNavigation } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import Icon from './Icon.jsx';
import Menu, { MenuItem } from './Menu.jsx';
import NotificationBell from './NotificationBell.jsx';
import { getHubCard, getHubCards } from '../data/api.js';
import { amStaff } from '../data/reports.js';
import { useSession } from '../data/session.jsx';
import { useWebStatusPublisher } from '../data/status.js';
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
  const [missing, setMissing] = useState(false);
  const [hubs, setHubs] = useState([]);
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    let live = true;
    setStaff(false);
    if (user) amStaff(user.uid).then((yes) => live && setStaff(yes));
    return () => {
      live = false;
    };
  }, [user?.uid]);
  // The Hubs strip folds away to a count, and stays how it was left.
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem('mimyne.notchHubsFolded') === '1';
    } catch {
      return false;
    }
  });
  const fold = () =>
    setFolded((was) => {
      try {
        localStorage.setItem('mimyne.notchHubsFolded', was ? '0' : '1');
      } catch {
        // Not remembered: fine.
      }
      return !was;
    });
  useWebStatusPublisher(user?.uid);
  useSquashGeometry(bar, title);

  const { pathname, search } = useLocation();
  const onBuddies = pathname === '/feed' && new URLSearchParams(search).get('f') === 'buddies';
  const pledgedKey = [...pledged].sort().join(',');

  useEffect(() => {
    let live = true;
    getHubCards(pledgedKey ? pledgedKey.split(',') : []).then((cards) => live && setHubs(cards));
    return () => {
      live = false;
    };
  }, [pledgedKey]);

  // A Hub is found by its address: "Ashfall Crew" looks for /h/ashfall-crew.
  async function findAndOpen(event) {
    event.preventDefault();
    const id = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const hub = id && (await getHubCard(id));
    if (hub) {
      navigate(`/h/${hub.id}`);
      setQuery('');
    } else {
      setMissing(true);
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
          <input
            type="search"
            placeholder={missing ? 'No Hub at that address' : 'Find a Hub'}
            aria-label="Find a Hub by its address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMissing(false);
            }}
          />
        </form>

        <span className="notch__divider" />

        <div className={`notch__hubs ${folded ? 'is-folded' : ''}`} role="group" aria-label="Hubs you pledge to">
          <button
            type="button"
            className="notch__fold"
            onClick={fold}
            aria-expanded={!folded}
            aria-label={folded ? 'Show your Hubs' : 'Fold your Hubs away'}
            title={folded ? 'Show your Hubs' : 'Fold your Hubs away'}
          >
            {folded ? (
              <span className="notch__fold-count">{hubs.length} {hubs.length === 1 ? 'Hub' : 'Hubs'}</span>
            ) : null}
            <Icon name="chevronDown" size={14} strokeWidth={2.2} className="notch__fold-chev" />
          </button>
          {!folded &&
            hubs.map((hub) => (
              <NavLink key={hub.id} to={`/h/${hub.id}`} className="notch__hub" aria-label={hub.name} title={hub.name}>
                <HubIcon hub={hub} size={32} />
              </NavLink>
            ))}
          {!folded && (
            <Link to="/hubs/new" className="notch__add" aria-label="Start a Hub" title="Start a Hub">
              <Icon name="plus" size={14} strokeWidth={2.2} />
            </Link>
          )}
        </div>

        <span className="notch__spacer" />

        <NotificationBell me={user} />
        <NavLink to="/messages" className="notch__icon" aria-label="Messages">
          <Icon name="message" size={18} />
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
              <Avatar person={user} size={30} ring="var(--border)" />
              <span className="notch__name">{user.name}</span>
            </button>
          )}
        >
          <MenuItem as={Link} to={`/u/${encodeURIComponent(user.username)}`}>Your profile</MenuItem>
          <MenuItem as={Link} to="/hubs/new">Start a Hub</MenuItem>
          <MenuItem as={Link} to="/pricing">Plans and pricing</MenuItem>
          {staff && <MenuItem as={Link} to="/staff/reports">Reports</MenuItem>}
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
