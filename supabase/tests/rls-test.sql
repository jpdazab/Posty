-- Pruebas de seguridad: cada usuario solo ve lo suyo. Falla con ERROR si algo no cuadra.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

-- Usuario A crea datos
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.weeks (week, source) values ('2026-W42', '---\nsemana: 2026-W42\n---');
insert into public.post_states (post_id, data) values ('2026-W42-1', '{"status":"publicado"}');
insert into public.created_posts (id, data) values ('p1', '{"title":"A"}');
insert into public.kits (data) values ('{"theme":{}}');
insert into public.digest_settings (data) values ('{"topics":[{"name":"Liderazgo"}]}');
insert into storage.objects (bucket_id, name) values ('assets', '00000000-0000-0000-0000-00000000000a/kit/logo');
select public.create_ingest_token() as token \gset
do $$ begin if (select count(*) from public.ingest_tokens) <> 1 then raise exception 'A debe ver su token'; end if; end $$;

-- A no puede escribir en nombre de B
do $$ begin
  begin
    insert into public.weeks (user_id, week, source) values ('00000000-0000-0000-0000-00000000000b', 'x', 'x');
    raise exception 'A pudo escribir como B';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('assets', '00000000-0000-0000-0000-00000000000b/kit/x');
    raise exception 'A pudo subir a la carpeta de B';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ai_usage (user_id, month, count) values (auth.uid(), '2026-10', -100);
    raise exception 'A pudo tocar su contador de IA';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_ai_credit(auth.uid(), 999);
    raise exception 'A pudo llamar a consume_ai_credit';
  exception when insufficient_privilege then null; end;
  begin
    perform public.refund_ai_credit(auth.uid());
    raise exception 'A pudo llamar a refund_ai_credit';
  exception when insufficient_privilege then null; end;
end $$;

-- Usuario B no ve nada de A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from public.weeks) + (select count(*) from public.post_states) + (select count(*) from public.created_posts)
     + (select count(*) from public.kits) + (select count(*) from public.digest_settings) + (select count(*) from public.ingest_tokens) + (select count(*) from storage.objects) <> 0
  then raise exception 'B ve datos de A'; end if;
  update public.weeks set source = 'hackeado';
  delete from public.created_posts;
  update public.digest_settings set data = '{}';
end $$;
reset role;
do $$ begin
  if (select source from public.weeks) = 'hackeado' or (select count(*) from public.created_posts) <> 1
     or (select data->'topics'->0->>'name' from public.digest_settings) <> 'Liderazgo' then raise exception 'B modificó datos de A'; end if;
end $$;

-- Límite mensual de IA (lo usa el servidor con service_role)
set role service_role;
do $$ declare r int; begin
  if public.consume_ai_credit('00000000-0000-0000-0000-00000000000a', 2) <> 1 then raise exception 'primer crédito'; end if;
  if public.consume_ai_credit('00000000-0000-0000-0000-00000000000a', 2) <> 2 then raise exception 'segundo crédito'; end if;
  r := public.consume_ai_credit('00000000-0000-0000-0000-00000000000a', 2);
  if r is not null then raise exception 'el límite no se aplicó (%)', r; end if;
  if public.consume_ai_credit('00000000-0000-0000-0000-00000000000b', 2) <> 1 then raise exception 'B tiene su propio contador'; end if;
  perform public.refund_ai_credit('00000000-0000-0000-0000-00000000000a');
  if public.consume_ai_credit('00000000-0000-0000-0000-00000000000a', 2) <> 2 then raise exception 'la devolución no liberó un crédito'; end if;
end $$;
-- El hash del token coincide con sha256(token)
select count(*) = 1 as token_ok from public.ingest_tokens where token_hash = encode(sha256(convert_to(:'token', 'UTF8')), 'hex') \gset
\if :token_ok
\else
  select 1/0 as token_hash_no_coincide;
\endif
reset role;
select 'RLS OK' as resultado;
