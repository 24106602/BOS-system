alter table public.user_profiles
add column if not exists login_email text;

update public.user_profiles
set login_email = case
  when role = 'admin' then 'admin@bos.local'
  when role = 'college' and college_name = '外国语学院' then 'wgyxy@bos.local'
  when role = 'college' and college_name = '艺术与设计学院' then 'yssjxy@bos.local'
  when role = 'college' and college_name = '人文学院' then 'rwxy@bos.local'
  when role = 'college' and college_name = '理学院' then 'lxy@bos.local'
  when role = 'college' and college_name = '经济与管理学院' then 'jjglxy@bos.local'
  when role = 'college' and college_name = '香精香料化妆品学部' then 'xjxlhzp@bos.local'
  when role = 'college' and college_name = '材料技术学部' then 'cljsxb@bos.local'
  when role = 'college' and college_name = '化工与能源技术学部' then 'hgyjsxb@bos.local'
  when role = 'college' and college_name = '城建学院' then 'cjxy@bos.local'
  when role = 'college' and college_name = '生态学院' then 'stxy@bos.local'
  when role = 'college' and college_name = '智能技术学部' then 'znjsxb@bos.local'
  else login_email
end
where role = 'admin'
   or (
    role = 'college'
    and college_name in (
      '外国语学院',
      '艺术与设计学院',
      '人文学院',
      '理学院',
      '经济与管理学院',
      '香精香料化妆品学部',
      '材料技术学部',
      '化工与能源技术学部',
      '城建学院',
      '生态学院',
      '智能技术学部'
    )
  );
