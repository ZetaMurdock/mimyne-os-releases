import { useEffect, useState } from 'react';
import { useLoaderData, useSearchParams } from 'react-router-dom';
import { HubIcon } from '../components/Avatar.jsx';
import Button from '../components/Button.jsx';
import Icon from '../components/Icon.jsx';
import PledgeButton from '../components/PledgeButton.jsx';
import RoleChip from '../components/RoleChip.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import ReportDialog from '../components/ReportDialog.jsx';
import HubClips from '../components/hub/HubClips.jsx';
import HubEarnings from '../components/hub/HubEarnings.jsx';
import HubFiles from '../components/hub/HubFiles.jsx';
import HubRooms from '../components/hub/HubRooms.jsx';
import HubLook from '../components/hub/HubLook.jsx';
import HubBoard from '../components/hub/HubBoard.jsx';
import HubSettings from '../components/hub/HubSettings.jsx';
import PanelBackground from '../components/PanelBackground.jsx';
import { canSeePage, hasBackdrop, isVideoLink } from '../lib/hubLook.js';
import { cropStyle } from '../lib/profileShapes.js';
import { levelIn } from '../data/rooms.js';
import { Avatar } from '../components/Avatar.jsx';
import { getHub, getHubPeople } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useHubAccess, useSession } from '../data/session.jsx';
import { useSupportMinutes } from '../data/support.js';
import './Hub.css';

export function hubLoader({ params }) {
  return getHub(params.slug);
}

// Switching tabs or Rooms changes the address (?tab=, ?room=) without
// loading the Hub again.
export function shouldRevalidate({ currentParams, nextParams, defaultShouldRevalidate, formMethod }) {
  return formMethod ? defaultShouldRevalidate : currentParams.slug !== nextParams.slug;
}

const TABS = [
  { id: 'rooms', label: 'Rooms', icon: 'hash' },
  { id: 'board', label: 'Board' },
  { id: 'clips', label: 'Clips', icon: 'video' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'pledged', label: 'Pledged' },
  { id: 'rules', label: 'Rules' },
];
// The owner's own tab: what the Hub earns from Plus supports Hubs.
const EARNINGS = { id: 'earnings', label: 'Earnings' };

const LEVEL_LABEL = { owner: 'Runs the Hub', mod: 'Keeps it tidy', member: 'Pledged' };

export default function Hub() {
  const { hub: loadedHub, roles: loadedRoles, members: loadedMembers, posts: loadedPosts } = useLoaderData();
  // The Hub, its roles and its people, as the owner's tools last changed
  // them (without loading the page again).
  const [hub, setHub] = useState(loadedHub);
  const [{ roles, members }, setPeople] = useState({ roles: loadedRoles, members: loadedMembers });
  const [settings, setSettings] = useState(false);
  const refreshPeople = () => getHubPeople(hub.id).then(setPeople).catch(() => {});
  const { user, signIn } = useSession();
  const access = useHubAccess(hub, members);
  // Plus supports Hubs: the qualified minutes spent here (data/support.js).
  useSupportMinutes(hub.id, user?.uid);
  const { remember } = useSession();
  const inIt = !!user && (hub.ownerId === user.uid || members.some((m) => m.uid === user.uid));
  // In this Hub but missing from your list of Hubs: put it back.
  useEffect(() => {
    if (inIt) remember?.(hub.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inIt, hub.id]);
  const [params, setParams] = useSearchParams();
  // Its look, as the owner last saved it (changed here without loading the page again).
  const [look, setLook] = useState(() => ({ ...hub }));
  const [customizing, setCustomizing] = useState(false);
  // In the app, its own additions (appSlots.js): the panel designer.
  const slots = {};
  // The pages the owner kept for some: not shown to the rest (and the rules
  // refuse what is on them, lib/hubLook.js).
  const level = levelIn(hub, user, members, access.isPledged);
  const tabs = [...TABS.filter((t) => canSeePage(look, t.id, level)), ...(user && hub.ownerId === user.uid ? [EARNINGS] : [])];
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : (tabs[0]?.id ?? 'rooms');
  const setTab = (id, extra = {}) =>
    setParams(Object.fromEntries(Object.entries({ tab: id === 'rooms' ? null : id, ...extra }).filter(([, v]) => v)), { replace: true, preventScrollReset: true });
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [posts, setPosts] = useState(loadedPosts);

  const roleOf = (uid) => roles.find((r) => r.id === members.find((m) => m.uid === uid)?.role) ?? null;

  return (
    <div className={`hub ${user ? 'hub--under-notch' : ''} ${hasBackdrop(look) ? 'hub--backdrop' : ''}`}>
      {/* The background behind the whole page: a picture or video, or the
          panels the owner laid out in the app (lib/hubLook.js). */}
      {look.bgMode === 'image' && look.background && (
        <div className="hub__backdrop" aria-hidden="true">
          {isVideoLink(look.background)
            ? <video src={look.background} autoPlay loop muted playsInline style={cropStyle(look.backgroundCrop)} />
            : <img src={look.background} alt="" referrerPolicy="no-referrer" style={cropStyle(look.backgroundCrop)} />}
          <div className="hub__backdrop-dim" style={{ opacity: look.backgroundDim }} />
        </div>
      )}
      {look.bgMode === 'panels' && look.bgPanels.some((p) => p.src) && (
        <div className="hub__backdrop" aria-hidden="true">
          <PanelBackground panels={look.bgPanels} dividers={look.bgDividers} lineWidth={look.bgPanelGap} lineColor={look.bgPanelLineColor} />
          <div className="hub__backdrop-dim" style={{ opacity: look.backgroundDim }} />
        </div>
      )}
      <div className="hub__banner" style={{ background: `${hub.color}2e` }}>
        {look.banner && (isVideoLink(look.banner)
          ? <video src={look.banner} autoPlay loop muted playsInline style={cropStyle(look.bannerCrop)} />
          : <img src={look.banner} alt="" referrerPolicy="no-referrer" style={cropStyle(look.bannerCrop)} />)}
      </div>

      <div className="hub__identity">
        <span className="hub__icon">
          <HubIcon hub={{ ...hub, icon: look.icon }} size={96} />
        </span>
        <div className="hub__names">
          <h1 className="hub__name">{hub.name}</h1>
          <p className="hub__meta">
            {[hub.tagline, hub.tag && `#${hub.tag}`, `${members.length} pledged`, hub.visibility === 'public' ? 'Public' : 'Private']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="hub__actions">
          {access.canModerate && (
            <Button icon="gear" onClick={() => setSettings(true)} title={hub.ownerId === user?.uid ? 'Its details, roles, people and look' : 'Its people'}>
              {hub.ownerId === user?.uid ? 'Settings' : 'People'}
            </Button>
          )}
          <Button icon="share" iconOnly aria-label="Share this Hub" onClick={() => setSharing(true)} />
          <PledgeButton hub={hub} pledgedHere={access.isPledged} />
          {user && hub.ownerId !== user.uid && (
            <Button variant="ghost" icon="flag" iconOnly aria-label="Report this Hub" title="Report" onClick={() => setReporting(true)} />
          )}
        </div>
      </div>

      {!user && (
        <div className="hub__notice">
          <Icon name="eye" size={18} />
          <p>You're reading a public Hub. Anyone can look. Posting, comments, messages, downloads and pledging need a Mimyne account.</p>
          <button type="button" className="hub__notice-link" onClick={signIn}>
            Sign in
          </button>
        </div>
      )}

      <div className={`hub__content ${['rooms', 'files', 'clips'].includes(tab) ? 'hub__content--wide' : ''}`}>
        <div className="hub__main">
          <div className="tabs" role="tablist" aria-label={`${hub.name} sections`}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className="tabs__tab"
                onClick={() => setTab(t.id)}
              >
                {t.icon && <Icon name={t.icon} size={15} />}
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="hub__panel">
            {tab === 'rooms' && (
              <HubRooms
                hub={hub}
                members={members}
                roles={roles}
                roleOf={roleOf}
                user={user}
                access={access}
                roomId={params.get('room')}
                onRoom={(room) => setTab('rooms', { room })}
                onSignIn={signIn}
              />
            )}

            {tab === 'clips' && <HubClips hub={hub} user={user} access={access} onSignIn={signIn} />}

            {tab === 'files' && <HubFiles hub={hub} user={user} access={access} onSignIn={signIn} />}

            {tab === 'board' && (
              <HubBoard
                hub={hub}
                user={user}
                access={access}
                level={level}
                roleOf={roleOf}
                posts={posts}
                onPosts={setPosts}
                board={params.get('board')}
                onBoard={(id) => setTab('board', { board: id })}
                onSignIn={signIn}
              />
            )}

            {tab === 'pledged' && (
              <ul className="hub__members">
                {members.map((m) => (
                  <Member key={m.uid} member={m} role={roleOf(m.uid)} />
                ))}
              </ul>
            )}

            {tab === 'rules' && <Rules hub={hub} />}

            {tab === 'earnings' && <HubEarnings hub={hub} />}
          </div>
        </div>

        {!['rooms', 'files', 'clips'].includes(tab) && (
        <aside className="hub__side">
          <section className="card side-card">
            <h2 className="side-card__title">House rules</h2>
            <Rules hub={hub} short />
          </section>
          <section className="card side-card">
            <h2 className="side-card__title">Roles</h2>
            {roles.map((role) => (
              <div key={role.id} className="hub__role">
                <RoleChip role={role} />
                <span className="muted">{LEVEL_LABEL[role.level]}</span>
              </div>
            ))}
            <p className="hub__role-note">Names and colors are this Hub's own.</p>
          </section>
        </aside>
        )}
      </div>
      {reporting && (
        <ReportDialog
          about={{ targetUid: hub.ownerId, kind: 'hub', link: `/h/${hub.id}`, excerpt: [hub.name, hub.tagline].filter(Boolean).join(' · ') }}
          onClose={() => setReporting(false)}
        />
      )}
      {settings && (
        <HubSettings
          hub={hub}
          roles={roles}
          members={members}
          user={user}
          level={access.level}
          onClose={() => setSettings(false)}
          onChanged={(change) => {
            if (change?.details) setHub((h) => ({ ...h, ...change.details, tag: change.details.tag.replace(/^#/, '') }));
            refreshPeople();
          }}
          onLook={() => {
            setSettings(false);
            setCustomizing(true);
          }}
        />
      )}
      {customizing && (
        <HubLook
          hub={hub}
          look={look}
          roles={roles}
          panelsDesigner={slots.hubPanelsDesigner || null}
          onClose={() => setCustomizing(false)}
          onSaved={setLook}
        />
      )}
      {sharing && (
        <ShareDialog
          title={`Share ${hub.name}`}
          link={`/h/${hub.id}`}
          payload={{ text: `https://mimyne.com/h/${hub.id}` }}
          onClose={() => setSharing(false)}
        />
      )}
    </div>
  );
}

function Member({ member, role }) {
  const person = usePerson(member.uid, member.name);
  return (
    <li className="person">
      <Avatar person={person} size={36} />
      <span className="person__name">{person.name}</span>
      <RoleChip role={role} />
    </li>
  );
}

function Rules({ hub, short = false }) {
  return (
    <div className="hub__rules">
      <p className="muted">
        <a href="/guidelines.html">Mimyne's Community Guidelines</a>
        {hub.rules ? ', plus this Hub’s own:' : ' apply here.'}
      </p>
      {hub.rules && <p className="hub__rules-text">{short && hub.rules.length > 400 ? `${hub.rules.slice(0, 400)}…` : hub.rules}</p>}
      {!short && (
        <p className="muted">
          {hub.postingPolicy === 'pledged' ? 'Only people who pledged can post on the Board.' : 'Anyone signed in can post on the Board.'}
        </p>
      )}
    </div>
  );
}

