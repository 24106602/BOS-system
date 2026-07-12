-- ============================================================
-- BOS 数据治理平台 - Supabase 数据库表结构
-- 执行顺序：在 Supabase SQL Editor 中按顺序执行
-- ============================================================

-- -----------------------------------------------------------
-- 1. 在校生数据库表
-- 存储全校在校生基础信息，用于学院端数据上传时的身份校验
-- -----------------------------------------------------------
create table if not exists public.enrolled_students (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null,          -- 学号
  name        text not null,          -- 姓名
  id_card     text,                   -- 身份证号
  college     text,                   -- 学院
  department  text,                   -- 院系
  major       text,                   -- 专业
  class_name  text,                   -- 班级
  gender      text,                   -- 性别
  grade       text,                   -- 年级
  source_file text,                   -- 来源文件
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 唯一约束：学号或身份证号不允许重复（同一学号视为同一人）
  constraint enrolled_students_uq unique (student_id)
);

-- 身份证号索引用于快速校验
create index if not exists idx_enrolled_students_id_card on public.enrolled_students (id_card);
create index if not exists idx_enrolled_students_college on public.enrolled_students (college);
create index if not exists idx_enrolled_students_name on public.enrolled_students (name);

-- -----------------------------------------------------------
-- 2. 困难生数据库表
-- 存储经过审核入库的困难生本专科信息
-- -----------------------------------------------------------
create table if not exists public.hardship_students (
  id                uuid primary key default gen_random_uuid(),
  key               text not null,            -- 唯一键（id:身份证号 或 student:学号）
  student_id        text,                     -- 学号
  name              text,                     -- 姓名
  id_card           text,                     -- 身份证号
  college           text,                     -- 学院
  major             text,                     -- 专业
  class_name        text,                     -- 班级
  hardship_level    text,                     -- 困难等级
  year              text,                     -- 认定年份
  special_type      text,                     -- 特殊困难类型
  remark            text,                     -- 备注
  source_file       text,                     -- 来源文件
  imported_at       text,                     -- 入库时间
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint hardship_students_key_uq unique (key)
);

create index if not exists idx_hardship_students_student_id on public.hardship_students (student_id);
create index if not exists idx_hardship_students_id_card on public.hardship_students (id_card);
create index if not exists idx_hardship_students_college on public.hardship_students (college);
create index if not exists idx_hardship_students_name on public.hardship_students (name);

-- -----------------------------------------------------------
-- 3. 学院提交批次表
-- 存储学院端上传的数据批次元信息（本专科信息 / 家庭成员信息）
-- -----------------------------------------------------------
create table if not exists public.college_batches (
  id              uuid primary key default gen_random_uuid(),
  college_name    text not null,              -- 学院名称
  data_type       text not null,              -- 'student' | 'family'
  academic_year   text,                       -- 学年 如 '2025-2026'
  row_count       integer not null default 0, -- 数据条数
  status          text not null default 'uploaded', -- uploaded | reviewed | approved
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 同一学院 + 同类型 + 同学年只保留最新批次
  constraint college_batches_uq unique (college_name, data_type, academic_year)
);

create index if not exists idx_college_batches_college on public.college_batches (college_name);
create index if not exists idx_college_batches_type on public.college_batches (data_type);
create index if not exists idx_college_batches_year on public.college_batches (academic_year);

-- -----------------------------------------------------------
-- 4. 批次明细数据表
-- 存储每个批次的具体行数据（JSON 格式，灵活适配不同模板字段）
-- -----------------------------------------------------------
create table if not exists public.batch_rows (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.college_batches(id) on delete cascade,
  row_data    jsonb not null default '{}',    -- 行数据（字段名→值）
  row_index   integer not null default 0,     -- 行号
  created_at  timestamptz not null default now(),

  constraint batch_rows_batch_id_fkey foreign key (batch_id) references public.college_batches(id) on delete cascade
);

create index if not exists idx_batch_rows_batch_id on public.batch_rows (batch_id);

-- -----------------------------------------------------------
-- 5. RLS（行级安全策略）
-- 管理员可查看所有数据，学院只能查看自己学院的数据
-- -----------------------------------------------------------

-- 启用 RLS
alter table public.enrolled_students enable row level security;
alter table public.hardship_students enable row level security;
alter table public.college_batches enable row level security;
alter table public.batch_rows enable row level security;

-- 管理员：完全访问所有表
create policy "admin_full_access_enrolled" on public.enrolled_students
  for all using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role = 'admin')
  );

create policy "admin_full_access_hardship" on public.hardship_students
  for all using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role = 'admin')
  );

create policy "admin_full_access_batches" on public.college_batches
  for all using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role = 'admin')
  );

create policy "admin_full_access_batch_rows" on public.batch_rows
  for all using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role = 'admin')
  );

-- 学院端：只能查看自己学院的数据
create policy "college_read_own_batches" on public.college_batches
  for select using (
    exists (
      select 1 from public.user_profiles
      where auth_user_id = auth.uid() and role = 'college' and college_name = college_batches.college_name
    )
  );

create policy "college_insert_own_batches" on public.college_batches
  for insert with check (
    exists (
      select 1 from public.user_profiles
      where auth_user_id = auth.uid() and role = 'college' and college_name = college_batches.college_name
    )
  );

create policy "college_read_own_batch_rows" on public.batch_rows
  for select using (
    exists (
      select 1 from public.college_batches b
      join public.user_profiles p on p.auth_user_id = auth.uid() and p.role = 'college' and p.college_name = b.college_name
      where b.id = batch_rows.batch_id
    )
  );

create policy "college_insert_own_batch_rows" on public.batch_rows
  for insert with check (
    exists (
      select 1 from public.college_batches b
      join public.user_profiles p on p.auth_user_id = auth.uid() and p.role = 'college' and p.college_name = b.college_name
      where b.id = batch_rows.batch_id
    )
  );

-- 学院端可读取在校生库（只读）
create policy "college_read_enrolled" on public.enrolled_students
  for select using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role in ('admin', 'college'))
  );

-- 学院端可读取困难生库（只读）
create policy "college_read_hardship" on public.hardship_students
  for select using (
    exists (select 1 from public.user_profiles where auth_user_id = auth.uid() and role in ('admin', 'college'))
  );

-- -----------------------------------------------------------
-- 6. updated_at 自动更新触发器
-- -----------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_enrolled_students_updated_at
  before update on public.enrolled_students
  for each row execute function public.handle_updated_at();

create trigger set_hardship_students_updated_at
  before update on public.hardship_students
  for each row execute function public.handle_updated_at();

create trigger set_college_batches_updated_at
  before update on public.college_batches
  for each row execute function public.handle_updated_at();
