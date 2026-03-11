
CREATE TABLE public.broll_lab_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  product_image_url text NOT NULL,
  product_url text DEFAULT '',
  tiktok_urls jsonb DEFAULT '[]'::jsonb,
  analysis jsonb DEFAULT '{}'::jsonb,
  scenes jsonb DEFAULT '[]'::jsonb,
  master_video_urls jsonb DEFAULT '[]'::jsonb,
  voice_variants jsonb DEFAULT '[]'::jsonb,
  variant_count integer DEFAULT 0,
  inputs jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.broll_lab_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User insert broll_lab_history"
  ON public.broll_lab_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User read broll_lab_history"
  ON public.broll_lab_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "User update broll_lab_history"
  ON public.broll_lab_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User delete broll_lab_history"
  ON public.broll_lab_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
