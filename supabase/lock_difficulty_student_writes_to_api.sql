-- 在困难生 API 已部署且 SUPABASE_SERVICE_ROLE_KEY 已仅配置于服务端后执行。
-- 目的：禁止浏览器绕过 API 状态守卫直接修改 public.students。

begin;

do $$
begin
  if to_regclass('public.students') is null then
    raise exception 'public.students 表不存在';
  end if;
end
$$;

revoke insert, update, delete on table public.students from anon;
revoke insert, update, delete on table public.students from authenticated;

-- 保留登录用户读取权限；可见行仍由现有 RLS 策略控制。
grant select on table public.students to authenticated;

comment on table public.students is
  '困难生主表；写操作必须通过受 JWT 保护的后端 API 和状态守卫执行';

commit;
