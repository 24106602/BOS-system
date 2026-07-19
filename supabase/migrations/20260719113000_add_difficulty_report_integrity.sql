-- 困难生学校上报完整性支撑结构与原子批量状态更新。
-- 文件本体存储在 Supabase Storage；本表仅保存认定办法元数据和文件地址。

begin;

alter table public.students
  add column if not exists academic_year text,
  add column if not exists grade text,
  add column if not exists gender text,
  add column if not exists rejected_reason text,
  add column if not exists raw_data jsonb not null default '{}'::jsonb,
  add column if not exists photo_uploaded boolean not null default false,
  add column if not exists photo_url text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_students_academic_year
  on public.students (academic_year);

create table if not exists public.difficulty_policy_documents (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  file_name text,
  document_url text not null,
  storage_path text,
  uploaded_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint difficulty_policy_documents_academic_year_uq unique (academic_year)
);

comment on table public.difficulty_policy_documents is
  '学校困难生认定办法文件元数据；每学年保留一份当前有效文件。';

alter table public.difficulty_policy_documents enable row level security;

create or replace function public.report_difficulty_students(p_ids uuid[])
returns setof public.students
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_ids uuid[];
  requested_count integer;
  matched_count integer;
begin
  select coalesce(array_agg(distinct input_id.id), '{}'::uuid[])
    into normalized_ids
  from unnest(coalesce(p_ids, '{}'::uuid[])) as input_id(id);

  requested_count := cardinality(normalized_ids);
  if requested_count = 0 then
    raise exception using
      errcode = '22023',
      message = '上报记录不能为空';
  end if;

  perform 1
  from public.students
  where id = any(normalized_ids)
  for update;

  select count(*)
    into matched_count
  from public.students
  where id = any(normalized_ids);

  if matched_count <> requested_count then
    raise exception using
      errcode = 'P0002',
      message = '部分困难生记录不存在，批量上报已全部取消';
  end if;

  if exists (
    select 1
    from public.students
    where id = any(normalized_ids)
      and status not in ('school_approved', 'returned_by_center')
  ) then
    raise exception using
      errcode = '23514',
      message = '存在不符合学校上报前置状态的记录，批量上报已全部取消';
  end if;

  return query
  update public.students as student
  set status = case
      when status = 'school_approved' then 'reported'
      when status = 'returned_by_center' then 'school_approved'
      else status
    end,
    updated_at = now()
  where id = any(normalized_ids)
  returning student.*;
end;
$$;

revoke all on function public.report_difficulty_students(uuid[]) from public;
revoke all on function public.report_difficulty_students(uuid[]) from anon;
revoke all on function public.report_difficulty_students(uuid[]) from authenticated;
grant execute on function public.report_difficulty_students(uuid[]) to service_role;

commit;
