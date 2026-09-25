// A role's name and colour are the Hub's own.
export default function RoleChip({ role }) {
  if (!role) return null;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        padding: '2px 7px',
        borderRadius: 'var(--r-tag)',
        background: `${role.color}26`,
        color: role.color,
        whiteSpace: 'nowrap',
      }}
    >
      {role.name}
    </span>
  );
}
