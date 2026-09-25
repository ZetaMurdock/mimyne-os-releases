import { Link } from 'react-router-dom';
import { HubIcon } from './Avatar.jsx';
import PledgeButton from './PledgeButton.jsx';
import './HubCard.css';

// A Hub dropped into a post or a list, with its Pledge button right there.
export default function HubCard({ hub }) {
  return (
    <div className="hub-card">
      <div className="hub-card__banner" style={{ background: hub.banner }} />
      <div className="hub-card__body">
        <span className="hub-card__icon">
          <HubIcon hub={hub} size={56} />
        </span>
        <span className="hub-card__text">
          <Link to={`/h/${hub.id}`} className="hub-card__name">
            {hub.name}
          </Link>
          <span className="hub-card__meta">{hub.tagline} · Public</span>
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
        <span className="hub-row__meta">{hub.tagline}</span>
      </span>
      <PledgeButton hub={hub} size="sm" quiet />
    </div>
  );
}
