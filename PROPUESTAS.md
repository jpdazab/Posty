# Formato de las propuestas semanales

Cada semana Claude agrega **un archivo** en la carpeta `propuestas/` llamado
`AAAA-Www.md` (semana ISO), por ejemplo `propuestas/2026-W40.md`.
Al hacer push, la plataforma lo muestra automáticamente.

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
  `dia` (AAAA-MM-DD), `hora` (HH:MM), `pilar`, `objetivo`, `formato`, `imagen`, `hashtags`.
- Después de una línea en blanco va el **texto exacto del post**.
- `hashtags` se añaden al final del post al copiar/publicar (si no están ya en el texto).
- Máximo 3.000 caracteres por post (límite de LinkedIn); la plataforma avisa si se excede.
- Recomendado: 3–5 posts por semana, con la primera línea (≈210 caracteres) como gancho,
  porque es lo que LinkedIn muestra antes de "ver más".
- No usar `## ` dentro del texto de un post (se interpretaría como un post nuevo).
