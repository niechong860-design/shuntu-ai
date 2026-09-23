-- Configurable recharge center packages.
-- This table only stores display metadata and external purchase links.
-- It does not grant credits or represent payment success.

CREATE TABLE public.recharge_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  price text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  badge_text text,
  is_popular boolean NOT NULL DEFAULT false,
  highlighted boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  button_text text NOT NULL DEFAULT '立即购买',
  purchase_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recharge_packages_credits_nonnegative CHECK (credits >= 0),
  CONSTRAINT recharge_packages_features_array CHECK (jsonb_typeof(features) = 'array'),
  CONSTRAINT recharge_packages_purchase_url_http CHECK (
    purchase_url IS NULL
    OR btrim(purchase_url) = ''
    OR purchase_url ~* '^https?://'
  )
);

ALTER TABLE public.recharge_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY recharge_packages_public_read_visible ON public.recharge_packages
  FOR SELECT TO public
  USING (is_visible = true);

CREATE POLICY recharge_packages_admin_all ON public.recharge_packages
  FOR ALL TO authenticated
  USING (public.has_admin_access(auth.uid()))
  WITH CHECK (public.has_admin_access(auth.uid()));

CREATE TRIGGER recharge_packages_set_updated_at
  BEFORE UPDATE ON public.recharge_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.recharge_packages (
  title,
  subtitle,
  price,
  credits,
  features,
  badge_text,
  is_popular,
  highlighted,
  is_visible,
  sort_order,
  button_text,
  purchase_url
) VALUES
  (
    '试用套餐',
    '适合偶尔体验的尝鲜用户',
    '9.9',
    1000,
    '["1,000 积分", "基础图像模型", "标准排队速度"]'::jsonb,
    NULL,
    false,
    false,
    true,
    10,
    '立即购买',
    'https://www.kufaka.com/item/dhmljk'
  ),
  (
    '入门套餐',
    '轻量级创作者的首选',
    '29.9',
    3000,
    '["3,000 积分", "所有基础模型", "标准排队速度"]'::jsonb,
    NULL,
    false,
    false,
    true,
    20,
    '立即购买',
    'https://www.kufaka.com/item/661nyd'
  ),
  (
    '主力套餐',
    '性价比之王，适合日常创作',
    '69.9',
    7000,
    '["7,000 积分", "解锁高级模型 (Wan2.6/Pro)", "优先生成队列"]'::jsonb,
    '最受欢迎',
    true,
    true,
    true,
    30,
    '立即购买',
    'https://www.kufaka.com/item/2tig9e'
  ),
  (
    '专业套餐',
    '为高频重度使用者打造',
    '129',
    13000,
    '["13,000 积分", "全模型无限制访问", "极速极享队列", "专属客服支持"]'::jsonb,
    NULL,
    false,
    false,
    true,
    40,
    '立即购买',
    'https://www.kufaka.com/item/fk4jmd'
  ),
  (
    '高端套餐',
    '工作室与商业变现必备',
    '199',
    20000,
    '["20,000 积分", "最高优先级算力", "支持 API 批量调用", "客服24小时在线服务"]'::jsonb,
    NULL,
    false,
    false,
    true,
    50,
    '立即购买',
    'https://www.kufaka.com/item/9a7qf1'
  );
