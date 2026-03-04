
-- Brands table
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  colors jsonb DEFAULT '[]'::jsonb,
  fonts jsonb DEFAULT '[]'::jsonb,
  brand_intelligence text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);
CREATE POLICY "Public insert brands" ON public.brands FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update brands" ON public.brands FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete brands" ON public.brands FOR DELETE USING (true);

-- Brand assets table
CREATE TABLE public.brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'product_image',
  image_url text NOT NULL,
  storage_path text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read brand_assets" ON public.brand_assets FOR SELECT USING (true);
CREATE POLICY "Public insert brand_assets" ON public.brand_assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete brand_assets" ON public.brand_assets FOR DELETE USING (true);

-- Ad templates table
CREATE TABLE public.ad_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ad_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read ad_templates" ON public.ad_templates FOR SELECT USING (true);
CREATE POLICY "Public insert ad_templates" ON public.ad_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete ad_templates" ON public.ad_templates FOR DELETE USING (true);

-- Customer profiles table
CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  age_range text,
  pain_points text,
  desires text,
  messaging_angle jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read customer_profiles" ON public.customer_profiles FOR SELECT USING (true);
CREATE POLICY "Public insert customer_profiles" ON public.customer_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update customer_profiles" ON public.customer_profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete customer_profiles" ON public.customer_profiles FOR DELETE USING (true);

-- Campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  template_id uuid REFERENCES public.ad_templates(id),
  asset_id uuid REFERENCES public.brand_assets(id),
  status text DEFAULT 'draft',
  cta text,
  aspect_ratio text DEFAULT '1:1',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read campaigns" ON public.campaigns FOR SELECT USING (true);
CREATE POLICY "Public insert campaigns" ON public.campaigns FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update campaigns" ON public.campaigns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete campaigns" ON public.campaigns FOR DELETE USING (true);

-- Campaign ads table
CREATE TABLE public.campaign_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  profile_id uuid REFERENCES public.customer_profiles(id),
  prompt text,
  image_url text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.campaign_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read campaign_ads" ON public.campaign_ads FOR SELECT USING (true);
CREATE POLICY "Public insert campaign_ads" ON public.campaign_ads FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update campaign_ads" ON public.campaign_ads FOR UPDATE USING (true) WITH CHECK (true);
