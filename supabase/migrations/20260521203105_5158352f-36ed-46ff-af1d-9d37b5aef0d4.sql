alter table public.admin_settings add column if not exists system_prompt text not null default '';

create table if not exists public.style_templates (
  id text primary key,
  name text not null,
  prompt text not null default '',
  image_url text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.style_templates enable row level security;

drop policy if exists "style_templates_read_auth" on public.style_templates;
create policy "style_templates_read_auth" on public.style_templates
  for select to authenticated using (true);

drop policy if exists "style_templates_admin_write" on public.style_templates;
create policy "style_templates_admin_write" on public.style_templates
  for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'founder'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'founder'));

insert into public.style_templates (id, name, prompt, sort_order) values
  ('none','无风格','',0),
  ('premium_ecom','高级电商','high-end e-commerce commercial photography, soft cinematic studio lighting, clean composition, premium glossy product feel, refined color grading, luxury advertising aesthetic',10),
  ('xhs','小红书','Xiaohongshu lifestyle photography, soft natural daylight, fresh airy atmosphere, pastel warm tones, cozy aesthetic background, instagrammable lifestyle styling',20),
  ('ins_minimal','INS极简','minimalist instagram aesthetic, lots of negative space, neutral muted palette, soft diffused lighting, clean geometric composition, editorial calm mood',30),
  ('white_ecom','白底电商','pure white seamless studio background, even soft box lighting, crisp clean shadows, commercial catalog product photography, sharp clear details',40),
  ('tech','科技质感','futuristic tech product photography, cool cyan and blue tones, sleek dark gradient background, sharp rim lighting, glowing accent highlights, premium hi-tech mood',50),
  ('trend_ad','潮流广告','trendy streetwear advertising poster, bold contrasting colors, dynamic playful composition, punchy saturated palette, modern editorial energy',60),
  ('jewelry','珠宝高级感','luxury jewelry photography, dark velvet backdrop, sparkling specular highlights, precise focused lighting, refined reflections, opulent premium mood',70),
  ('beauty','美妆海报','high-end beauty cosmetics poster, soft glowing skin-friendly lighting, silky smooth gradient background, elegant pastel or rose tones, dewy luxurious atmosphere',80),
  ('food','食品广告','appetizing food commercial photography, warm golden lighting, rich appetizing colors, mouthwatering textures, steam and freshness, premium culinary mood',90),
  ('shoes','鞋靴高级感','premium footwear advertising, dramatic directional lighting, dynamic shadow play, textured concrete or stone surface, hype sneaker editorial mood',100),
  ('outdoor','户外露营','outdoor camping lifestyle scene, natural golden hour sunlight, rugged mountain or forest environment, earthy organic tones, adventurous warm atmosphere',110),
  ('luxury_stage','奢侈品展台','luxury product display stage, marble or stone pedestal, museum-grade spotlight lighting, elegant deep background, sophisticated high-end gallery atmosphere',120),
  ('white_studio','极简白棚','minimal white studio set, soft wraparound lighting, gentle natural shadows, pure clean backdrop, refined minimalist product mood',130),
  ('dark_premium','暗黑高级感','dark moody premium product photography, deep black background, dramatic chiaroscuro lighting, rich shadows, cinematic luxurious atmosphere',140)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('admin-assets','admin-assets',true)
on conflict (id) do nothing;

drop policy if exists "admin_assets_public_read" on storage.objects;
create policy "admin_assets_public_read" on storage.objects
  for select using (bucket_id = 'admin-assets');

drop policy if exists "admin_assets_admin_insert" on storage.objects;
create policy "admin_assets_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'admin-assets' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'founder')));

drop policy if exists "admin_assets_admin_update" on storage.objects;
create policy "admin_assets_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'admin-assets' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'founder')));

drop policy if exists "admin_assets_admin_delete" on storage.objects;
create policy "admin_assets_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-assets' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'founder')));