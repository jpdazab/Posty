// Estilos de las capas de una plantilla propia. Los usan el editor visual y la exportación,
// así lo que se ve al editar es exactamente lo que sale en el PNG/PDF.
//
// Tipos de capa (`kind`):
// - 'text' (o sin kind, plantillas anteriores): texto con fuente, tamaño, color, alineación…
//   y opcionalmente fondo, relleno y esquinas redondeadas (botones, etiquetas).
// - 'shape': rectángulo o círculo de color (separadores, bloques de fondo).
// - 'image': imagen subida, recortada para llenar su caja.

export const isText = (l) => !l.kind || l.kind === 'text';

export function textLayers(tpl) {
  return (tpl?.layers || []).filter(isText);
}

// Estilo en camelCase (React y element.style).
export function layerStyle(l) {
  const base = { position: 'absolute', left: l.x, top: l.y, width: l.w, opacity: l.opacity ?? 1 };
  if (l.kind === 'shape') {
    return { ...base, height: l.h, backgroundColor: l.color, borderRadius: l.radius || 0 };
  }
  if (l.kind === 'image') {
    return { ...base, height: l.h, objectFit: 'cover', borderRadius: l.radius || 0, display: 'block' };
  }
  const style = {
    ...base,
    fontSize: l.size,
    color: l.color,
    fontWeight: l.weight,
    fontStyle: l.italic ? 'italic' : 'normal',
    textAlign: l.align,
    lineHeight: l.lineHeight || 1.2,
    letterSpacing: l.letterSpacing ? `${l.letterSpacing}em` : 'normal',
    textTransform: l.uppercase ? 'uppercase' : 'none',
    fontFamily: `"${l.font}", var(--font-sans)`,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  };
  if (l.bg) {
    Object.assign(style, {
      backgroundColor: l.bg,
      padding: `${l.padY ?? 16}px ${l.padX ?? 28}px`,
      borderRadius: l.radius || 0,
      boxSizing: 'border-box',
    });
  }
  return style;
}

// El mismo estilo como texto CSS (para el lienzo del editor, que no usa React).
export function layerCss(l) {
  return Object.entries(layerStyle(l))
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof v === 'number' && !['opacity', 'fontWeight', 'lineHeight'].includes(k) ? `${v}px` : v}`)
    .join(';');
}
