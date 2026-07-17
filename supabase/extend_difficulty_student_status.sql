-- BOS 困难生 students.status 状态模型迁移
-- 可重复执行；只调整状态字段，不修改 RLS、数据治理规则或其他业务字段。

begin;

do $$
declare
  status_type text;
begin
  if to_regclass('public.students') is null then
    raise exception 'public.students 表不存在，无法迁移困难生状态';
  end if;

  select data_type
    into status_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'students'
    and column_name = 'status';

  if status_type is null then
    raise exception 'public.students.status 字段不存在';
  end if;

  if status_type not in ('text', 'character varying', 'character') then
    raise exception 'public.students.status 当前类型为 %，本迁移仅适用于现有文本字段', status_type;
  end if;
end
$$;

alter table public.students alter column status drop default;

update public.students
set status = case trim(status)
  when '' then 'draft'
  when 'college_submitted' then 'college_confirmed'
  when 'local_uploaded' then 'college_confirmed'
  when 'pending_review' then 'school_reviewing'
  when 'rejected' then 'rejected_by_school'
  when 'archived' then 'reported'
  when '学院已确认' then 'college_confirmed'
  when '学院已提交' then 'college_confirmed'
  when '已上载学校端' then 'college_confirmed'
  when '待学校确认' then 'school_reviewing'
  when '已退回' then 'rejected_by_school'
  when '管理员归档' then 'reported'
  else trim(status)
end
where status is not null;

update public.students set status = 'draft' where status is null;

alter table public.students alter column status set default 'draft';
alter table public.students alter column status set not null;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.students'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mstatus\M'
  loop
    execute format('alter table public.students drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

alter table public.students
  add constraint students_difficulty_status_check
  check (status in (
    'draft',
    'college_confirmed',
    'school_reviewing',
    'school_approved',
    'reported',
    'rejected_by_school',
    'returned_by_center'
  )) not valid;

do $$
begin
  if not exists (
    select 1
    from public.students
    where status not in (
      'draft',
      'college_confirmed',
      'school_reviewing',
      'school_approved',
      'reported',
      'rejected_by_school',
      'returned_by_center'
    )
  ) then
    alter table public.students validate constraint students_difficulty_status_check;
  else
    raise notice '存在未知历史 status，约束保持 NOT VALID；新写入仍必须使用 7 个规范状态';
  end if;
end
$$;

comment on column public.students.status is
  '困难生流程状态：draft, college_confirmed, school_reviewing, school_approved, reported, rejected_by_school, returned_by_center';

commit;
