// Texto de un PDF → bloques para las capas de una plantilla (sin dependencias: se prueba en Node).


const WEIGHTS = [
  [/thin|hairline/i, 100],
  [/extra ?light|ultra ?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi ?bold|demi ?bold/i, 600],
  [/extra ?bold|ultra ?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

// "ABCDEF+Montserrat-SemiBoldItalic" → { family: 'Montserrat', weight: 600 }
export function parseFontName(raw) {
  const name = String(raw || '').replace(/^[A-Z]{6}\+/, '');
  const [familyPart, style = ''] = name.split(/[-,]/);
  const family = familyPart.replace(/(MT|PS|Std|Pro)$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const weight = WEIGHTS.find(([re]) => re.test(style) || re.test(familyPart))?.[1] || 400;
  return { family, weight, raw: name };
}

// ---------- Texto → bloques ----------

const BULLET = /^\s*(?:[-•*·→▪►✓✔]|\d+[.)])\s+/u;

// runs: { text, x, baseline, width, size, font, weight, color }
export function groupRuns(runs) {
  // 1. Líneas: trozos en la misma línea base, misma fuente y tamaño, sin grandes huecos.
  const sorted = [...runs].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const lines = [];
  for (const r of sorted) {
    const line = lines.find(
      (l) =>
        Math.abs(l.baseline - r.baseline) < r.size * 0.3 &&
        Math.abs(l.size - r.size) < r.size * 0.12 &&
        l.font === r.font &&
        r.x - (l.x + l.width) < r.size * 1.5 &&
        r.x - (l.x + l.width) > -r.size,
    );
    if (line) {
      const gap = r.x - (line.x + line.width);
      // Texto espaciado ("L I D E R A Z G O"): letras sueltas seguidas se juntan sin espacio.
      const spacedLetters = r.text.trim().length === 1 && line.lastLen === 1 && gap < r.size * 0.9;
      line.text += gap > r.size * 0.18 && !spacedLetters && !/\s$/.test(line.text) && !/^\s/.test(r.text) ? ` ${r.text}` : r.text;
      line.lastLen = r.text.trim().length;
      line.width = Math.max(line.width, r.x + r.width - line.x);
    } else {
      lines.push({ ...r, lastLen: r.text.trim().length });
    }
  }
  for (const l of lines) {
    l.text = l.text.replace(/\s+/g, ' ').trim();
    // Espaciado entre letras que llega como "L I D E R A Z G O": se quitan los espacios.
    if (/^(\S ){3,}\S$/u.test(l.text)) l.text = l.text.replace(/ /g, '');
  }

  // 2. Bloques: líneas seguidas con el mismo estilo, interlineado razonable y alineadas.
  const blocks = [];
  for (const l of lines.filter((x) => x.text).sort((a, b) => a.baseline - b.baseline)) {
    const block = blocks.find((b) => {
      const last = b.lines[b.lines.length - 1];
      const gap = l.baseline - last.baseline;
      const sameStyle = last.font === l.font && Math.abs(last.size - l.size) < l.size * 0.12 && last.color === l.color;
      const aligned = Math.abs(last.x - l.x) < l.size * 1.2 || Math.abs(last.x + last.width / 2 - (l.x + l.width / 2)) < l.size || Math.abs(last.x + last.width - (l.x + l.width)) < l.size;
      return sameStyle && aligned && gap > l.size * 0.8 && gap < l.size * 1.9;
    });
    if (block) block.lines.push(l);
    else blocks.push({ lines: [l] });
  }

  return blocks.map((b) => {
    const first = b.lines[0];
    const left = Math.min(...b.lines.map((l) => l.x));
    const right = Math.max(...b.lines.map((l) => l.x + l.width));
    const gaps = b.lines.slice(1).map((l, i) => (l.baseline - b.lines[i].baseline) / first.size);
    const lineHeight = gaps.length ? Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100 : 1.2;
    let align = 'left';
    if (b.lines.length > 1) {
      const lefts = b.lines.map((l) => l.x);
      const centers = b.lines.map((l) => l.x + l.width / 2);
      const rights = b.lines.map((l) => l.x + l.width);
      const spread = (arr) => Math.max(...arr) - Math.min(...arr);
      if (spread(lefts) > first.size * 0.6) align = spread(centers) < first.size * 0.6 ? 'center' : spread(rights) < first.size * 0.6 ? 'right' : 'left';
    }
    // Con viñetas o números, cada punto en su línea.
    const list = b.lines.some((l) => BULLET.test(l.text));
    return {
      text: b.lines.map((l) => l.text).join(list ? '\n' : ' '),
      x: left,
      width: right - left,
      baseline: first.baseline,
      size: first.size,
      lineHeight: Math.min(2.2, Math.max(0.9, lineHeight)),
      align,
      font: first.font,
      weight: first.weight,
      color: first.color,
    };
  });
}

