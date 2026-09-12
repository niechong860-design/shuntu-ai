UPDATE recharge_packages
SET title = '轻享体验版', subtitle = '适合首次体验与偶尔创作', price = '19.9', credits = 200000,
    features = '["2,000 积分","低门槛体验","适合首次尝试"]', badge_text = '新客体验',
    is_popular = 0, highlighted = 0, is_visible = 1, sort_order = 10,
    button_text = '立即体验', purchase_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = 'b5c1dce9-6742-4340-9149-93cee49a1e12';

UPDATE recharge_packages
SET title = '灵感创作版', subtitle = '适合日常轻度创作', price = '69.9', credits = 800000,
    features = '["7,000 基础积分","赠送 1,000 积分","实际到账 8,000 积分"]', badge_text = '入门推荐',
    is_popular = 0, highlighted = 0, is_visible = 1, sort_order = 20,
    button_text = '立即升级', purchase_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = '52d12003-fc30-4705-8daa-ceaf18d15915';

UPDATE recharge_packages
SET title = '进阶创作版', subtitle = '适合稳定创作与频繁出图', price = '169', credits = 2400000,
    features = '["17,000 基础积分","赠送 7,000 积分","实际到账 24,000 积分"]', badge_text = '超值升级',
    is_popular = 0, highlighted = 0, is_visible = 1, sort_order = 30,
    button_text = '立即升级', purchase_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = 'aaaa2b94-855c-4b2a-b6ea-e149fd15c834';

UPDATE recharge_packages
SET title = '专业创作版', subtitle = '适合高频创作与长期使用', price = '229', credits = 4000000,
    features = '["23,000 基础积分","赠送 17,000 积分","实际到账 40,000 积分"]', badge_text = '最受欢迎',
    is_popular = 1, highlighted = 1, is_visible = 1, sort_order = 40,
    button_text = '立即购买', purchase_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = 'be1e3e6d-b5a1-41ff-82d4-dca10da91a59';

UPDATE recharge_packages
SET title = '工作室版', subtitle = '适合重度创作与小型团队', price = '319', credits = 6000000,
    features = '["32,000 基础积分","赠送 28,000 积分","实际到账 60,000 积分"]', badge_text = '专业推荐',
    is_popular = 0, highlighted = 0, is_visible = 1, sort_order = 50,
    button_text = '选择工作室版', purchase_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = '73d892b5-b0d4-4c19-a588-fccde05b6792';

INSERT INTO recharge_packages (
  id, title, subtitle, price, credits, features, badge_text, is_popular, highlighted,
  is_visible, sort_order, button_text, purchase_url
) SELECT
  '41bec294-6d11-4593-94d3-07181afb69e6', '企业旗舰版', '适合团队、批量生成与商业项目', '489', 9800000,
  '["49,000 基础积分","赠送 49,000 积分","实际到账 98,000 积分","赠送比例 100%"]',
  '企业优选', 0, 0, 1, 60, '选择企业旗舰版', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM recharge_packages WHERE id = '41bec294-6d11-4593-94d3-07181afb69e6'
);
