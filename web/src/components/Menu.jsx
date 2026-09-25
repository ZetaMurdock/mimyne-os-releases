import { useEffect, useId, useRef, useState } from 'react';
import './Menu.css';

// A button that opens a small popover. Closes on Escape, on a click outside,
// and when an item inside is chosen.
export default function Menu({ trigger, label, align = 'end', children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      {trigger({ open, toggle: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-controls': id, 'aria-label': label })}
      {open && (
        <div id={id} className={`menu__panel menu__panel--${align}`} onClick={(e) => e.target.closest('a,button') && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ as: Tag = 'button', children, ...rest }) {
  return (
    <Tag className="menu__item" {...(Tag === 'button' ? { type: 'button' } : {})} {...rest}>
      {children}
    </Tag>
  );
}
