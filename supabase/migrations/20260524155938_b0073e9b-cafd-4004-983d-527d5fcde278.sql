-- 删除旧的 grok_imagine / Wan2.6 配置
DELETE FROM public.models_config WHERE model_key IN ('grok_imagine', 'wan26', 'wan2.6');

-- 重新创建 grok_imagine（支持图生图）
INSERT INTO public.models_config (
  model_key, name, description, cost,
  api_url, api_key, request_format, prompt_key, fetch_url,
  extra_params, is_enabled, sort_order
) VALUES (
  'grok_imagine',
  'grok_imagine',
  'xAI · 极速高质量图像生成，支持参考图（图生图）',
  2,
  '/api/async/image_grok_imagine',
  NULL,
  'async_id',
  'prompt',
  NULL,
  '{"aspect_ratio": "{{grok_aspect}}", "image_urls": "{{urls}}"}'::jsonb,
  true,
  90
);

-- 重新创建 Wan2.6（仅文生图）
INSERT INTO public.models_config (
  model_key, name, description, cost,
  api_url, api_key, request_format, prompt_key, fetch_url,
  extra_params, is_enabled, sort_order
) VALUES (
  'wan26',
  'Wan2.6',
  '通义万相 2.6 · 仅支持文生图',
  2,
  '/api/async/image_wan2.6',
  NULL,
  'async_id',
  'prompt',
  NULL,
  '{"size": "{{wan_size}}", "prompt_extend": true}'::jsonb,
  true,
  95
);