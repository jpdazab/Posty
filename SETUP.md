# Configurar Posty con cuentas (Supabase + Vercel)

Esta guía deja Posty funcionando para varias personas, cada una con su login, su AI Digest,
sus posts, su marca y su rutina semanal. Tiempo estimado: 30–45 minutos la primera vez.

Necesitas: una cuenta de [Supabase](https://supabase.com) (gratis), una de [Vercel](https://vercel.com)
(gratis) y, si quieres "Pedir a Claude", una API key de [Anthropic](https://console.anthropic.com).

---

## 1. Crear el proyecto de Supabase

1. En supabase.com → **New project**. Nombre: `posty`. Región: la más cercana (por ejemplo, *West EU* o *Central EU*).
   Guarda la contraseña de la base de datos en un sitio seguro (no la necesitarás para Posty).
2. Cuando termine de crearse, ve a **SQL Editor → New query**, pega el contenido completo de
   [`supabase/schema.sql`](./supabase/schema.sql) y pulsa **Run**. Debe terminar con "Success".
   Esto crea las tablas, la seguridad por usuario y la carpeta de archivos.

## 2. Configurar el acceso por email

1. **Authentication → Sign In / Providers → Email**: deja *Email* activado.
2. **Authentication → Settings** (o *Sign In / Providers*, según la versión del panel):
   desactiva **Allow new users to sign up**. Así solo entran las personas que invites.
3. **Authentication → URL Configuration**:
   - *Site URL*: la dirección de Posty en Vercel (por ejemplo `https://posty-juan.vercel.app`).
     Si aún no la tienes, vuelve aquí después del paso 4.
   - *Redirect URLs*: añade la misma dirección.
4. **Emails para las otras personas.** El servidor de email que trae Supabase solo envía a los
   miembros de tu equipo de Supabase y pocos correos por hora. Para que lleguen los enlaces a las
   otras dos personas, configura un SMTP propio en **Authentication → Emails → SMTP Settings**.
   La opción más simple es [Resend](https://resend.com) (gratis hasta 3.000 emails al mes):
   crea una cuenta, verifica tu dominio o usa su dominio de pruebas, crea una API key y copia
   en Supabase los datos SMTP que te da Resend (host `smtp.resend.com`, puerto `465`, usuario `resend`,
   contraseña = la API key).

## 3. Copiar las claves de Supabase

En **Project Settings → API** (o **API Keys**) copia:

| En Supabase | Variable en Vercel |
| --- | --- |
| Project URL | `VITE_SUPABASE_URL` |
| `anon` / *publishable* key | `VITE_SUPABASE_ANON_KEY` |
| `service_role` / *secret* key | `SUPABASE_SERVICE_ROLE_KEY` |

La clave *service_role* salta las reglas de seguridad: **solo va en Vercel**, nunca en el código ni en chats.

## 4. Publicar en Vercel

1. En vercel.com → **Add New → Project** → importa el repositorio `jpdazab/Posty`.
2. Vercel detecta Vite. En **Environment Variables** añade:

   | Variable | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | del paso 3 |
   | `VITE_SUPABASE_ANON_KEY` | del paso 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | del paso 3 |
   | `ANTHROPIC_API_KEY` | tu clave de console.anthropic.com (opcional: sin ella, "Pedir a Claude" no funciona) |
   | `AI_MONTHLY_LIMIT` | posts que cada persona puede generar con Claude al mes (por defecto `30`) |

3. **Deploy**. Copia la dirección que te da Vercel y ponla en el paso 2.3 si no lo hiciste.
   Si cambias variables más tarde, ve a **Deployments → ⋯ → Redeploy**.

## 5. Invitar a las personas

En Supabase → **Authentication → Users → Invite user** y escribe el email de cada persona (tú incluido).
Cada una recibe un email; desde ahí, o desde la pantalla de Posty ("Enviarme el enlace"), entra sin contraseña.

Para quitar el acceso a alguien: **Authentication → Users → ⋯ → Delete user** (borra también sus datos).

## 6. Conectar la rutina semanal de cada persona

Cada persona, dentro de Posty:

1. **Cuenta → Crear token** y **Copiar instrucciones para la rutina**.
2. Pega esas instrucciones en su rutina de Claude (la tarea programada que prepara sus posts),
   en lugar de cualquier paso que guarde las propuestas en el repositorio.

La rutina envía el Markdown de la semana (formato de [`PROPUESTAS.md`](./PROPUESTAS.md)) y sus imágenes a
`https://<tu-posty>/api/proposals`. Si alguien crea un token nuevo, el anterior deja de funcionar
y hay que actualizar su rutina.

Sin rutina también se puede: **Cuenta → Subir una semana a mano** (el `.md` y sus imágenes).

## 7. Pasar las semanas que ya existen (opcional)

Las semanas guardadas en la carpeta `propuestas/` del repositorio ya no se muestran solas.
Para pasarlas a una cuenta, desde Posty: **Cuenta → Subir una semana a mano** y elige el `.md`
con todas las imágenes de su carpeta. O desde una terminal, con el token de esa persona:

```bash
POSTY_URL=https://<tu-posty> POSTY_TOKEN=posty_... node scripts/upload-week.mjs propuestas/2026-W41.md
```

---

## Qué guarda cada sitio

| Dónde | Qué |
| --- | --- |
| Supabase · tablas | Semanas (`weeks`), estado de cada propuesta (`post_states`), posts creados (`created_posts`), kit de diseño (`kits`), uso de Claude (`ai_usage`), tokens de rutina (`ingest_tokens`) |
| Supabase · Storage (`assets/<usuario>/…`) | Imágenes y PDF de las semanas, fuentes, logos y fondos de plantillas |
| Vercel | La web y las funciones `/api/generate` y `/api/proposals` |

Cada persona solo puede leer y modificar sus propios datos (Row Level Security); las pruebas están en
`supabase/tests/`.

## Desarrollo sin Supabase

Sin las variables `VITE_SUPABASE_*`, Posty arranca en **modo local**: sin login y guardando todo en el
navegador. Útil para probar cambios con `npm run dev`.
