
-- BOF Video Batches
CREATE TABLE public.bof_video_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_name text NOT NULL,
  product_image_url text NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  selected_formats jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bof_video_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User insert bof_video_batches" ON public.bof_video_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read bof_video_batches" ON public.bof_video_batches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update bof_video_batches" ON public.bof_video_batches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- BOF Video Variants
CREATE TABLE public.bof_video_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.bof_video_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  format_id text NOT NULL,
  script_text text DEFAULT '',
  visual_prompt text DEFAULT '',
  generated_image_url text DEFAULT '',
  raw_video_url text DEFAULT '',
  voice_audio_url text DEFAULT '',
  final_video_url text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  error_message text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bof_video_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User insert bof_video_variants" ON public.bof_video_variants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User read bof_video_variants" ON public.bof_video_variants FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User update bof_video_variants" ON public.bof_video_variants FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
