-- 业务数据统一软删除：保留历史记录，仅在查询层默认隐藏。
-- 困难生审核状态继续使用 students.status，删除态单独使用 is_deleted，避免破坏状态机。

begin;

alter table public.students
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.enrolled_students
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.hardship_students
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.college_batches
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.batch_rows
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.award_batches
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.award_batch_rows
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

comment on column public.students.is_deleted is '业务软删除标记；true 时默认查询必须隐藏。';
comment on column public.enrolled_students.is_deleted is '业务软删除标记；重新导入可恢复。';
comment on column public.hardship_students.is_deleted is '业务软删除标记；重新导入可恢复。';
comment on column public.college_batches.is_deleted is '学院提交批次软删除标记。';
comment on column public.batch_rows.is_deleted is '学院提交批次明细软删除标记。';
comment on column public.award_batches.is_deleted is '三大奖提交批次软删除标记。';
comment on column public.award_batch_rows.is_deleted is '三大奖提交明细软删除标记。';

create index if not exists idx_students_active_records
  on public.students (academic_year, college_name)
  where not is_deleted;
create index if not exists idx_enrolled_students_active_records
  on public.enrolled_students (student_id)
  where not is_deleted;
create index if not exists idx_hardship_students_active_records
  on public.hardship_students (key)
  where not is_deleted;
create index if not exists idx_college_batches_active_records
  on public.college_batches (academic_year, college_name, data_type)
  where not is_deleted;
create index if not exists idx_batch_rows_active_records
  on public.batch_rows (batch_id, row_index)
  where not is_deleted;
create index if not exists idx_award_batches_active_records
  on public.award_batches (academic_year, college_name, award_type)
  where not is_deleted;
create index if not exists idx_award_batch_rows_active_records
  on public.award_batch_rows (batch_id, row_index)
  where not is_deleted;

create or replace function public.set_business_soft_delete_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_deleted is distinct from old.is_deleted then
    if new.is_deleted then
      new.deleted_at := coalesce(new.deleted_at, now());
    else
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_business_hard_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('业务表 %s 禁止物理删除，请使用软删除字段', tg_table_name);
end;
$$;

revoke all on function public.set_business_soft_delete_metadata() from public, anon, authenticated;
revoke all on function public.prevent_business_hard_delete() from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'students',
    'enrolled_students',
    'hardship_students',
    'college_batches',
    'batch_rows',
    'award_batches',
    'award_batch_rows'
  ]
  loop
    execute format('drop trigger if exists set_soft_delete_metadata on public.%I', target_table);
    execute format(
      'create trigger set_soft_delete_metadata before update of is_deleted on public.%I for each row execute function public.set_business_soft_delete_metadata()',
      target_table
    );
    execute format('drop trigger if exists prevent_hard_delete on public.%I', target_table);
    execute format(
      'create trigger prevent_hard_delete before delete on public.%I for each row execute function public.prevent_business_hard_delete()',
      target_table
    );
  end loop;
end;
$$;

drop trigger if exists prevent_hard_delete on public.departments;
create trigger prevent_hard_delete
before delete on public.departments
for each row execute function public.prevent_business_hard_delete();

drop trigger if exists prevent_hard_delete on public.user_profiles;
create trigger prevent_hard_delete
before delete on public.user_profiles
for each row execute function public.prevent_business_hard_delete();

-- 物理级联删除不再作为业务路径，父记录保留后子记录自然继续可追溯。
alter table public.batch_rows drop constraint if exists batch_rows_batch_id_fkey;
alter table public.batch_rows
  add constraint batch_rows_batch_id_fkey
  foreign key (batch_id) references public.college_batches(id) on delete restrict;

alter table public.award_batch_rows drop constraint if exists award_batch_rows_batch_id_fkey;
alter table public.award_batch_rows
  add constraint award_batch_rows_batch_id_fkey
  foreign key (batch_id) references public.award_batches(id) on delete restrict;

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
    and not student.is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = '困难生记录不存在或已禁用';
  end if;

  if current_student.status <> p_expected_status
    or current_student.status not in ('draft', 'rejected_by_school') then
    raise exception using
      errcode = '23514',
      message = '当前状态不允许删除困难生记录';
  end if;

  update public.students as student
  set
    is_deleted = true,
    deleted_at = now(),
    deleted_by = p_operator_user_id,
    updated_at = now()
  where student.id = current_student.id;

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
      'difficulty_level', current_student.difficulty_level,
      'soft_deleted', true
    )
  );

  return true;
end;
$$;

create or replace function public.restore_difficulty_student_with_log(
  p_student_record_id uuid,
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
  restored_student public.students%rowtype;
begin
  select student.*
    into current_student
  from public.students as student
  where student.id = p_student_record_id
    and student.is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = '已禁用困难生记录不存在';
  end if;

  update public.students as student
  set
    is_deleted = false,
    deleted_at = null,
    deleted_by = null,
    updated_at = now()
  where student.id = current_student.id
  returning * into restored_student;

  perform public.log_operation(
    'difficulty_student',
    restored_student.id::text,
    'edit',
    p_operator_user_id,
    p_operator_role,
    p_operator_name,
    current_student.status,
    restored_student.status,
    coalesce(nullif(btrim(coalesce(p_remark, '')), ''), '管理员恢复已禁用困难生记录'),
    jsonb_build_object(
      'student_id', restored_student.student_id,
      'name', restored_student.name,
      'academic_year', restored_student.academic_year,
      'college_name', restored_student.college_name,
      'soft_deleted', false
    )
  );

  return next restored_student;
end;
$$;

revoke all on function public.restore_difficulty_student_with_log(
  uuid, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.restore_difficulty_student_with_log(
  uuid, text, uuid, text, text
) to service_role;

-- 院系更名必须保留旧记录：同一事务内禁用旧院系并创建新院系。
create or replace function public.replace_department_for_rename(
  p_department_id uuid,
  p_payload jsonb
)
returns setof public.departments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_department public.departments%rowtype;
  new_department public.departments%rowtype;
  next_name text := btrim(coalesce(p_payload ->> 'department_name', ''));
begin
  select department.*
    into current_department
  from public.departments as department
  where department.id = p_department_id
    and department.status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '待更名院系不存在或已禁用';
  end if;
  if next_name = '' then
    raise exception using errcode = '22023', message = '新院系名称不能为空';
  end if;
  if lower(next_name) = lower(btrim(current_department.department_name)) then
    raise exception using errcode = '22023', message = '新院系名称不能与原名称相同';
  end if;

  update public.departments
  set status = 'disabled', updated_at = now()
  where id = current_department.id;

  insert into public.departments (
    department_name,
    school_name,
    department_type,
    contact_person,
    contact_phone,
    login_account,
    contact_address,
    contact_postcode,
    contact_fax,
    sort_order,
    status
  ) values (
    next_name,
    coalesce(nullif(btrim(p_payload ->> 'school_name'), ''), current_department.school_name),
    coalesce(nullif(btrim(p_payload ->> 'department_type'), ''), current_department.department_type),
    coalesce(p_payload ->> 'contact_person', current_department.contact_person),
    coalesce(p_payload ->> 'contact_phone', current_department.contact_phone),
    coalesce(nullif(lower(btrim(p_payload ->> 'login_account')), ''), current_department.login_account),
    coalesce(p_payload ->> 'contact_address', current_department.contact_address),
    coalesce(p_payload ->> 'contact_postcode', current_department.contact_postcode),
    coalesce(p_payload ->> 'contact_fax', current_department.contact_fax),
    coalesce(nullif(p_payload ->> 'sort_order', '')::integer, current_department.sort_order),
    'active'
  )
  returning * into new_department;

  return next new_department;
end;
$$;

revoke all on function public.replace_department_for_rename(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_department_for_rename(uuid, jsonb)
  to service_role;

commit;
