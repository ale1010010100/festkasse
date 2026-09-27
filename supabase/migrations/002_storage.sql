-- =====================================================================
-- FestKasse – Speicher für Produktfotos
-- Nach 001_schema.sql im «SQL Editor» ausführen.
-- Fotos liegen unter  product-photos/<club_id>/<datei>.jpg
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

drop policy if exists "Fotos lesen" on storage.objects;
create policy "Fotos lesen" on storage.objects
  for select using (bucket_id = 'product-photos');

drop policy if exists "Fotos hochladen" on storage.objects;
create policy "Fotos hochladen" on storage.objects
  for insert with check (
    bucket_id = 'product-photos'
    and public.is_club_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Fotos ändern" on storage.objects;
create policy "Fotos ändern" on storage.objects
  for update using (
    bucket_id = 'product-photos'
    and public.is_club_owner(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Fotos löschen" on storage.objects;
create policy "Fotos löschen" on storage.objects
  for delete using (
    bucket_id = 'product-photos'
    and public.is_club_owner(((storage.foldername(name))[1])::uuid)
  );
