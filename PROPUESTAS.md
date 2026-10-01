# Formato de las propuestas semanales

Cada semana la rutina de Claude de cada persona envía **un archivo Markdown** por semana (semana ISO,
por ejemplo `2026-W42`) y sus imágenes a `/api/proposals` con su token (ver `SETUP.md`, paso 6).
También se puede subir a mano desde Posty → Cuenta.

```markdown
---
semana: 2026-W40
inicio: 2026-09-28
tema: Tema o hilo conductor de la semana
notas: Comentario opcional para el autor (contexto, fuentes, sugerencias)
---

## Título interno del post (no se publica)
dia: 2026-09-29
hora: 08:30
pilar: Liderazgo
objetivo: Conversación
formato: Texto + imagen
imagen: Descripción de la imagen o carrusel sugerido
hashtags: #Liderazgo #IA
imagenes: lun-1.jpg, lun-2.jpg, lun-3.jpg
pdf: lun-carrusel.pdf
inspiracion: Tendencia: debate en r/UXDesign sobre X · Granola: charla de Y en Z
fuentes: https://ejemplo.com/articulo https://otra-fuente.com/post

Primera línea con gancho fuerte.

Desarrollo del post, tal cual se publicará en LinkedIn.
Se respetan saltos de línea y emojis.

¿Pregunta final para generar conversación?

## Segundo post
dia: 2026-10-01
...
```

## Reglas

- Frontmatter (`---`) con `semana` obligatoria; `inicio`, `tema` y `notas` opcionales.
- Cada post empieza con `## Título`. El título solo sirve para organizarse.
- Justo debajo del título, metadatos opcionales `clave: valor`. Claves válidas:
  `dia` (AAAA-MM-DD), `hora` (HH:MM), `pilar`, `objetivo`, `formato`, `imagen` (descripción), `hashtags`,
  `imagenes`, `pdf`, `inspiracion`, `fuentes`.
- Después de una línea en blanco va el **texto exacto del post**.
- `hashtags` se añaden al final del post al copiar/publicar (si no están ya en el texto).
- Máximo 3.000 caracteres por post (límite de LinkedIn); la plataforma avisa si se excede.
- Recomendado: 3–5 posts por semana, con la primera línea (≈210 caracteres) como gancho,
  porque es lo que LinkedIn muestra antes de "ver más".
- No usar `## ` dentro del texto de un post (se interpretaría como un post nuevo).

## Imágenes y PDF

- Las gráficas se envían aparte, una petición por archivo (`?week=2026-W42&file=lun-1.png`), con el
  mismo nombre que aparece en `imagenes:` o `pdf:`. Máximo 4 MB por archivo.
- `imagenes:` lista de archivos separados por comas, en el orden del carrusel
  (formatos: jpg, png, webp). Recomendado JPEG calidad ~88 para que el repo no crezca demasiado.
- `pdf:` el PDF del carrusel (LinkedIn publica los carruseles como documento).
- `inspiracion:` una línea con la tendencia y/o la nota que inspiró el post.
- `fuentes:` URLs separadas por espacios.
- Si un archivo no existe, Posty lo marca en rojo en la tarjeta.
