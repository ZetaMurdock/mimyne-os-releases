import { useEffect, useMemo, useState } from 'react';
import splat1 from '../assets/disapprove/splat-1.webp';
import splat2 from '../assets/disapprove/splat-2.webp';
import splat3 from '../assets/disapprove/splat-3.webp';
import splat4 from '../assets/disapprove/splat-4.webp';
import splat5 from '../assets/disapprove/splat-5.webp';
import { playDisapproveSound } from '../lib/uiSound.js';

// What disapproving looks like, as in the app (DisapproveSplat there): a
// blob drops onto the button and bursts, the five drawings in order, a dark
// stain spreading under it and droplets thrown out that fall as they go.

const FRAMES = [splat1, splat2, splat3, splat4, splat5];
const FRAME_MS = 60;
export const SPLAT_MS = 900;
const DROPLETS = 7;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// Spread around the impact and never the same twice: each throw turns the
// click's number into its own angles and distances.
function droplets(seed, count, size) {
  return Array.from({ length: count }, (_, index) => {
    const spin = ((seed * 29 + index * 71) % 23) / 23;
    const angle = (-165 + (330 / (count - 1)) * index + spin * 14) * (Math.PI / 180);
    const reach = size * (0.9 + spin * 1.1);
    return {
      id: index,
      dx: Math.round(Math.cos(angle) * reach),
      // Everything thrown ends up lower than it started: it is falling.
      dy: Math.round(Math.sin(angle) * reach * 0.5 + size * (0.8 + spin * 0.5)),
      size: Math.max(2, Math.round(size * (0.12 + spin * 0.16))),
      delay: Math.round(spin * 60),
    };
  });
}

export default function DisapproveSplat({ play = 0, size = 16 }) {
  const [showing, setShowing] = useState(0);
  const [frame, setFrame] = useState(0);
  const bits = useMemo(() => droplets(showing || 1, DROPLETS, size), [showing, size]);

  useEffect(() => {
    if (!play) return undefined;
    playDisapproveSound();
    if (reducedMotion()) return undefined;
    setShowing(play);
    setFrame(0);
    const steps = FRAMES.map((_, index) => setTimeout(() => setFrame(index), index * FRAME_MS));
    const done = setTimeout(() => setShowing(0), SPLAT_MS);
    return () => {
      steps.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [play]);

  if (!showing) return null;
  return (
    <span key={showing} className="fx-anchor" aria-hidden="true">
      <span className="fx-disapprove-stain" style={{ width: size * 2.2, height: size * 2.2 }} />
      {bits.map((bit) => (
        <span
          key={bit.id}
          className="fx-disapprove-droplet"
          style={{ width: bit.size, height: bit.size, animationDelay: `${bit.delay}ms`, '--bit-x': `${bit.dx}px`, '--bit-y': `${bit.dy}px` }}
        />
      ))}
      <img src={FRAMES[frame]} alt="" draggable={false} className="fx-disapprove-splat" style={{ width: size * 1.6 }} />
    </span>
  );
}
