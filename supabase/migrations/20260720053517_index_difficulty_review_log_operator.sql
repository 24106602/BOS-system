-- 为操作日志的操作人外键增加索引，避免账号变更时全表扫描。
create index if not exists difficulty_student_operation_logs_operator_idx
  on public.difficulty_student_operation_logs (operator_user_id)
  where operator_user_id is not null;
