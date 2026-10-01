# Posty

Panel para revisar, organizar y publicar en LinkedIn los posts que prepara Claude. Tiene dos páginas
en el menú lateral:

- **AI Digest**: las propuestas semanales (ver abajo).
- **Crear post**, con tres modos:
  - **Pedir a Claude**: describes la idea y Claude escribe el post y la gráfica (necesita la API key).
  - **Pegar mi texto**: pegas un post ya escrito y Posty reparte el texto en la gráfica sin IA
    (gancho → titular, listas → puntos o slides, cifras → tarjetas de datos, pregunta final → cierre).
  - **Desde cero**: rellenas el texto y la gráfica a mano.

  Formatos: **carrusel** (portada + slides), **card única** (una sola slide del carrusel: estilo portada o
  slide con cifras, barras, Venn o **imagen**) y **card con lista**. Las gráficas usan el design system
  jpdazab y se editan con vista previa en vivo; "Volver sin guardar" descarta los cambios. Se descargan
  en PNG (y el carrusel en PDF). Los últimos 20 posts quedan en el navegador y se pueden borrar.

## Cómo funciona

1. **Claude envía las propuestas**: cada semana agrega un archivo `propuestas/AAAA-Www.md`
   a este repositorio (formato en [`PROPUESTAS.md`](./PROPUESTAS.md)).
2. **La plataforma las muestra** agrupadas por semana, con fecha y hora sugeridas, pilar,
   objetivo, formato, idea de imagen y conteo de caracteres (límite de 3.000 de LinkedIn).
3. **Tú decides** sobre cada post:
   - **Publicar**: copia el texto (con hashtags) al portapapeles y abre LinkedIn con el
     editor de publicación ya prellenado. Luego confirmas y queda marcado como publicado,
     opcionalmente con el enlace al post.
   - **Copiar**, **Editar** (sin perder el original), **Aprobar**, **Descartar** o
     **Ya lo publiqué**.
4. Arriba ves los totales y el **próximo post a publicar**; los posts con fecha vencida
   aparecen como **Atrasado**.

El estado (aprobado, publicado, ediciones) se guarda en tu navegador. Usa **Exportar** /
**Importar** para respaldarlo o pasarlo a otro dispositivo.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas del parser y del archivo de ejemplo
npm run build    # sitio estático en dist/
```

## Design system jpdazab (`src/ds/`)

Copia del design system publicado en https://claude.ai/artifact/67ierA58ddzJjMydKg2AQm:
componentes (`bundle.js`, `bundle.css`, `index.d.ts`), `tokens.json` y su documentación (`README.md`),
fuentes Switzer y Projekt Blackbird, y los logos. `tokens.css` se genera desde `tokens.json`
(tema light) y sus variables viven bajo la clase `.ds` para no mezclarse con los estilos de Posty.
Geist Mono llega desde el paquete `@fontsource/geist-mono`.

- Card: post social 1080 × 1351 (titular con frase destacada, lead, `NumberedCardList`, lockup).
- Carrusel: `CoverCard` + `SlideCard` 1231 × 1731, con `StatGrid`, `ProgressBars`, `CarouselVenn` o
  `CarouselImage` (Template-5, card con imagen) opcionales.
- Card única: un solo `CoverCard` o `SlideCard` 1231 × 1731, sin "Swipe".
- Projekt Blackbird no tiene tildes ni ñ: el editor avisa cuando un campo en esa fuente las lleva.

Si el design system cambia, vuelve a copiar esos archivos desde el artifact.

## Generador de posts con Claude (opcional)

La página llama a `POST /api/generate` (función de Vercel en `api/generate.js`, lógica en
`server/generate.js`), que usa la API de Claude con salida estructurada. Variables de entorno en Vercel:

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Sí | Clave de la API de Anthropic (console.anthropic.com). Cada post cuesta unos céntimos. |
| `POSTY_ACCESS_CODE` | Recomendada | Código que la web pide la primera vez; evita que otra persona con el enlace gaste tu API key. |

En local, `npm run dev` sirve la misma API si exportas `ANTHROPIC_API_KEY`.

## Despliegue

Sitio Vite + una función serverless. En Vercel basta con importar el repositorio
(build: `npm run build`, salida: `dist`) y añadir las variables de entorno de arriba.
Cada push con una propuesta nueva vuelve a desplegar el sitio automáticamente.
