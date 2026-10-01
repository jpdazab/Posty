# Posty

Panel para revisar, organizar y publicar en LinkedIn los posts que prepara Claude. Tiene dos páginas
en el menú lateral:

- **AI Digest**: las propuestas semanales (ver abajo).
- **Crear post**: escribes en texto libre de qué quieres hablar, eliges **carrusel** o **card**, y Claude
  genera ahí mismo el texto del post y la gráfica. Puedes editar el texto, descargar la gráfica en PNG
  (o el carrusel en PDF para LinkedIn) y publicarlo. Los últimos 20 posts creados quedan guardados en el navegador.

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

## Generador de posts (Crear post)

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
