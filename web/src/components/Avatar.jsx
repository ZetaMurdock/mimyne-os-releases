import './Avatar.css';

// People are circles, Hubs are rounded squares.
export function Avatar({ user, size = 32, ring }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user?.color ?? 'var(--border-2)', '--ring': ring }}
      role="img"
      aria-label={user?.name}
    />
  );
}

export function AvatarStack({ users, size = 24, max = 3 }) {
  return (
    <span className="avatar-stack">
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={size} ring="var(--surface-1)" />
      ))}
    </span>
  );
}

export function HubIcon({ hub, size = 32 }) {
  return (
    <span
      className="hub-icon"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: hub.bg,
        color: hub.fg,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {hub.letter}
    </span>
  );
}
