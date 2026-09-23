-- 给 5 个旧迁移账号设置临时密码: Shuntu@2026
UPDATE auth.users
SET encrypted_password = crypt('Shuntu@2026', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email IN (
  '2336067318@qq.com',
  '2177543133@qq.com',
  '956498688@qq.com',
  'www.1214851704@qq.com',
  'www.2635322620@qq.com'
);