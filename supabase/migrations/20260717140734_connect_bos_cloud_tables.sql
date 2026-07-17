-- Connect the current BOS frontend data services to Supabase.
-- Legacy tables (students, award_records, difficulty_batches) are preserved.

create table if not exists public.enrolled_students (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  name text not null,
  id_card text,
  college text,
  department text,
  major text,
  class_name text,
  gender text,
  grade text,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrolled_students_uq unique (student_id)
);

create index if not exists idx_enrolled_students_id_card on public.enrolled_students (id_card);
create index if not exists idx_enrolled_students_college on public.enrolled_students (college);
create index if not exists idx_enrolled_students_name on public.enrolled_students (name);

create table if not exists public.hardship_students (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  student_id text,
  name text,
  id_card text,
  college text,
  major text,
  class_name text,
  hardship_level text,
  year text,
  special_type text,
  remark text,
  source_file text,
  imported_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hardship_students_key_uq unique (key)
);

create index if not exists idx_hardship_students_student_id on public.hardship_students (student_id);
create index if not exists idx_hardship_students_id_card on public.hardship_students (id_card);
create index if not exists idx_hardship_students_college on public.hardship_students (college);
create index if not exists idx_hardship_students_name on public.hardship_students (name);

create table if not exists public.college_batches (
  id uuid primary key default gen_random_uuid(),
  college_name text not null,
  data_type text not null check (data_type in ('student', 'family')),
  academic_year text not null,
  row_count integer not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded', 'reviewed', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint college_batches_uq unique (college_name, data_type, academic_year)
);

create index if not exists idx_college_batches_college on public.college_batches (college_name);
create index if not exists idx_college_batches_type on public.college_batches (data_type);
create index if not exists idx_college_batches_year on public.college_batches (academic_year);

create table if not exists public.batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.college_batches(id) on delete cascade,
  row_data jsonb not null default '{}'::jsonb,
  row_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_batch_rows_batch_id on public.batch_rows (batch_id);

create table if not exists public.award_batches (
  id uuid primary key default gen_random_uuid(),
  college_name text not null,
  award_type text not null check (award_type in ('national', 'inspirational', 'shanghai')),
  academic_year text not null,
  row_count integer not null default 0,
  review_status text not null default 'draft' check (review_status in ('draft', 'confirmed')),
  submit_status text not null default 'pending' check (submit_status in ('pending', 'submitted')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint award_batches_uq unique (college_name, award_type, academic_year)
);

create index if not exists idx_award_batches_college on public.award_batches (college_name);
create index if not exists idx_award_batches_type on public.award_batches (award_type);
create index if not exists idx_award_batches_year on public.award_batches (academic_year);

create table if not exists public.award_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.award_batches(id) on delete cascade,
  row_data jsonb not null default '{}'::jsonb,
  row_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_award_batch_rows_batch_id on public.award_batch_rows (batch_id);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_enrolled_students_updated_at on public.enrolled_students;
create trigger set_enrolled_students_updated_at
  before update on public.enrolled_students
  for each row execute function public.handle_updated_at();

drop trigger if exists set_hardship_students_updated_at on public.hardship_students;
create trigger set_hardship_students_updated_at
  before update on public.hardship_students
  for each row execute function public.handle_updated_at();

drop trigger if exists set_college_batches_updated_at on public.college_batches;
create trigger set_college_batches_updated_at
  before update on public.college_batches
  for each row execute function public.handle_updated_at();

drop trigger if exists set_award_batches_updated_at on public.award_batches;
create trigger set_award_batches_updated_at
  before update on public.award_batches
  for each row execute function public.handle_updated_at();

alter table public.enrolled_students enable row level security;
alter table public.hardship_students enable row level security;
alter table public.college_batches enable row level security;
alter table public.batch_rows enable row level security;
alter table public.award_batches enable row level security;
alter table public.award_batch_rows enable row level security;

grant select, insert, update, delete on table
  public.enrolled_students,
  public.hardship_students,
  public.college_batches,
  public.batch_rows,
  public.award_batches,
  public.award_batch_rows
to authenticated, service_role;

drop policy if exists admin_full_access_enrolled on public.enrolled_students;
create policy admin_full_access_enrolled on public.enrolled_students
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_enrolled on public.enrolled_students;
create policy college_read_enrolled on public.enrolled_students
  for select to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role in ('admin', 'college') and coalesce(profile.enabled, true)
  ));

drop policy if exists admin_full_access_hardship on public.hardship_students;
create policy admin_full_access_hardship on public.hardship_students
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_hardship on public.hardship_students;
create policy college_read_hardship on public.hardship_students
  for select to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role in ('admin', 'college') and coalesce(profile.enabled, true)
  ));

drop policy if exists admin_full_access_batches on public.college_batches;
create policy admin_full_access_batches on public.college_batches
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_own_batches on public.college_batches;
create policy college_read_own_batches on public.college_batches
  for select to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = college_batches.college_name
  ));

drop policy if exists college_insert_own_batches on public.college_batches;
create policy college_insert_own_batches on public.college_batches
  for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = college_batches.college_name
  ));

drop policy if exists college_update_own_batches on public.college_batches;
create policy college_update_own_batches on public.college_batches
  for update to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = college_batches.college_name
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = college_batches.college_name
  ));

drop policy if exists college_delete_own_batches on public.college_batches;
create policy college_delete_own_batches on public.college_batches
  for delete to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = college_batches.college_name
  ));

drop policy if exists admin_full_access_batch_rows on public.batch_rows;
create policy admin_full_access_batch_rows on public.batch_rows
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_own_batch_rows on public.batch_rows;
create policy college_read_own_batch_rows on public.batch_rows
  for select to authenticated
  using (exists (
    select 1 from public.college_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = batch_rows.batch_id
  ));

drop policy if exists college_insert_own_batch_rows on public.batch_rows;
create policy college_insert_own_batch_rows on public.batch_rows
  for insert to authenticated
  with check (exists (
    select 1 from public.college_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = batch_rows.batch_id
  ));

drop policy if exists college_update_own_batch_rows on public.batch_rows;
create policy college_update_own_batch_rows on public.batch_rows
  for update to authenticated
  using (exists (
    select 1 from public.college_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = batch_rows.batch_id
  ))
  with check (exists (
    select 1 from public.college_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = batch_rows.batch_id
  ));

drop policy if exists college_delete_own_batch_rows on public.batch_rows;
create policy college_delete_own_batch_rows on public.batch_rows
  for delete to authenticated
  using (exists (
    select 1 from public.college_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = batch_rows.batch_id
  ));

drop policy if exists admin_full_access_award_batches on public.award_batches;
create policy admin_full_access_award_batches on public.award_batches
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_own_award_batches on public.award_batches;
create policy college_read_own_award_batches on public.award_batches
  for select to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = award_batches.college_name
  ));

drop policy if exists college_insert_own_award_batches on public.award_batches;
create policy college_insert_own_award_batches on public.award_batches
  for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = award_batches.college_name
  ));

drop policy if exists college_update_own_award_batches on public.award_batches;
create policy college_update_own_award_batches on public.award_batches
  for update to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = award_batches.college_name
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = award_batches.college_name
  ));

drop policy if exists college_delete_own_award_batches on public.award_batches;
create policy college_delete_own_award_batches on public.award_batches
  for delete to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'college'
      and coalesce(profile.enabled, true) and profile.college_name = award_batches.college_name
  ));

drop policy if exists admin_full_access_award_batch_rows on public.award_batch_rows;
create policy admin_full_access_award_batch_rows on public.award_batch_rows
  for all to authenticated
  using (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ))
  with check (exists (
    select 1 from public.user_profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.role = 'admin' and coalesce(profile.enabled, true)
  ));

drop policy if exists college_read_own_award_batch_rows on public.award_batch_rows;
create policy college_read_own_award_batch_rows on public.award_batch_rows
  for select to authenticated
  using (exists (
    select 1 from public.award_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = award_batch_rows.batch_id
  ));

drop policy if exists college_insert_own_award_batch_rows on public.award_batch_rows;
create policy college_insert_own_award_batch_rows on public.award_batch_rows
  for insert to authenticated
  with check (exists (
    select 1 from public.award_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = award_batch_rows.batch_id
  ));

drop policy if exists college_update_own_award_batch_rows on public.award_batch_rows;
create policy college_update_own_award_batch_rows on public.award_batch_rows
  for update to authenticated
  using (exists (
    select 1 from public.award_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = award_batch_rows.batch_id
  ))
  with check (exists (
    select 1 from public.award_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = award_batch_rows.batch_id
  ));

drop policy if exists college_delete_own_award_batch_rows on public.award_batch_rows;
create policy college_delete_own_award_batch_rows on public.award_batch_rows
  for delete to authenticated
  using (exists (
    select 1 from public.award_batches batch
    join public.user_profiles profile on profile.auth_user_id = (select auth.uid())
      and profile.role = 'college' and coalesce(profile.enabled, true)
      and profile.college_name = batch.college_name
    where batch.id = award_batch_rows.batch_id
  ));
