# Posty

Panel para revisar, organizar y publicar en LinkedIn las propuestas semanales de posts que prepara Claude.

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

## Despliegue

Es un sitio estático (Vite). En Vercel o Netlify basta con importar el repositorio
(build: `npm run build`, salida: `dist`). Cada push con una propuesta nueva vuelve a
desplegar el sitio automáticamente.
