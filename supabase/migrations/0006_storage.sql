-- Sthamly: Storage buckets और access rules (Phase 1)
-- नियम:
--   * दोनों buckets private हैं (public नहीं)
--   * हर फाइल का पाथ `user_id/...` से शुरू होता है
--   * यूज़र सिर्फ अपने folder की फाइलें देख और बदल सकता है
--   * outputs में upload सिर्फ worker (service role) करता है, इसलिए उसकी insert policy नहीं

-- 1. Buckets (पहले से हों तो कुछ नहीं बदलता)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('shop-photos', 'shop-photos', false, 10485760, array['image/jpeg', 'image/png']),
  ('outputs', 'outputs', false, 16777216, array['image/png', 'video/mp4'])
on conflict (id) do nothing;

-- 2. shop-photos: यूज़र अपने folder में upload, देखे और हटाए
drop policy if exists "shop_photos_insert_own" on storage.objects;
create policy "shop_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'shop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shop_photos_select_own" on storage.objects;
create policy "shop_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'shop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "shop_photos_delete_own" on storage.objects;
create policy "shop_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'shop-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. outputs: यूज़र सिर्फ अपने folder के poster देखे
--    (signed URL worker बनाता है, वह service role से होता है और policy से बंधा नहीं)
drop policy if exists "outputs_select_own" on storage.objects;
create policy "outputs_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'outputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );