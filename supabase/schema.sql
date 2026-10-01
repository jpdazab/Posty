-- Posty: esquema de la base de datos en Supabase.
-- Cómo usarlo: en el panel de Supabase → SQL Editor → pega este archivo completo → Run.
-- Se puede ejecutar más de una vez sin romper nada.
--
-- Cada usuario solo ve y modifica sus propios datos (Row Level Security).
-- Las rutinas semanales escriben propuestas a través de /api/proposals con un token por usuario.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------

-- Propuestas semanales (AI Digest): una fila por semana, con el Markdown en formato PROPUESTAS.md.
-- Las imágenes de cada semana viven en Storage: assets/<user_id>/weeks/<semana>/<archivo>.
create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week text not null,
  source text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, week)
);

-- Estado de cada propuesta (pendiente, aprobado, publicado, ediciones…).
create table if not exists public.post_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- Posts hechos en "Crear post".
create table if not exists public.created_posts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Kit de diseño de cada usuario (colores, tipografías, firma, plantillas propias).
-- Los archivos (fuentes, logo, fondos) están en Storage: assets/<user_id>/kit/<id>.
create table if not exists public.kits (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Temas del AI Digest de cada usuario: los lee su rutina semanal (GET /api/topics) antes de preparar la semana.
create table if not exists public.digest_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Posts generados con Claude por mes, para aplicar el límite mensual.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  count integer not null default 0,
  primary key (user_id, month)
);

-- Token de la rutina semanal de cada usuario (solo se guarda su hash).
create table if not exists public.ingest_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Seguridad: cada usuario solo accede a lo suyo ----------

alter table public.weeks enable row level security;
alter table public.post_states enable row level security;
alter table public.created_posts enable row level security;
alter table public.kits enable row level security;
alter table public.digest_settings enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ingest_tokens enable row level security;

drop policy if exists "posty: propias" on public.weeks;
create policy "posty: propias" on public.weeks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "posty: propias" on public.post_states;
create policy "posty: propias" on public.post_states for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "posty: propias" on public.created_posts;
create policy "posty: propias" on public.created_posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "posty: propias" on public.kits;
create policy "posty: propias" on public.kits for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "posty: propias" on public.digest_settings;
create policy "posty: propias" on public.digest_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- El uso de IA y el token solo se leen; se escriben con las funciones de abajo.
drop policy if exists "posty: leer propio" on public.ai_usage;
create policy "posty: leer propio" on public.ai_usage for select to authenticated using (user_id = auth.uid());

drop policy if exists "posty: leer propio" on public.ingest_tokens;
create policy "posty: leer propio" on public.ingest_tokens for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.ai_usage, public.ingest_tokens from anon, authenticated;

-- ---------- Funciones ----------

-- Crea (o reemplaza) el token de la rutina del usuario actual. Devuelve el token una sola vez.
create or replace function public.create_ingest_token()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t text;
begin
  if auth.uid() is null then
    raise exception 'No has iniciado sesión';
  end if;
  t := 'posty_' || encode(gen_random_bytes(24), 'hex');
  insert into public.ingest_tokens (user_id, token_hash)
  values (auth.uid(), encode(digest(t, 'sha256'), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return t;
end;
$$;

revoke all on function public.create_ingest_token() from public, anon;
grant execute on function public.create_ingest_token() to authenticated;

-- Suma un post generado al mes en curso si no se ha llegado al límite.
-- Devuelve el total del mes, o null si ya se alcanzó el límite. Solo la llama el servidor.
create or replace function public.consume_ai_credit(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  c integer;
begin
  if p_limit <= 0 then
    return null;
  end if;
  insert into public.ai_usage as u (user_id, month, count)
  values (p_user, m, 1)
  on conflict (user_id, month) do update set count = u.count + 1
  where u.count < p_limit
  returning u.count into c;
  return c;
end;
$$;

revoke all on function public.consume_ai_credit(uuid, integer) from public, anon, authenticated;

-- ---------- Archivos (Storage) ----------

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- Cada usuario solo usa su carpeta: assets/<user_id>/...
drop policy if exists "posty: leer mis archivos" on storage.objects;
create policy "posty: leer mis archivos" on storage.objects for select to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "posty: subir mis archivos" on storage.objects;
create policy "posty: subir mis archivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "posty: cambiar mis archivos" on storage.objects;
create policy "posty: cambiar mis archivos" on storage.objects for update to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "posty: borrar mis archivos" on storage.objects;
create policy "posty: borrar mis archivos" on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

-- Devuelve un crédito si la generación falló (para no cobrar intentos fallidos). Solo la llama el servidor.
create or replace function public.refund_ai_credit(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage set count = greatest(count - 1, 0)
  where user_id = p_user and month = to_char(now() at time zone 'utc', 'YYYY-MM');
$$;

revoke all on function public.refund_ai_credit(uuid) from public, anon, authenticated;
