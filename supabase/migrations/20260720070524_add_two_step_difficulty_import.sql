-- 困难生两阶段导入：校验阶段不写业务表，确认阶段在单一事务内批量原子落库。

begin;

create or replace function public.confirm_difficulty_student_import(
  p_rows jsonb,
  p_college_name text,
  p_operator_user_id uuid default null,
  p_operator_role text default null,
  p_operator_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payload jsonb;
  saved_student public.students%rowtype;
  inserted_count integer := 0;
  normalized_college text := btrim(coalesce(p_college_name, ''));
  duplicate_row record;
  missing_enrollment record;
  existing_student record;
begin
  if p_rows is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0 then
    raise exception using
      errcode = '22023',
      message = '正式导入数据不能为空';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception using
      errcode = '22023',
      message = '单次正式导入最多支持 5000 条数据';
  end if;

  if normalized_college = '' then
    raise exception using
      errcode = '22023',
      message = '正式导入必须明确所属学院';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item(payload)
    where nullif(btrim(item.payload ->> 'student_id'), '') is null
      or nullif(btrim(item.payload ->> 'academic_year'), '') is null
      or nullif(btrim(item.payload ->> 'name'), '') is null
      or btrim(coalesce(item.payload ->> 'college_name', '')) <> normalized_college
  ) then
    raise exception using
      errcode = '22023',
      message = '正式导入数据缺少学号、学年、姓名，或包含其他学院记录';
  end if;

  select
    btrim(item.payload ->> 'student_id') as student_id,
    btrim(item.payload ->> 'academic_year') as academic_year,
    count(*) as row_count
  into duplicate_row
  from jsonb_array_elements(p_rows) as item(payload)
  group by
    btrim(item.payload ->> 'student_id'),
    btrim(item.payload ->> 'academic_year')
  having count(*) > 1
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '学号 %s 在 %s 学年于本次导入中重复',
        duplicate_row.student_id,
        duplicate_row.academic_year
      ),
      constraint = 'students_student_academic_year_uq';
  end if;

  select
    btrim(item.payload ->> 'student_id') as student_id,
    btrim(item.payload ->> 'name') as student_name
  into missing_enrollment
  from jsonb_array_elements(p_rows) as item(payload)
  where not exists (
    select 1
    from public.enrolled_students enrollment
    where btrim(enrollment.student_id) = btrim(item.payload ->> 'student_id')
  )
  limit 1;

  if found then
    raise exception using
      errcode = '23503',
      message = format(
        '学生 %s（学号：%s）没有学籍记录',
        coalesce(nullif(missing_enrollment.student_name, ''), '未填写姓名'),
        missing_enrollment.student_id
      );
  end if;

  select
    student.student_id,
    student.academic_year,
    student.name
  into existing_student
  from public.students student
  join jsonb_array_elements(p_rows) as item(payload)
    on btrim(student.student_id) = btrim(item.payload ->> 'student_id')
   and btrim(student.academic_year) = btrim(item.payload ->> 'academic_year')
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      message = format(
        '学号 %s 在 %s 学年已存在困难生认定记录（姓名：%s）',
        existing_student.student_id,
        existing_student.academic_year,
        coalesce(nullif(existing_student.name, ''), '未填写姓名')
      ),
      constraint = 'students_student_academic_year_uq';
  end if;

  for payload in
    select item.payload
    from jsonb_array_elements(p_rows) as item(payload)
  loop
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
      raw_data,
      updated_at
    ) values (
      btrim(payload ->> 'academic_year'),
      normalized_college,
      btrim(payload ->> 'student_id'),
      btrim(payload ->> 'name'),
      upper(regexp_replace(coalesce(payload ->> 'id_card', ''), '[-[:space:]]', '', 'g')),
      nullif(btrim(coalesce(payload ->> 'grade', '')), ''),
      nullif(btrim(coalesce(payload ->> 'gender', '')), ''),
      nullif(btrim(coalesce(payload ->> 'difficulty_level', '')), ''),
      'draft',
      false,
      null,
      coalesce(payload -> 'raw_data', '{}'::jsonb),
      now()
    )
    returning * into saved_student;

    perform public.log_operation(
      'difficulty_student',
      saved_student.id::text,
      'edit',
      p_operator_user_id,
      p_operator_role,
      p_operator_name,
      null,
      'draft',
      '困难生数据两阶段正式导入',
      jsonb_build_object(
        'student_id', saved_student.student_id,
        'name', saved_student.name,
        'academic_year', saved_student.academic_year,
        'college_name', saved_student.college_name,
        'difficulty_level', saved_student.difficulty_level
      )
    );

    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'failed', 0,
    'status', 'draft'
  );
end;
$$;

revoke all on function public.confirm_difficulty_student_import(
  jsonb,
  text,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.confirm_difficulty_student_import(
  jsonb,
  text,
  uuid,
  text,
  text
) to service_role;

commit;
