CREATE POLICY "Signed-in users read published gallery versions" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'gallery'::text) AND private.is_published_gallery_object(name)));
