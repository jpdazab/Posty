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
5. **Código en el email** (para entrar escribiendo un código, aunque el enlace falle):
   en **Authentication → Emails → Templates**, edita **Magic Link** y también **Confirm signup**
   e **Invite user**, y añade esta línea al cuerpo (sin quitar el enlace):

   ```html
   <p>O escribe este código en Posty: <strong>{{ .Token }}</strong></p>
   ```

   Guarda cada plantilla.

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
Cada una recibe un email; desde ahí, o desde la pantalla de Posty (escribe su email → "Continuar"), entra sin contraseña
con el enlace o con el código del email.

**Si el enlace abre una página que no carga (por ejemplo `localhost:3000`)**: la *Site URL* y las
*Redirect URLs* del paso 2.3 no tienen la dirección de Vercel. Mientras tanto, el código del email funciona igual.

### Entrar con contraseña (si los emails no llegan)

Posty también deja entrar con **email y contraseña** (pestaña *Contraseña* en la pantalla de acceso).
Cada persona puede ponerse una en **Cuenta → Contraseña** después de entrar. Si alguien no puede
entrar porque no le llega el código, dale una contraseña desde Supabase:

- **Persona nueva**: *Authentication → Users → Add user → Create new user*, con email, contraseña y
  *Auto Confirm User* marcado (no envía ningún email).
- **Persona que ya existe**: en *SQL Editor*, cambia el email y la contraseña y pulsa *Run*:

  ```sql
  update auth.users
  set encrypted_password = extensions.crypt('una-contraseña-segura', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where email = 'persona@ejemplo.com';
  ```

  Pásale la contraseña por un canal privado y que la cambie en *Cuenta → Contraseña*.

Para quitar el acceso a alguien: **Authentication → Users → ⋯ → Delete user** (borra también sus datos).

## 6. Conectar la rutina semanal de cada persona

Cada persona, dentro de Posty:

1. **Cuenta → Crear token** y **Copiar instrucciones para la rutina**.
2. Pega esas instrucciones en su rutina de Claude (la tarea programada que prepara sus posts),
   en lugar de cualquier paso que guarde las propuestas en el repositorio.

Antes de preparar cada semana, la rutina lee los **temas** que la persona eligió en Posty
(AI Digest → *Tus temas*) con `GET https://<tu-posty>/api/topics` y el mismo token.

La rutina envía el Markdown de la semana (formato de [`PROPUESTAS.md`](./PROPUESTAS.md)) y sus imágenes a
`https://<tu-posty>/api/proposals`. Si alguien crea un token nuevo, el anterior deja de funcionar
y hay que actualizar su rutina.

Sin rutina también se puede: **Cuenta → Subir una semana a mano** (el `.md` y sus imágenes).

## 6b. Conectar Claude (sin API)

Cada persona puede usar su propio Claude (cualquier plan; el gratuito admite un solo conector personalizado) para trabajar con Posty
desde el chat de Claude, sin gastar la API:

1. En Posty: **Cuenta → Conectar con Claude → Crear token** y **Copiar dirección del conector**
   (`https://<tu-posty>/api/mcp?token=…`). La dirección lleva el token: no se comparte.
2. En Claude: **Ajustes → Conectores → Añadir conector personalizado**, nombre `Posty` y esa dirección.
3. En un chat, activa Posty y pide, por ejemplo: *"Prepara mis propuestas de la semana que viene con mis
   temas de Posty"* o *"Crea un post con mi plantilla Dato del día sobre…"*.

Las propuestas aparecen en el AI Digest y los posts con diseño en Crear post (al volver a la pestaña de
Posty se actualiza solo). El token es el mismo de la rutina semanal: si se crea uno nuevo, hay que
actualizar el conector y la rutina.

## 7. Pasar las semanas que ya existen (opcional)

Las semanas guardadas en la carpeta `propuestas/` del repositorio ya no se muestran solas.
Para pasarlas a una cuenta, desde Posty: **Cuenta → Subir una semana a mano** y elige el `.md`
con todas las imágenes de su carpeta. O desde una terminal, con el token de esa persona:

```bash
POSTY_URL=https://<tu-posty> POSTY_TOKEN=posty_... node scripts/upload-week.mjs propuestas/2026-W41.md
```

---

## Actualizar Posty

Cuando una versión nueva de Posty añade tablas (por ejemplo, los temas del digest), vuelve a ejecutar
[`supabase/schema.sql`](./supabase/schema.sql) completo en **SQL Editor → Run**. Se puede ejecutar
varias veces: no borra datos.

## Qué guarda cada sitio

| Dónde | Qué |
| --- | --- |
| Supabase · tablas | Semanas (`weeks`), temas del digest (`digest_settings`), estado de cada propuesta (`post_states`), posts creados (`created_posts`), kit de diseño (`kits`), uso de Claude (`ai_usage`), tokens de rutina (`ingest_tokens`) |
| Supabase · Storage (`assets/<usuario>/…`) | Imágenes y PDF de las semanas, fuentes, logos y fondos de plantillas |
| Vercel | La web y las funciones `/api/generate` y `/api/proposals` |

Cada persona solo puede leer y modificar sus propios datos (Row Level Security); las pruebas están en
`supabase/tests/`.

## Desarrollo sin Supabase

Sin las variables `VITE_SUPABASE_*`, Posty arranca en **modo local**: sin login y guardando todo en el
navegador. Útil para probar cambios con `npm run dev`.
