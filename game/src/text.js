// Small canvas UI helpers: panels, pills, buttons, bars and wrapped text.
// The renderer leans on these for the HUD, the menus and the overlays so the
// drawing code reads as layout rather than raw path fiddling. Every helper
// saves and restores the context, so callers never inherit a stray fill
// style or font.
export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// A filled, optionally stroked panel with rounded corners.
export function panel(ctx, x, y, w, h, opts) {
  const o = opts || {};
  ctx.save();
  roundRectPath(ctx, x, y, w, h, o.radius === undefined ? 10 : o.radius);
  ctx.fillStyle = o.fill || 'rgba(10, 12, 20, 0.72)';
  ctx.fill();
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lineWidth || 1;
    ctx.stroke();
  }
  ctx.restore();
}

// One line of text inside a pill, centered on cx at height y. Returns the
// pill's width so a caller can stack pills without overlap.
export function pill(ctx, cx, y, text, opts) {
  const o = opts || {};
  const font = o.font || '600 14px system-ui, sans-serif';
  const padX = o.padX === undefined ? 14 : o.padX;
  const padY = o.padY === undefined ? 7 : o.padY;
  ctx.save();
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  const h = 14 + padY * 2;
  roundRectPath(ctx, cx - w / 2, y, w, h, h / 2);
  ctx.fillStyle = o.fill || 'rgba(10, 12, 20, 0.78)';
  ctx.fill();
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.font = font;
  ctx.fillStyle = o.color || '#f2f0e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 1);
  ctx.restore();
  return w;
}

// A menu button: a panel with a centered label. The selected button gets an
// accent border and a brighter fill; a disabled one fades out.
export function button(ctx, rect, labelText, opts) {
  const o = opts || {};
  const font = o.font || '600 17px system-ui, sans-serif';
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 9);
  ctx.fillStyle = o.disabled
    ? 'rgba(30, 32, 44, 0.55)'
    : o.selected ? 'rgba(255, 217, 59, 0.92)' : 'rgba(16, 18, 28, 0.82)';
  ctx.fill();
  ctx.strokeStyle = o.selected ? '#fff3b0' : 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = o.selected ? 2 : 1;
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = o.disabled ? 'rgba(242, 240, 230, 0.4)' : o.selected ? '#1a1405' : '#f2f0e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(labelText, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

// A horizontal bar: a dark track with a filled fraction on top.
export function bar(ctx, x, y, w, h, frac, opts) {
  const o = opts || {};
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = o.bg || 'rgba(0, 0, 0, 0.55)';
  ctx.fill();
  if (f > 0) {
    roundRectPath(ctx, x, y, Math.max(h, w * f), h, h / 2);
    ctx.fillStyle = o.fill || '#57d977';
    ctx.fill();
  }
  if (o.border) {
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.strokeStyle = o.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

// Split a paragraph into lines that fit maxWidth under the current font.
export function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// One line of text with an optional soft shadow for readability over the
// world. Align and baseline pass straight through to the context.
export function label(ctx, text, x, y, opts) {
  const o = opts || {};
  ctx.save();
  ctx.font = o.font || '600 14px system-ui, sans-serif';
  ctx.fillStyle = o.color || '#f2f0e6';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  if (o.shadow !== false) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}
