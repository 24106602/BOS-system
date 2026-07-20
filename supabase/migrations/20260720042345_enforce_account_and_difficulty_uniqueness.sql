-- 账号手机号与困难生学年认定唯一性约束。
-- 当前系统以 user_profiles.enabled=false 表示账号停用，因此手机号采用有效记录部分唯一索引。

begin;

alter table public.user_profiles
  add column if not exists phone text;

comment on column public.user_profiles.phone is
  '管理员/学院账号手机号；仅启用账号参与唯一性约束。';

update public.user_profiles
set phone = nullif(regexp_replace(phone, '[^0-9]', '', 'g'), '')
where phone is not null;

do $$
declare
  duplicate_phone record;
begin
  select
    profile.phone,
    string_agg(
      coalesce(nullif(btrim(profile.display_name), ''), nullif(btrim(profile.college_name), ''), '未命名账号'),
      '、'
      order by profile.created_at
    ) as account_names
  into duplicate_phone
  from public.user_profiles profile
  where coalesce(profile.enabled, true)
    and nullif(btrim(profile.phone), '') is not null
  group by profile.phone
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '手机号 %s 已被多个有效账号使用（%s），请先处理重复数据',
        duplicate_phone.phone,
        duplicate_phone.account_names
      ),
      constraint = 'user_profiles_active_phone_uq';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profiles_phone_format_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_phone_format_check
      check (phone is null or phone ~ '^1[3-9][0-9]{9}$')
      not valid;
  end if;
end;
$$;

alter table public.user_profiles
  validate constraint user_profiles_phone_format_check;

create or replace function public.guard_active_user_profile_phone_unique()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict_name text;
  conflict_role text;
begin
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');
  if not coalesce(new.enabled, true) or new.phone is null then
    return new;
  end if;

  select
    coalesce(nullif(btrim(profile.display_name), ''), nullif(btrim(profile.college_name), ''), '未命名账号'),
    profile.role
  into conflict_name, conflict_role
  from public.user_profiles profile
  where profile.id is distinct from new.id
    and coalesce(profile.enabled, true)
    and profile.phone = new.phone
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '手机号 %s 已被%s“%s”使用',
        new.phone,
        case conflict_role when 'admin' then '管理员' when 'college' then '学院账号' else '账号' end,
        conflict_name
      ),
      constraint = 'user_profiles_active_phone_uq';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_active_user_profile_phone_unique_trigger
  on public.user_profiles;
create trigger guard_active_user_profile_phone_unique_trigger
  before insert or update of phone, enabled
  on public.user_profiles
  for each row
  execute function public.guard_active_user_profile_phone_unique();

create unique index if not exists user_profiles_active_phone_uq
  on public.user_profiles (phone)
  where coalesce(enabled, true) and phone is not null;

do $$
declare
  duplicate_student record;
begin
  select
    btrim(student.student_id) as student_id,
    btrim(student.academic_year) as academic_year,
    string_agg(coalesce(nullif(btrim(student.name), ''), '未填写姓名'), '、' order by student.created_at) as names
  into duplicate_student
  from public.students student
  where nullif(btrim(student.student_id), '') is not null
    and nullif(btrim(student.academic_year), '') is not null
  group by btrim(student.student_id), btrim(student.academic_year)
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '学号 %s 在 %s 学年存在重复困难生认定记录（%s），请先处理重复数据',
        duplicate_student.student_id,
        duplicate_student.academic_year,
        duplicate_student.names
      ),
      constraint = 'students_student_academic_year_uq';
  end if;
end;
$$;

create or replace function public.guard_student_academic_year_unique()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict_name text;
begin
  new.student_id := nullif(btrim(new.student_id), '');
  new.academic_year := nullif(btrim(new.academic_year), '');
  if new.student_id is null or new.academic_year is null then
    return new;
  end if;

  select coalesce(nullif(btrim(student.name), ''), '未填写姓名')
  into conflict_name
  from public.students student
  where student.id is distinct from new.id
    and btrim(student.student_id) = new.student_id
    and btrim(student.academic_year) = new.academic_year
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '学号 %s 在 %s 学年已存在困难生认定记录（姓名：%s）',
        new.student_id,
        new.academic_year,
        conflict_name
      ),
      constraint = 'students_student_academic_year_uq';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_student_academic_year_unique_trigger
  on public.students;
create trigger guard_student_academic_year_unique_trigger
  before insert or update of student_id, academic_year
  on public.students
  for each row
  execute function public.guard_student_academic_year_unique();

create unique index if not exists students_student_academic_year_uq
  on public.students (btrim(student_id), btrim(academic_year))
  where nullif(btrim(student_id), '') is not null
    and nullif(btrim(academic_year), '') is not null;

comment on index public.students_student_academic_year_uq is
  '同一学生同一学年只能存在一条困难生认定记录。';

commit;
