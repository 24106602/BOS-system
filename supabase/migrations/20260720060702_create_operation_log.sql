-- 通用操作日志、历史追溯与困难生原子写入函数。
-- 保留 difficulty_student_operation_logs，并将其后续写入同步到 operation_log。

begin;

create table if not exists public.operation_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  action text not null check (action in (
    'confirm',
    'approve',
    'reject',
    'report',
    'return',
    'edit',
    'delete',
    'resubmit'
  )),
  operator_id uuid references auth.users(id) on delete set null,
  operator_role text check (
    operator_role is null
    or operator_role in ('college_admin', 'school_admin', 'center_admin')
  ),
  operator_name text,
  from_status text,
  to_status text,
  remark text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

comment on table public.operation_log is
  '统一业务操作日志；记录操作人、状态变化、备注和关键字段快照。';
comment on column public.operation_log.snapshot is
  '变更完成后的关键字段 JSON 快照，不保存困难生 raw_data 等完整敏感材料。';

create index if not exists operation_log_record_timeline_idx
  on public.operation_log (table_name, record_id, created_at desc);
create index if not exists operation_log_operator_timeline_idx
  on public.operation_log (operator_id, created_at desc)
  where operator_id is not null;

alter table public.operation_log enable row level security;
revoke all on table public.operation_log from anon;
revoke all on table public.operation_log from authenticated;
grant select, insert on table public.operation_log to service_role;

create or replace function public.log_operation(
  p_table_name text,
  p_record_id text,
  p_action text,
  p_operator_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null,
  p_from_status text default null,
  p_to_status text default null,
  p_remark text default null,
  p_snapshot jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_log_id uuid;
  normalized_role text;
begin
  if nullif(btrim(coalesce(p_table_name, '')), '') is null
    or nullif(btrim(coalesce(p_record_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = '操作日志的表名和记录 ID 不能为空';
  end if;

  if p_action not in (
    'confirm', 'approve', 'reject', 'report',
    'return', 'edit', 'delete', 'resubmit'
  ) then
    raise exception using
      errcode = '22023',
      message = '不支持的操作日志类型';
  end if;

  normalized_role := case nullif(btrim(coalesce(p_operator_role, '')), '')
    when 'college' then 'college_admin'
    when 'admin' then 'school_admin'
    when 'center' then 'center_admin'
    when 'college_admin' then 'college_admin'
    when 'school_admin' then 'school_admin'
    when 'center_admin' then 'center_admin'
    else null
  end;

  if nullif(btrim(coalesce(p_operator_role, '')), '') is not null
    and normalized_role is null then
    raise exception using
      errcode = '22023',
      message = '不支持的操作人角色';
  end if;

  insert into public.operation_log (
    table_name,
    record_id,
    action,
    operator_id,
    operator_role,
    operator_name,
    from_status,
    to_status,
    remark,
    snapshot
  ) values (
    btrim(p_table_name),
    btrim(p_record_id),
    p_action,
    p_operator_id,
    normalized_role,
    nullif(btrim(coalesce(p_operator_name, '')), ''),
    nullif(btrim(coalesce(p_from_status, '')), ''),
    nullif(btrim(coalesce(p_to_status, '')), ''),
    nullif(btrim(coalesce(p_remark, '')), ''),
    p_snapshot
  )
  returning id into new_log_id;

  return new_log_id;
end;
$$;

revoke all on function public.log_operation(
  text, text, text, uuid, text, text, text, text, text, jsonb
) from public;
revoke all on function public.log_operation(
  text, text, text, uuid, text, text, text, text, text, jsonb
) from anon;
revoke all on function public.log_operation(
  text, text, text, uuid, text, text, text, text, text, jsonb
) from authenticated;
grant execute on function public.log_operation(
  text, text, text, uuid, text, text, text, text, text, jsonb
) to service_role;

-- 将现有困难生专用日志迁移到通用时间线，保持历史连续。
insert into public.operation_log (
  id,
  table_name,
  record_id,
  action,
  operator_id,
  operator_role,
  operator_name,
  from_status,
  to_status,
  remark,
  snapshot,
  created_at
)
select
  legacy.id,
  'difficulty_student',
  coalesce(legacy.student_record_id::text, legacy.student_id),
  case legacy.action
    when 'college_edit' then 'edit'
    when 'college_submit' then 'confirm'
    when 'school_start_review' then 'confirm'
    when 'school_approve' then 'approve'
    when 'school_reject' then 'reject'
    when 'college_resubmit' then 'resubmit'
    when 'center_return' then 'return'
  end,
  legacy.operator_user_id,
  case legacy.operator_role
    when 'college' then 'college_admin'
    when 'admin' then 'school_admin'
    when 'center' then 'center_admin'
    when 'college_admin' then 'college_admin'
    when 'school_admin' then 'school_admin'
    when 'center_admin' then 'center_admin'
    else null
  end,
  legacy.operator_name,
  legacy.from_status,
  legacy.to_status,
  legacy.remark,
  jsonb_build_object(
    'student_id', legacy.student_id,
    'name', legacy.student_name,
    'academic_year', legacy.academic_year,
    'college_name', legacy.college_name
  ),
  legacy.created_at
from public.difficulty_student_operation_logs as legacy
where legacy.action in (
  'college_edit',
  'college_submit',
  'school_start_review',
  'school_approve',
  'school_reject',
  'college_resubmit',
  'center_return'
)
on conflict (id) do nothing;

create or replace function public.mirror_difficulty_student_operation_log()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generic_action text;
  student_snapshot jsonb;
begin
  generic_action := case new.action
    when 'college_edit' then 'edit'
    when 'college_submit' then 'confirm'
    when 'school_start_review' then 'confirm'
    when 'school_approve' then 'approve'
    when 'school_reject' then 'reject'
    when 'college_resubmit' then 'resubmit'
    when 'center_return' then 'return'
  end;

  if generic_action is null then
    return new;
  end if;

  select jsonb_build_object(
    'student_id', student.student_id,
    'name', student.name,
    'academic_year', student.academic_year,
    'college_name', student.college_name,
    'grade', student.grade,
    'gender', student.gender,
    'difficulty_level', student.difficulty_level
  )
  into student_snapshot
  from public.students as student
  where student.id = new.student_record_id;

  perform public.log_operation(
    'difficulty_student',
    coalesce(new.student_record_id::text, new.student_id),
    generic_action,
    new.operator_user_id,
    new.operator_role,
    new.operator_name,
    new.from_status,
    new.to_status,
    new.remark,
    coalesce(
      student_snapshot,
      jsonb_build_object(
        'student_id', new.student_id,
        'name', new.student_name,
        'academic_year', new.academic_year,
        'college_name', new.college_name
      )
    )
  );
  return new;
end;
$$;

drop trigger if exists mirror_difficulty_student_operation_log_trigger
  on public.difficulty_student_operation_logs;
create trigger mirror_difficulty_student_operation_log_trigger
after insert on public.difficulty_student_operation_logs
for each row execute function public.mirror_difficulty_student_operation_log();

create or replace function public.save_difficulty_student_with_log(
  p_student_record_id uuid,
  p_payload jsonb,
  p_expected_status text,
  p_next_status text,
  p_action text,
  p_remark text default null,
  p_operator_user_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null
)
returns setof public.students
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_student public.students%rowtype;
  saved_student public.students%rowtype;
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_student_record_id is null then
    if not (
      (p_action = 'confirm' and p_next_status = 'college_confirmed')
      or (p_action = 'report' and p_next_status = 'reported')
    ) then
      raise exception using
        errcode = '23514',
        message = '新增困难生记录的状态与操作类型不匹配';
    end if;

    insert into public.students (
      academic_year,
      college_name,
      student_id,
      name,
      id_card,
      grade,
      gender,
      difficulty_level,
      status,
      photo_uploaded,
      photo_url,
      rejected_reason,
      raw_data,
      updated_at
    ) values (
      payload ->> 'academic_year',
      payload ->> 'college_name',
      payload ->> 'student_id',
      payload ->> 'name',
      payload ->> 'id_card',
      payload ->> 'grade',
      payload ->> 'gender',
      payload ->> 'difficulty_level',
      p_next_status,
      coalesce((payload ->> 'photo_uploaded')::boolean, false),
      payload ->> 'photo_url',
      payload ->> 'rejected_reason',
      coalesce(payload -> 'raw_data', '{}'::jsonb),
      now()
    )
    returning * into saved_student;
  else
    select student.*
      into current_student
    from public.students as student
    where student.id = p_student_record_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = '困难生记录不存在';
    end if;

    if current_student.status <> p_expected_status then
      raise exception using
        errcode = '23514',
        message = '困难生状态已变化，本次保存已取消';
    end if;

    if p_action <> 'report'
      or not (
        (p_expected_status = 'school_approved' and p_next_status = 'reported')
        or (p_expected_status = 'returned_by_center' and p_next_status = 'school_approved')
      ) then
      raise exception using
        errcode = '23514',
        message = '历史困难生更新的状态与操作类型不匹配';
    end if;

    update public.students as student
    set
      academic_year = case when payload ? 'academic_year' then payload ->> 'academic_year' else student.academic_year end,
      college_name = case when payload ? 'college_name' then payload ->> 'college_name' else student.college_name end,
      student_id = case when payload ? 'student_id' then payload ->> 'student_id' else student.student_id end,
      name = case when payload ? 'name' then payload ->> 'name' else student.name end,
      id_card = case when payload ? 'id_card' then payload ->> 'id_card' else student.id_card end,
      grade = case when payload ? 'grade' then payload ->> 'grade' else student.grade end,
      gender = case when payload ? 'gender' then payload ->> 'gender' else student.gender end,
      difficulty_level = case when payload ? 'difficulty_level' then payload ->> 'difficulty_level' else student.difficulty_level end,
      photo_uploaded = case when payload ? 'photo_uploaded' then coalesce((payload ->> 'photo_uploaded')::boolean, false) else student.photo_uploaded end,
      photo_url = case when payload ? 'photo_url' then payload ->> 'photo_url' else student.photo_url end,
      rejected_reason = case when payload ? 'rejected_reason' then payload ->> 'rejected_reason' else student.rejected_reason end,
      raw_data = case when payload ? 'raw_data' then coalesce(payload -> 'raw_data', '{}'::jsonb) else student.raw_data end,
      status = p_next_status,
      updated_at = now()
    where student.id = current_student.id
    returning * into saved_student;
  end if;

  perform public.log_operation(
    'difficulty_student',
    saved_student.id::text,
    p_action,
    p_operator_user_id,
    p_operator_role,
    p_operator_name,
    case when p_student_record_id is null then null else current_student.status end,
    saved_student.status,
    p_remark,
    jsonb_build_object(
      'student_id', saved_student.student_id,
      'name', saved_student.name,
      'academic_year', saved_student.academic_year,
      'college_name', saved_student.college_name,
      'grade', saved_student.grade,
      'gender', saved_student.gender,
      'difficulty_level', saved_student.difficulty_level
    )
  );

  return next saved_student;
end;
$$;

create or replace function public.delete_difficulty_student_with_log(
  p_student_record_id uuid,
  p_expected_status text,
  p_remark text default null,
  p_operator_user_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_student public.students%rowtype;
begin
  select student.*
    into current_student
  from public.students as student
  where student.id = p_student_record_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = '困难生记录不存在';
  end if;

  if current_student.status <> p_expected_status
    or current_student.status not in ('draft', 'rejected_by_school') then
    raise exception using
      errcode = '23514',
      message = '当前状态不允许删除困难生记录';
  end if;

  perform public.log_operation(
    'difficulty_student',
    current_student.id::text,
    'delete',
    p_operator_user_id,
    p_operator_role,
    p_operator_name,
    current_student.status,
    null,
    p_remark,
    jsonb_build_object(
      'student_id', current_student.student_id,
      'name', current_student.name,
      'academic_year', current_student.academic_year,
      'college_name', current_student.college_name,
      'grade', current_student.grade,
      'gender', current_student.gender,
      'difficulty_level', current_student.difficulty_level
    )
  );

  delete from public.students where id = current_student.id;
  return true;
end;
$$;

create or replace function public.report_difficulty_students_with_log(
  p_ids uuid[],
  p_remark text default null,
  p_operator_user_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null
)
returns setof public.students
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_ids uuid[];
  requested_count integer;
  matched_count integer;
  current_student public.students%rowtype;
  updated_student public.students%rowtype;
  next_status text;
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

  select count(*) into matched_count
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

  for current_student in
    select student.*
    from public.students as student
    where student.id = any(normalized_ids)
    order by student.id
  loop
    next_status := case current_student.status
      when 'school_approved' then 'reported'
      when 'returned_by_center' then 'school_approved'
    end;

    update public.students as student
    set status = next_status,
      updated_at = now()
    where student.id = current_student.id
    returning * into updated_student;

    perform public.log_operation(
      'difficulty_student',
      updated_student.id::text,
      'report',
      p_operator_user_id,
      p_operator_role,
      p_operator_name,
      current_student.status,
      updated_student.status,
      p_remark,
      jsonb_build_object(
        'student_id', updated_student.student_id,
        'name', updated_student.name,
        'academic_year', updated_student.academic_year,
        'college_name', updated_student.college_name,
        'grade', updated_student.grade,
        'gender', updated_student.gender,
        'difficulty_level', updated_student.difficulty_level
      )
    );

    return next updated_student;
  end loop;
end;
$$;

revoke all on function public.save_difficulty_student_with_log(
  uuid, jsonb, text, text, text, text, uuid, text, text
) from public;
revoke all on function public.save_difficulty_student_with_log(
  uuid, jsonb, text, text, text, text, uuid, text, text
) from anon;
revoke all on function public.save_difficulty_student_with_log(
  uuid, jsonb, text, text, text, text, uuid, text, text
) from authenticated;
grant execute on function public.save_difficulty_student_with_log(
  uuid, jsonb, text, text, text, text, uuid, text, text
) to service_role;

revoke all on function public.delete_difficulty_student_with_log(
  uuid, text, text, uuid, text, text
) from public;
revoke all on function public.delete_difficulty_student_with_log(
  uuid, text, text, uuid, text, text
) from anon;
revoke all on function public.delete_difficulty_student_with_log(
  uuid, text, text, uuid, text, text
) from authenticated;
grant execute on function public.delete_difficulty_student_with_log(
  uuid, text, text, uuid, text, text
) to service_role;

revoke all on function public.report_difficulty_students_with_log(
  uuid[], text, uuid, text, text
) from public;
revoke all on function public.report_difficulty_students_with_log(
  uuid[], text, uuid, text, text
) from anon;
revoke all on function public.report_difficulty_students_with_log(
  uuid[], text, uuid, text, text
) from authenticated;
grant execute on function public.report_difficulty_students_with_log(
  uuid[], text, uuid, text, text
) to service_role;

commit;
