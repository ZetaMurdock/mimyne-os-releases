import { useId } from 'react';
import {
  anchoredDividers, dividerPanels, hasAnyPanelPicture, normalizePanels, panelImageStyle, solidLayout, spanPoints, toClipPath,
} from '../lib/panels.js';
import { isVideoLink } from '../lib/hubLook.js';

/**
 * A background cut into panels by lines - the character line-up look the
 * app's home screen has, drawn here for a Hub's page. The same drawing as
 * the app's components/home/PanelBackground.jsx: panels meet exactly and
 * the divider is stroked over the seam in pixels; a picture spread across
 * several regions (a span) is drawn once and clipped to all of them, so a
 * video has one decoder. Sources are https links (lib/hubLook.js).
 */
export default function PanelBackground({ panels: savedPanels, dividers: saved, lineWidth = 1.2, lineColor = '#000000', className = '', active = true }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const layout = solidLayout(saved, savedPanels);
  const pictures = normalizePanels(layout.panels);
  const shapes = dividerPanels(layout.dividers);
  const lines = anchoredDividers(layout.dividers);
  if (!hasAnyPanelPicture(layout.panels)) return null;

  const spans = new Map();
  for (const shape of shapes) {
    const picture = pictures[shape.index];
    if (!picture?.src || !picture.span) continue;
    const span = spans.get(picture.span) || { picture, members: [] };
    span.members.push(shape.index);
    spans.set(picture.span, span);
  }
  const spread = (index) => {
    const span = spans.get(pictures[index]?.span);
    return span && span.members.length > 1 ? span : null;
  };
  const media = (picture, box) => (isVideoLink(picture.src)
    ? <video src={picture.src} autoPlay={active} loop muted playsInline style={panelImageStyle(box, picture.crop)} />
    : <img src={picture.src} alt="" draggable={false} decoding="async" referrerPolicy="no-referrer" style={panelImageStyle(box, picture.crop)} />);
  const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };

  return (
    <div className={`panel-bg ${className}`} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: lineColor }}>
      {[...spans.entries()].filter(([, span]) => span.members.length > 1).map(([id, span]) => {
        const clipId = `${uid}-${id}`;
        return (
          <div key={`span-${id}`} style={{ ...fill, clipPath: `url(#${clipId})` }} data-panel-span={id} data-panel-members={span.members.join(' ')}>
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
              <defs>
                <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                  {span.members.map((index) => (
                    <polygon key={index} points={shapes[index].points.map(([x, y]) => `${x / 100},${y / 100}`).join(' ')} />
                  ))}
                </clipPath>
              </defs>
            </svg>
            {media(span.picture, spanPoints(shapes, span.members))}
          </div>
        );
      })}
      {shapes.map((shape) => {
        const picture = pictures[shape.index];
        if (!picture?.src || spread(shape.index)) return null;
        return (
          <div key={shape.id} style={{ ...fill, clipPath: toClipPath(shape.points) }} data-panel-index={shape.index}>
            {media(picture, shape.points)}
          </div>
        );
      })}
      {lineWidth > 0 && lines.length > 0 && (
        <svg style={{ ...fill, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden="true">
          {lines.map((line) => (
            <line
              key={line.id}
              x1={`${line.ax}%`} y1={`${line.ay}%`} x2={`${line.bx}%`} y2={`${line.by}%`}
              stroke={lineColor}
              strokeWidth={lineWidth}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
    </div>
  );
}
