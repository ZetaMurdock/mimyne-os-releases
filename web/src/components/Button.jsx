import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import './Button.css';

// One button for everything. `to` makes it a link inside the site, `href` a
// link out; otherwise it's a real <button>.
export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconOnly = false,
  loading = false,
  selected = false,
  to,
  href,
  className = '',
  disabled = false,
  children,
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    iconOnly && 'btn--icon',
    selected && 'is-selected',
    loading && 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? (
        <Icon name="spinner" size={14} strokeWidth={3} className="btn__spinner" />
      ) : selected && !icon ? (
        <Icon name="check" size={14} strokeWidth={2.5} />
      ) : (
        icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} />
      )}
      {iconOnly ? null : children}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={classes} disabled={loading || disabled} {...rest}>
      {content}
    </button>
  );
}
