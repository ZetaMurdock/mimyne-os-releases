import './Avatar.css';

// A steady colour per person, for when they have no picture.
const SWATCHES = ['#F2B84B', '#F9A8D4', '#C4B5FD', '#5EEAD4', '#93C5FD', '#FCA5A5', '#A3E635', '#FDBA74'];
function swatch(seed = '') {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return SWATCHES[Math.abs(h) % SWATCHES.length];
}

// People are circles, Hubs are rounded squares.
export function Avatar({ person, size = 32, ring }) {
  const style = { width: size, height: size, '--ring': ring };
  if (person?.picture) {
    return <img className="avatar" src={person.picture} alt="" style={style} referrerPolicy="no-referrer" />;
  }
  return (
    <span className="avatar avatar--letter" style={{ ...style, background: swatch(person?.uid ?? person?.username), fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {(person?.username ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ people, size = 24, max = 3 }) {
  return (
    <span className="avatar-stack">
      {people.slice(0, max).map((p) => (
        <Avatar key={p.uid} person={p} size={size} ring="var(--surface-1)" />
      ))}
    </span>
  );
}

// Light text on dark colours, dark text on light ones.
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#050505' : '#ffffff';
}

export function HubIcon({ hub, size = 32 }) {
  const bg = hub.color ?? '#3F3F46';
  return (
    <span
      className="hub-icon"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: bg, color: textOn(bg), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {(hub.name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}
