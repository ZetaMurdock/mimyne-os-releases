import { useCallback, useRef, useState } from 'react';
import { MAX_ZOOM, cropStyle, dragCrop, isCropped, normalizeCrop, zoomCrop } from '../lib/profileShapes.js';
import { isVideoLink } from '../lib/hubLook.js';
import './CropBox.css';

/**
 * Framing a picture in the shape it will be seen in: drag it about, roll
 * the wheel or pull the slider to go in, and what is in the box is what
 * will show. The app's components/shared/CropBox.jsx, for the site: the
 * picture is never altered, only framed (three numbers, lib/profileShapes.js).
 */
export default function CropBox({ src, crop, onChange, aspect = 3 / 4, width = 220, label = 'Framing', hint = 'Drag to move. Roll or pull to go closer.' }) {
  const frame = useRef(null);
  const from = useRef(null);
  const [dragging, setDragging] = useState(false);
  const here = normalizeCrop(crop);

  const start = (event) => {
    if (here.zoom <= 1) return;
    event.preventDefault();
    from.current = { x: event.clientX, y: event.clientY, crop: here };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!from.current) return;
    const box = frame.current?.getBoundingClientRect?.();
    onChange?.(dragCrop(from.current.crop, { dx: event.clientX - from.current.x, dy: event.clientY - from.current.y }, box));
  };
  const stop = (event) => {
    from.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const wheel = useCallback((event) => {
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.12 : -0.12;
    onChange?.(zoomCrop(normalizeCrop(crop), normalizeCrop(crop).zoom + step));
  }, [crop, onChange]);

  if (!src) return null;
  return (
    <div className="cropbox">
      <div className="cropbox__head">
        <span className="label">{label}</span>
        {isCropped(here) && (
          <button type="button" className="cropbox__reset" onClick={() => onChange?.(normalizeCrop(null))}>Fit</button>
        )}
      </div>
      <div className="cropbox__row">
        <div
          ref={frame}
          role="presentation"
          className={`cropbox__frame ${dragging ? 'is-dragging' : ''} ${here.zoom > 1 ? 'can-drag' : ''}`}
          style={{ width, height: Math.round(width / aspect) }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          onWheel={wheel}
        >
          {isVideoLink(src)
            ? <video src={src} autoPlay loop muted playsInline draggable={false} style={{ ...cropStyle(here), pointerEvents: 'none' }} />
            : <img src={src} alt="" referrerPolicy="no-referrer" draggable={false} style={{ ...cropStyle(here), pointerEvents: 'none' }} />}
        </div>
        <div className="cropbox__side">
          <span className="muted">{`${Math.round(here.zoom * 100)}%`}</span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={here.zoom} aria-label={label} onChange={(e) => onChange?.(zoomCrop(here, Number(e.target.value)))} />
          <span className="muted cropbox__hint">{hint}</span>
        </div>
      </div>
    </div>
  );
}
