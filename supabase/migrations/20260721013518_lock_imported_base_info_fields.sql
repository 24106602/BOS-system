-- 院系基础信息与辅导员/学院账号导入后不可原地修改的字段约束。
-- 删除统一使用 disabled 状态；disabled -> active 仅允许由重新导入流程执行。

begin;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  department_name text not null,
  school_name text not null default '上海应用技术大学',
  department_type text not null default '本专科',
  contact_person text,
  contact_phone text,
  login_account text not null,
  contact_address text,
  contact_postcode text,
  contact_fax text,
  sort_order integer not null,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_sort_order_positive check (sort_order > 0),
  constraint departments_contact_phone_format check (
    contact_phone is null or contact_phone = '' or contact_phone ~ '^1[3-9][0-9]{9}$'
  )
);

comment on table public.departments is
  '院系基础信息。删除为 status=disabled；重新导入可恢复或重建记录。';
comment on column public.departments.department_name is '导入后不可原地修改；需软删除后重新导入。';
comment on column public.departments.contact_phone is '导入后不可原地修改；需软删除后重新导入。';
comment on column public.departments.login_account is '院系登录账号，导入后不可原地修改。';
comment on column public.departments.sort_order is '关联排序号，导入后不可原地修改。';

alter table public.departments enable row level security;
revoke all on table public.departments from anon, authenticated;
grant select, insert, update on table public.departments to service_role;

create unique index if not exists departments_active_name_uq
  on public.departments (lower(btrim(department_name)))
  where status = 'active';
create unique index if not exists departments_active_login_account_uq
  on public.departments (lower(btrim(login_account)))
  where status = 'active';
create unique index if not exists departments_active_phone_uq
  on public.departments (contact_phone)
  where status = 'active' and nullif(btrim(contact_phone), '') is not null;
create unique index if not exists departments_active_sort_order_uq
  on public.departments (sort_order)
  where status = 'active';

create or replace function public.set_base_info_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_departments_updated_at on public.departments;
create trigger set_departments_updated_at
  before update on public.departments
  for each row execute function public.set_base_info_updated_at();

create or replace function public.guard_department_immutable_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- 软删除后的重新导入是修改不可变字段的唯一合法入口。
  if old.status = 'disabled' and new.status = 'active' then
    return new;
  end if;

  if old.department_name is distinct from new.department_name then
    raise exception using errcode = '22023', message = '字段“院系名称”不可修改，请删除后重新导入';
  end if;
  if old.contact_phone is distinct from new.contact_phone then
    raise exception using errcode = '22023', message = '字段“联系电话”不可修改，请删除后重新导入';
  end if;
  if old.login_account is distinct from new.login_account then
    raise exception using errcode = '22023', message = '字段“登录账号”不可修改，请删除后重新导入';
  end if;
  if old.sort_order is distinct from new.sort_order then
    raise exception using errcode = '22023', message = '字段“排序号”不可修改，请删除后重新导入';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_department_immutable_fields_trigger on public.departments;
create trigger guard_department_immutable_fields_trigger
  before update on public.departments
  for each row execute function public.guard_department_immutable_fields();

alter table public.user_profiles
  add column if not exists sort_order integer,
  add column if not exists updated_at timestamptz not null default now();

with ranked as (
  select
    profile.id,
    case
      when profile.role = 'admin' then 0
      else row_number() over (
        partition by profile.role
        order by profile.created_at, profile.college_name, profile.id
      )
    end as generated_sort_order
  from public.user_profiles profile
)
update public.user_profiles profile
set sort_order = ranked.generated_sort_order
from ranked
where profile.id = ranked.id
  and profile.sort_order is null;

comment on column public.user_profiles.sort_order is
  '辅导员/学院账号排序号；导入后不可原地修改。';

create unique index if not exists user_profiles_active_login_email_uq
  on public.user_profiles (lower(btrim(login_email)))
  where coalesce(enabled, true) and nullif(btrim(login_email), '') is not null;
create unique index if not exists user_profiles_active_college_sort_order_uq
  on public.user_profiles (sort_order)
  where role = 'college' and coalesce(enabled, true) and sort_order is not null;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_base_info_updated_at();

create or replace function public.guard_user_profile_immutable_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- disabled -> enabled 仅供“删除后重新导入”流程使用。
  if not coalesce(old.enabled, true) and coalesce(new.enabled, true) then
    return new;
  end if;

  if old.auth_user_id is distinct from new.auth_user_id then
    raise exception using errcode = '22023', message = '字段“认证用户”不可修改，请删除后重新导入';
  end if;
  if old.role is distinct from new.role then
    raise exception using errcode = '22023', message = '字段“账号角色”不可修改，请删除后重新导入';
  end if;
  if old.college_name is distinct from new.college_name then
    raise exception using errcode = '22023', message = '字段“所属院系”不可修改，请删除后重新导入';
  end if;
  if old.phone is distinct from new.phone then
    raise exception using errcode = '22023', message = '字段“手机号”不可修改，请删除后重新导入';
  end if;
  if old.login_email is distinct from new.login_email then
    raise exception using errcode = '22023', message = '字段“登录账号”不可修改，请删除后重新导入';
  end if;
  if old.sort_order is distinct from new.sort_order then
    raise exception using errcode = '22023', message = '字段“排序号”不可修改，请删除后重新导入';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_profile_immutable_fields_trigger on public.user_profiles;
create trigger guard_user_profile_immutable_fields_trigger
  before update on public.user_profiles
  for each row execute function public.guard_user_profile_immutable_fields();

insert into public.departments (
  department_name,
  contact_person,
  contact_phone,
  login_account,
  sort_order,
  status
)
select
  profile.college_name,
  nullif(btrim(profile.display_name), ''),
  nullif(btrim(profile.phone), ''),
  profile.login_email,
  profile.sort_order,
  case when coalesce(profile.enabled, true) then 'active' else 'disabled' end
from public.user_profiles profile
where profile.role = 'college'
  and nullif(btrim(profile.college_name), '') is not null
  and nullif(btrim(profile.login_email), '') is not null
  and profile.sort_order is not null
  and not exists (
    select 1
    from public.departments department
    where lower(btrim(department.department_name)) = lower(btrim(profile.college_name))
  );

commit;
