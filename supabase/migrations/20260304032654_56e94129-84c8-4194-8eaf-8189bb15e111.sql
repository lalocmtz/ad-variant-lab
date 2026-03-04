INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true);

CREATE POLICY "Public read access on videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'videos');

CREATE POLICY "Service role insert on videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'videos');