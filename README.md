# Posty

Panel para revisar, organizar y publicar en LinkedIn los posts que prepara Claude. Es multiusuario:
cada persona entra con un enlace por email y tiene su propio AI Digest, sus posts, su marca y su rutina
semanal (ver **[SETUP.md](./SETUP.md)** para configurarlo con Supabase y Vercel).

Páginas del menú lateral:

- **AI Digest**: las propuestas semanales (ver abajo). Arriba, **Tus temas**: cada cuenta elige sus temas
  (con un enfoque opcional), cuántos posts quiere por semana, para quién escribe e indicaciones para
  Claude. Su rutina semanal los lee con `GET /api/topics`. Con **Generar propuestas ahora** Claude prepara
  al momento la tanda de esta semana o de la próxima (solo texto, con los mismos temas), sin esperar a la
  rutina; cuenta un post del límite mensual por propuesta.
- **Crear post**, con tres modos:
  - **Pedir a Claude**: describes la idea y Claude escribe el post y la gráfica (necesita la API key).
  - **Pegar mi texto**: pegas un post ya escrito y Posty reparte el texto en la gráfica sin IA
    (gancho → titular, listas → puntos o slides, cifras → tarjetas de datos, pregunta final → cierre).
  - **Desde cero**: rellenas el texto y la gráfica a mano.

  Formatos: **carrusel** (portada + slides), **card única** (una sola slide del carrusel: estilo portada o
  slide con cifras, barras, Venn o **imagen**) y **card con lista**. Las gráficas usan el design system
  jpdazab y se editan con vista previa en vivo; "Volver sin guardar" descarta los cambios. Se descargan
  en PNG (y el carrusel en PDF). Los últimos 20 posts quedan en el navegador y se pueden borrar.

- **Asistente de bienvenida**: la primera vez que alguien entra, Posty empieza en blanco (sin plantillas)
  y le pide su marca en cuatro pasos: firma y logo (del logo salen colores sugeridos), cuatro colores
  (principal, secundario, fondo y texto, con paletas y aviso de contraste), tipografías de titulares y
  texto (de la lista o subidas) y su primera plantilla. Se puede repetir desde Diseños.
- **Diseños**:
  - **Plantillas**: las plantillas propias de cada persona. Las cuentas creadas antes del asistente
    conservan además las plantillas de ejemplo del design system jpdazab (card con lista, portadas,
    slides y carrusel).
  - **Mis plantillas**: plantillas propias con fondo (color o imagen, por ejemplo exportada de Figma)
    y capas de texto con posición, tamaño, color, tipografía, peso y alineación.
  - **Colores y tipografía**: los colores, tipografías, firma y logo de la marca (los mismos controles
    del asistente). Las plantillas nuevas empiezan con ellos.
  - **Exportar / importar kit**: un JSON con todo lo anterior (incluidos los archivos) para llevarlo
    a otro navegador.

  El kit se guarda en la cuenta (o en el navegador en modo local).

- **Cuenta**: sesión, uso de Claude del mes, token para la rutina semanal y subida manual de semanas.

## Cómo funciona

1. **Claude envía las propuestas**: la rutina semanal de cada persona manda el Markdown de la semana
   (formato en [`PROPUESTAS.md`](./PROPUESTAS.md)) y sus imágenes a `/api/proposals` con su token.
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

## Arquitectura

- **Web** (Vite, `src/`): `backend.js` decide dónde se guardan los datos: Supabase con login
  (modo cuentas) o el navegador (modo local, sin las variables `VITE_SUPABASE_*`).
- **Funciones de Vercel** (`api/`, lógica en `server/handlers.js`):
  - `POST /api/generate`: genera un post con Claude. Exige sesión y aplica `AI_MONTHLY_LIMIT` por persona
    (si Claude falla, el intento no cuenta).
  - `POST /api/proposals?week=AAAA-Www[&file=…]`: recibe el Markdown y los archivos de la rutina semanal,
    autenticada con el token personal de cada usuario.
  - `POST /api/digest`: genera con Claude las propuestas de una semana con los temas guardados de la persona
    (sesión + `AI_MONTHLY_LIMIT`, un crédito por propuesta). Devuelve el Markdown, que la web guarda como semana.
  - `GET /api/topics`: los temas del digest de la persona del token, en JSON y como texto (`brief`).
- **Supabase** (`supabase/schema.sql`): tablas con seguridad por usuario y Storage para archivos.
  `supabase/tests/` prueba que cada usuario solo accede a lo suyo.
- `scripts/upload-week.mjs`: sube una semana desde una carpeta local con el token de una persona.

Variables de entorno: ver [`.env.example`](./.env.example) y [SETUP.md](./SETUP.md).

La carpeta `propuestas/` del repositorio queda como archivo de las primeras semanas: ya no se incluye en la web.
