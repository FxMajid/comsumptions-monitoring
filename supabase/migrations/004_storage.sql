-- Private bucket for invoice and payment proof images.
--
-- Guarded because the storage schema only exists on Supabase; the local
-- validation database does not have it and should skip this file cleanly.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage schema not present, skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'receipts',
    'receipts',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Objects are reachable only through a signed URL minted server-side, and
  -- only finance roles can write. The bucket stays private so a leaked path is
  -- not a leaked document.
  execute 'drop policy if exists receipts_read_consumption_roles on storage.objects';
  execute $p$
    create policy receipts_read_consumption_roles
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'receipts'
      and public.current_role_text() in (
        'ADMIN', 'CONSUMPTION_MANAGER', 'MANAGEMENT'
      )
    )
  $p$;

  execute 'drop policy if exists receipts_write_finance_roles on storage.objects';
  execute $p$
    create policy receipts_write_finance_roles
    on storage.objects
    for all
    to authenticated
    using (
      bucket_id = 'receipts'
      and public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER')
    )
    with check (
      bucket_id = 'receipts'
      and public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER')
    )
  $p$;
end $$;
