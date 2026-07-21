-- 每学年困难生认定时间窗口；仅由受保护的后端 API 读写。
begin;

create table if not exists public.difficulty_recognition_windows (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint difficulty_recognition_windows_academic_year_uq unique (academic_year),
  constraint difficulty_recognition_windows_academic_year_ck
    check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  constraint difficulty_recognition_windows_date_range_ck
    check (end_date >= start_date),
  constraint difficulty_recognition_windows_status_ck
    check (status in ('active', 'disabled'))
);

comment on table public.difficulty_recognition_windows is
  '每学年困难生认定业务时间窗口；未配置时后端保持兼容并暂不限制操作。';
comment on column public.difficulty_recognition_windows.start_date is
  '认定业务允许开始日期，按 Asia/Shanghai 自然日判断。';
comment on column public.difficulty_recognition_windows.end_date is
  '认定业务允许结束日期，包含当天。';

create index if not exists difficulty_recognition_windows_status_idx
  on public.difficulty_recognition_windows (status, academic_year);

create or replace function public.set_difficulty_recognition_window_updated_at()
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

revoke all on function public.set_difficulty_recognition_window_updated_at()
  from public, anon, authenticated;

drop trigger if exists set_updated_at on public.difficulty_recognition_windows;
create trigger set_updated_at
before update on public.difficulty_recognition_windows
for each row execute function public.set_difficulty_recognition_window_updated_at();

drop trigger if exists prevent_hard_delete on public.difficulty_recognition_windows;
create trigger prevent_hard_delete
before delete on public.difficulty_recognition_windows
for each row execute function public.prevent_business_hard_delete();

alter table public.difficulty_recognition_windows enable row level security;

revoke all on table public.difficulty_recognition_windows from public, anon, authenticated;
grant select, insert, update, delete on table public.difficulty_recognition_windows to service_role;

commit;
