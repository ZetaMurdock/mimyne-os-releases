import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import './Dialog.css';

// A modal over the page: Escape and the close button dismiss it (when it can
// be dismissed), focus starts inside it.
export default function Dialog({ title, onClose, children, width = 420 }) {
  const panel = useRef(null);

  useEffect(() => {
    panel.current?.querySelector('input, button:not(.dialog__close)')?.focus();
    if (!onClose) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="dialog__panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={panel} style={{ width: `min(${width}px, 100% - 32px)` }}>
        <header className="dialog__head">
          <h2 id="dialog-title" className="dialog__title">{title}</h2>
          {onClose && (
            <button type="button" className="dialog__close" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} strokeWidth={2} />
            </button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
