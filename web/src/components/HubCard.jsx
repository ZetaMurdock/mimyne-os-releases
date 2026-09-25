import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HubIcon } from './Avatar.jsx';
import PledgeButton from './PledgeButton.jsx';
import { getHubCard } from '../data/api.js';
import './HubCard.css';

// A Hub dropped into a post or a list, with its Pledge button right there.
export default function HubCard({ hub: given, hubId }) {
  const [hub, setHub] = useState(given ?? null);
  useEffect(() => {
    if (!given && hubId) getHubCard(hubId).then(setHub);
  }, [given, hubId]);
  if (!hub) return null;

  return (
    <div className="hub-card">
      <div className="hub-card__banner" style={{ background: `${hub.color}33` }} />
      <div className="hub-card__body">
        <span className="hub-card__icon">
          <HubIcon hub={hub} size={56} />
        </span>
        <span className="hub-card__text">
          <Link to={`/h/${hub.id}`} className="hub-card__name">
            {hub.name}
          </Link>
          <span className="hub-card__meta">{[hub.tagline, hub.visibility === 'public' ? 'Public' : 'Private'].filter(Boolean).join(' · ')}</span>
        </span>
        <PledgeButton hub={hub} size="md" />
      </div>
    </div>
  );
}

export function HubRow({ hub }) {
  return (
    <div className="hub-row">
      <HubIcon hub={hub} size={40} />
      <span className="hub-row__text">
        <Link to={`/h/${hub.id}`} className="hub-row__name">
          {hub.name}
        </Link>
        {hub.tagline && <span className="hub-row__meta">{hub.tagline}</span>}
      </span>
      <PledgeButton hub={hub} size="sm" quiet />
    </div>
  );
}
