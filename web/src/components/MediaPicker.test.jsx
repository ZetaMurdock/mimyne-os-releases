import { describe, expect, it } from 'vitest';
import { placePanel } from './MediaPicker.jsx';

const window = { width: 1280, height: 800 };
const button = (left, top) => ({ left, top, right: left + 34, bottom: top + 34 });

describe('where the picker panel goes', () => {
  it('sits above its button when asked and there is room, never past an edge', () => {
    const spot = placePanel(button(300, 700), { placement: 'up', align: 'start', ...window });
    expect(spot.up).toBe(true);
    expect(spot.width).toBe(380);
    expect(spot.height).toBe(440);
    expect(spot.left).toBe(300);
    expect(spot.top).toBe(700 - 10 - 440);
  });

  it('goes below when there is more room there', () => {
    const spot = placePanel(button(300, 40), { placement: 'up', align: 'start', ...window });
    expect(spot.up).toBe(false);
    expect(spot.top).toBe(40 + 34 + 10);
  });

  it('keeps inside a small window, shrinking to fit', () => {
    const spot = placePanel(button(1200, 700), { placement: 'up', align: 'start', width: 1280, height: 520 });
    expect(spot.left + spot.width).toBeLessThanOrEqual(1280 - 12);
    expect(spot.top).toBeGreaterThanOrEqual(12);
    expect(spot.height).toBe(440);
    const tiny = placePanel(button(10, 300), { placement: 'up', align: 'start', width: 360, height: 400 });
    expect(tiny.width).toBe(360 - 24);
    expect(tiny.height).toBe(400 - 24);
    expect(tiny.left).toBe(12);
    expect(tiny.top).toBe(12);
  });

  it('aligns its right edge to the button when asked', () => {
    const spot = placePanel(button(900, 700), { placement: 'up', align: 'end', ...window });
    expect(spot.left).toBe(934 - 380);
  });
});
