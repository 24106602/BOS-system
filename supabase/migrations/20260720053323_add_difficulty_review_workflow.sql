-- 困难生学校审核退回、学院重新提交和操作日志闭环。
-- 状态更新与日志写入由仅 service_role 可调用的原子函数共同完成。

begin;

alter table public.students
  add column if not exists rejected_at timestamptz,
  add column if not exists resubmission_remark text,
  add column if not exists resubmitted_at timestamptz;

comment on column public.students.rejected_reason is
  '学校审核退回原因；学院端必须可见。';
comment on column public.students.resubmission_remark is
  '学院修改后重新提交时填写的修改说明。';

create table if not exists public.difficulty_student_operation_logs (
  id uuid primary key default gen_random_uuid(),
  student_record_id uuid references public.students(id) on delete set null,
  student_id text not null,
  student_name text,
  academic_year text,
  college_name text,
  action text not null check (action in (
    'college_edit',
    'college_submit',
    'school_start_review',
    'school_approve',
    'school_reject',
    'college_resubmit',
    'center_return'
  )),
  from_status text not null,
  to_status text not null,
  remark text,
  operator_user_id uuid references auth.users(id) on delete set null,
  operator_role text,
  operator_name text,
  created_at timestamptz not null default now()
);

comment on table public.difficulty_student_operation_logs is
  '困难生审核流程操作日志；由受保护的后端 API 写入。';

create index if not exists difficulty_student_operation_logs_student_idx
  on public.difficulty_student_operation_logs (student_record_id, created_at desc);
create index if not exists difficulty_student_operation_logs_scope_idx
  on public.difficulty_student_operation_logs (academic_year, college_name, created_at desc);

alter table public.difficulty_student_operation_logs enable row level security;
revoke all on table public.difficulty_student_operation_logs from anon;
revoke all on table public.difficulty_student_operation_logs from authenticated;
grant select, insert on table public.difficulty_student_operation_logs to service_role;

create or replace function public.apply_difficulty_student_transition(
  p_student_record_id uuid,
  p_expected_status text,
  p_next_status text,
  p_action text,
  p_remark text default null,
  p_operator_user_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null,
  p_changes jsonb default '{}'::jsonb
)
returns setof public.students
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_student public.students%rowtype;
  updated_student public.students%rowtype;
  normalized_remark text := nullif(btrim(coalesce(p_remark, '')), '');
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

  if current_student.status <> p_expected_status then
    raise exception using
      errcode = '23514',
      message = format(
        '困难生当前状态为 %s，不能按 %s 状态执行本次操作',
        current_student.status,
        p_expected_status
      );
  end if;

  if not (
    (p_action = 'college_edit' and p_expected_status = 'draft' and p_next_status = 'draft')
    or (p_action = 'college_edit' and p_expected_status = 'rejected_by_school' and p_next_status = 'draft')
    or (p_action = 'college_submit' and p_expected_status = 'draft' and p_next_status = 'college_confirmed')
    or (p_action = 'school_start_review' and p_expected_status = 'college_confirmed' and p_next_status = 'school_reviewing')
    or (p_action = 'school_approve' and p_expected_status = 'school_reviewing' and p_next_status = 'school_approved')
    or (p_action = 'school_reject' and p_expected_status = 'school_reviewing' and p_next_status = 'rejected_by_school')
    or (p_action = 'college_resubmit' and p_expected_status in ('rejected_by_school', 'draft') and p_next_status = 'college_confirmed')
    or (p_action = 'center_return' and p_expected_status = 'reported' and p_next_status = 'returned_by_center')
  ) then
    raise exception using
      errcode = '23514',
      message = '困难生状态转换与操作类型不匹配';
  end if;

  if p_action = 'school_reject' and normalized_remark is null then
    raise exception using
      errcode = '22023',
      message = '学校审核退回必须填写退回原因';
  end if;

  if p_action = 'college_resubmit' and normalized_remark is null then
    raise exception using
      errcode = '22023',
      message = '修改后重新提交必须填写修改说明';
  end if;

  if p_action = 'college_resubmit'
    and p_expected_status = 'draft'
    and nullif(btrim(coalesce(current_student.rejected_reason, '')), '') is null then
    raise exception using
      errcode = '23514',
      message = '该草稿不是学校退回后的修改记录，不能使用重新提交接口';
  end if;

  update public.students as student
  set
    status = p_next_status,
    academic_year = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'academic_year'
        then p_changes ->> 'academic_year'
      else student.academic_year
    end,
    college_name = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'college_name'
        then p_changes ->> 'college_name'
      else student.college_name
    end,
    student_id = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'student_id'
        then p_changes ->> 'student_id'
      else student.student_id
    end,
    name = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'name'
        then p_changes ->> 'name'
      else student.name
    end,
    id_card = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'id_card'
        then p_changes ->> 'id_card'
      else student.id_card
    end,
    grade = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'grade'
        then p_changes ->> 'grade'
      else student.grade
    end,
    gender = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'gender'
        then p_changes ->> 'gender'
      else student.gender
    end,
    difficulty_level = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'difficulty_level'
        then p_changes ->> 'difficulty_level'
      else student.difficulty_level
    end,
    photo_uploaded = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'photo_uploaded'
        then coalesce((p_changes ->> 'photo_uploaded')::boolean, false)
      else student.photo_uploaded
    end,
    photo_url = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'photo_url'
        then p_changes ->> 'photo_url'
      else student.photo_url
    end,
    raw_data = case
      when p_action = 'college_edit' and coalesce(p_changes, '{}'::jsonb) ? 'raw_data'
        then coalesce(p_changes -> 'raw_data', '{}'::jsonb)
      else student.raw_data
    end,
    rejected_reason = case
      when p_action = 'school_reject' then normalized_remark
      else student.rejected_reason
    end,
    rejected_at = case
      when p_action = 'school_reject' then now()
      else student.rejected_at
    end,
    resubmission_remark = case
      when p_action = 'school_reject' then null
      when p_action = 'college_resubmit' then normalized_remark
      else student.resubmission_remark
    end,
    resubmitted_at = case
      when p_action = 'school_reject' then null
      when p_action = 'college_resubmit' then now()
      else student.resubmitted_at
    end,
    updated_at = now()
  where student.id = current_student.id
  returning student.* into updated_student;

  insert into public.difficulty_student_operation_logs (
    student_record_id,
    student_id,
    student_name,
    academic_year,
    college_name,
    action,
    from_status,
    to_status,
    remark,
    operator_user_id,
    operator_role,
    operator_name
  ) values (
    current_student.id,
    current_student.student_id,
    current_student.name,
    current_student.academic_year,
    current_student.college_name,
    p_action,
    p_expected_status,
    p_next_status,
    normalized_remark,
    p_operator_user_id,
    nullif(btrim(coalesce(p_operator_role, '')), ''),
    nullif(btrim(coalesce(p_operator_name, '')), '')
  );

  return next updated_student;
end;
$$;

revoke all on function public.apply_difficulty_student_transition(
  uuid, text, text, text, text, uuid, text, text, jsonb
) from public;
revoke all on function public.apply_difficulty_student_transition(
  uuid, text, text, text, text, uuid, text, text, jsonb
) from anon;
revoke all on function public.apply_difficulty_student_transition(
  uuid, text, text, text, text, uuid, text, text, jsonb
) from authenticated;
grant execute on function public.apply_difficulty_student_transition(
  uuid, text, text, text, text, uuid, text, text, jsonb
) to service_role;

commit;
