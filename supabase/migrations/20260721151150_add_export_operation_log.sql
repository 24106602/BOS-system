-- 允许操作日志记录困难生数据导出行为。
-- 导出明细保存在 snapshot 中，不写入导出的具体敏感值。

begin;

alter table public.operation_log
  drop constraint if exists operation_log_action_check;

alter table public.operation_log
  add constraint operation_log_action_check check (action in (
    'confirm',
    'approve',
    'reject',
    'report',
    'return',
    'edit',
    'delete',
    'resubmit',
    'export'
  ));

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
    'return', 'edit', 'delete', 'resubmit', 'export'
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

comment on column public.operation_log.action is
  '操作类型；export 表示困难生数据导出，导出列和条数记录在 snapshot 中。';

commit;
