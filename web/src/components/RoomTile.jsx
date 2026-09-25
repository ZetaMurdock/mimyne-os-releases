import { AvatarStack, HubIcon } from './Avatar.jsx';
import Icon from './Icon.jsx';
import { getHubSync, getUser } from '../data/api.js';
import { timeAgo } from '../lib/format.js';
import './RoomTile.css';

const ACCESS_LABEL = { edit: 'You can edit', add: 'You can add notes', view: 'You can view' };

// A room is a shared workspace. It shows who is in it right now, what you
// can do there, and the other Hubs it also belongs to.
export default function RoomTile({ room, currentHub, signedIn, level }) {
  const here = room.here.map(getUser);
  const live = here.length > 0;
  const restricted = room.levels && !room.levels.includes(level);
  const otherHubs = room.hubs.filter((h) => h !== currentHub).map(getHubSync).filter(Boolean);

  return (
    <article className={`room ${live ? 'room--live' : ''}`}>
      <div className="room__front placeholder" style={{ background: room.front }}>
        {restricted ? (
          <span className="room__locked">
            <Icon name="lock" size={14} /> Only some roles can see inside
          </span>
        ) : (
          '[Room front]'
        )}
        {live && !restricted && <span className="room__live">● LIVE</span>}
      </div>
      <div className="room__body">
        <div className="room__title">
          <h3 className="room__name">{room.name}</h3>
          <span className="room__tag">#{room.tag}</span>
        </div>
        {!restricted && (
          <div className="room__status">
            {live ? (
              <>
                <AvatarStack users={here} />
                <span className="room__who">
                  {here.length === 1 ? `${here[0].name} is here` : `${here[0].name}, ${here[1].name}${here.length > 2 ? ` and ${here.length - 2} more` : ''}`}
                </span>
              </>
            ) : (
              <span className="room__who room__who--quiet">Quiet · edited {timeAgo(room.edited)} ago</span>
            )}
            <span className="room__access">{signedIn ? ACCESS_LABEL[room.access] ?? 'View only' : 'View only'}</span>
          </div>
        )}
        {otherHubs.map((h) => (
          <span key={h.id} className="room__also">
            <HubIcon hub={h} size={14} /> Also in {h.name}
          </span>
        ))}
      </div>
    </article>
  );
}
