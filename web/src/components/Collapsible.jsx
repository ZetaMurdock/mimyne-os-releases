import { useId, useState } from 'react';
import Icon from './Icon.jsx';
import './Collapsible.css';

// A section that folds. Its height animates by moving a grid row from 0fr to
// 1fr, so nothing has to be measured.
export default function Collapsible({ title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className={`collapsible ${open ? 'is-open' : ''}`}>
      <h2 className="collapsible__heading">
        <button type="button" className="collapsible__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <span className="collapsible__title">{title}</span>
          {badge && <span className="collapsible__badge">{badge}</span>}
          <Icon name="chevronDown" size={18} strokeWidth={2} className="collapsible__chevron" />
        </button>
      </h2>
      <div id={panelId} className="collapsible__panel" inert={!open}>
        <div className="collapsible__inner">{children}</div>
      </div>
    </section>
  );
}
