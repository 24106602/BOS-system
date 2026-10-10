/**
 * 在校生 Repository - SQL Server 实现
 */
import { query, sql } from "./connection.js";

function mapEnrolledRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    idCard: row.id_card,
    college: row.college,
    department: row.department,
    major: row.major,
    className: row.class_name,
    gender: row.gender,
    grade: row.grade,
    academicYear: row.academic_year,
    semester: row.semester,
    examineeId: row.examinee_id,
    idCardType: row.id_card_type,
    birthDate: row.birth_date,
    politicalStatus: row.political_status,
    nationality: row.nationality,
    studentType: row.student_type,
    studyForm: row.study_form,
    counselorName: row.counselor_name,
    majorCategory: row.major_category,
    level: row.level,
    schoolSystem: row.school_system,
    enrollmentDate: row.enrollment_date,
    isRuralStudent: row.is_rural_student,
    studentSource: row.student_source,
    phone: row.phone,
    sourceFile: row.source_file,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRowData(student) {
  return {
    student_id: student.studentId,
    name: student.name,
    id_card: student.idCard || null,
    college: student.college || null,
    department: student.department || null,
    major: student.major || null,
    class_name: student.className || null,
    gender: student.gender || null,
    grade: student.grade || null,
    academic_year: student.academicYear || null,
    semester: student.semester || null,
    examinee_id: student.examineeId || null,
    id_card_type: student.idCardType || null,
    birth_date: student.birthDate || null,
    political_status: student.politicalStatus || null,
    nationality: student.nationality || null,
    student_type: student.studentType || null,
    study_form: student.studyForm || null,
    counselor_name: student.counselorName || null,
    major_category: student.majorCategory || null,
    level: student.level || null,
    school_system: student.schoolSystem || null,
    enrollment_date: student.enrollmentDate || null,
    is_rural_student: student.isRuralStudent || null,
    student_source: student.studentSource || null,
    phone: student.phone || null,
    source_file: student.sourceFile || null,
  };
}

export const enrolledStudentRepository = {
  async findAll(options = {}) {
    const { includeDeleted = false, college, offset = 0, limit = 1000 } = options;
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE 1=1";
    const params = { offset, limit };

    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    if (college) {
      sqlText += " AND college = @college";
      params.college = college;
    }

    sqlText += " ORDER BY student_id ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    const rows = await query(sqlText, params);
    return rows.map(mapEnrolledRow);
  },

  async findByStudentId(studentId, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE student_id = @studentId";
    const params = { studentId };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.length > 0 ? mapEnrolledRow(rows[0]) : null;
  },

  async findByIdCard(idCard, includeDeleted = false) {
    let sqlText = "SELECT * FROM dbo.enrolled_students WHERE id_card = @idCard";
    const params = { idCard };
    if (!includeDeleted) {
      sqlText += " AND is_deleted = 0";
    }
    const rows = await query(sqlText, params);
    return rows.length > 0 ? mapEnrolledRow(rows[0]) : null;
  },

  async verifyStudent(studentId, idCard, name) {
    // 按学号查找
    if (studentId) {
      const rows = await query(
        "SELECT name FROM dbo.enrolled_students WHERE student_id = @studentId AND is_deleted = 0",
        { studentId }
      );
      if (rows.length > 0) {
        if (rows[0].name === name) return { verified: true };
        return { verified: false, reason: "学号匹配但姓名不匹配，请核对" };
      }
    }

    // 按身份证号查找
    if (idCard) {
      const rows = await query(
        "SELECT name FROM dbo.enrolled_students WHERE id_card = @idCard AND is_deleted = 0",
        { idCard }
      );
      if (rows.length > 0) {
        if (rows[0].name === name) return { verified: true };
        return { verified: false, reason: "身份证号匹配但姓名不匹配，请核对" };
      }
    }

    return {
      verified: false,
      reason: "未在在校生数据库中找到该学生，请核对学号或身份证号+姓名",
    };
  },

  async count(includeDeleted = false) {
    let sqlText = "SELECT COUNT(*) as total FROM dbo.enrolled_students";
    if (!includeDeleted) {
      sqlText += " WHERE is_deleted = 0";
    }
    const rows = await query(sqlText);
    return rows[0].total;
  },

  async bulkUpsert(students) {
    if (students.length === 0) return 0;

    const pool = await require("./connection.js").getPool();
    const table = new sql.Table("enrolled_students");
    table.create = false;

    // 定义列
    table.columns.add("student_id", sql.NVarChar(50), { nullable: false });
    table.columns.add("name", sql.NVarChar(100), { nullable: false });
    table.columns.add("id_card", sql.NVarChar(50), { nullable: true });
    table.columns.add("college", sql.NVarChar(100), { nullable: true });
    table.columns.add("department", sql.NVarChar(100), { nullable: true });
    table.columns.add("major", sql.NVarChar(100), { nullable: true });
    table.columns.add("class_name", sql.NVarChar(100), { nullable: true });
    table.columns.add("gender", sql.NVarChar(10), { nullable: true });
    table.columns.add("grade", sql.NVarChar(20), { nullable: true });
    table.columns.add("academic_year", sql.NVarChar(20), { nullable: true });
    table.columns.add("semester", sql.NVarChar(20), { nullable: true });
    table.columns.add("examinee_id", sql.NVarChar(50), { nullable: true });
    table.columns.add("id_card_type", sql.NVarChar(20), { nullable: true });
    table.columns.add("birth_date", sql.NVarChar(20), { nullable: true });
    table.columns.add("political_status", sql.NVarChar(50), { nullable: true });
    table.columns.add("nationality", sql.NVarChar(50), { nullable: true });
    table.columns.add("student_type", sql.NVarChar(50), { nullable: true });
    table.columns.add("study_form", sql.NVarChar(50), { nullable: true });
    table.columns.add("counselor_name", sql.NVarChar(100), { nullable: true });
    table.columns.add("major_category", sql.NVarChar(50), { nullable: true });
    table.columns.add("level", sql.NVarChar(20), { nullable: true });
    table.columns.add("school_system", sql.NVarChar(20), { nullable: true });
    table.columns.add("enrollment_date", sql.NVarChar(20), { nullable: true });
    table.columns.add("is_rural_student", sql.NVarChar(10), { nullable: true });
    table.columns.add("student_source", sql.NVarChar(50), { nullable: true });
    table.columns.add("phone", sql.NVarChar(50), { nullable: true });
    table.columns.add("source_file", sql.NVarChar(255), { nullable: true });
    table.columns.add("is_deleted", sql.Bit, { nullable: false });
    table.columns.add("deleted_at", sql.DateTimeOffset, { nullable: true });

    // 添加行
    for (const s of students) {
      const row = toRowData(s);
      table.rows.add(
        row.student_id, row.name, row.id_card, row.college, row.department,
        row.major, row.class_name, row.gender, row.grade, row.academic_year,
        row.semester, row.examinee_id, row.id_card_type, row.birth_date,
        row.political_status, row.nationality, row.student_type, row.study_form,
        row.counselor_name, row.major_category, row.level, row.school_system,
        row.enrollment_date, row.is_rural_student, row.student_source, row.phone,
        row.source_file, false, null
      );
    }

    // 使用 MERGE 进行 upsert
    const tempTableName = "#temp_enrolled_students";
    const request = pool.request();

    // 创建临时表并批量插入
    await request.query(`
      SELECT TOP 0 * INTO ${tempTableName} FROM dbo.enrolled_students;
    `);

    // 批量插入到临时表（使用 bulk insert）
    const tempTable = new sql.Table(tempTableName);
    tempTable.create = false;
    // 复制列定义
    table.columns.forEach((col) => {
      tempTable.columns.add(col.name, col.type, { nullable: col.nullable });
    });
    table.rows.forEach((row) => {
      tempTable.rows.add(...row);
    });

    await pool.request().bulk(tempTable);

    // MERGE 操作
    const mergeResult = await pool.request().query(`
      MERGE dbo.enrolled_students AS target
      USING ${tempTableName} AS source
      ON target.student_id = source.student_id
      WHEN MATCHED THEN
        UPDATE SET
          name = source.name,
          id_card = source.id_card,
          college = source.college,
          department = source.department,
          major = source.major,
          class_name = source.class_name,
          gender = source.gender,
          grade = source.grade,
          academic_year = source.academic_year,
          semester = source.semester,
          examinee_id = source.examinee_id,
          id_card_type = source.id_card_type,
          birth_date = source.birth_date,
          political_status = source.political_status,
          nationality = source.nationality,
          student_type = source.student_type,
          study_form = source.study_form,
          counselor_name = source.counselor_name,
          major_category = source.major_category,
          level = source.level,
          school_system = source.school_system,
          enrollment_date = source.enrollment_date,
          is_rural_student = source.is_rural_student,
          student_source = source.student_source,
          phone = source.phone,
          source_file = source.source_file,
          is_deleted = 0,
          deleted_at = NULL
      WHEN NOT MATCHED THEN
        INSERT (student_id, name, id_card, college, department, major, class_name,
                gender, grade, academic_year, semester, examinee_id, id_card_type,
                birth_date, political_status, nationality, student_type, study_form,
                counselor_name, major_category, level, school_system, enrollment_date,
                is_rural_student, student_source, phone, source_file, is_deleted)
        VALUES (source.student_id, source.name, source.id_card, source.college,
                source.department, source.major, source.class_name, source.gender,
                source.grade, source.academic_year, source.semester, source.examinee_id,
                source.id_card_type, source.birth_date, source.political_status,
                source.nationality, source.student_type, source.study_form,
                source.counselor_name, source.major_category, source.level,
                source.school_system, source.enrollment_date, source.is_rural_student,
                source.student_source, source.phone, source.source_file, 0);

      DROP TABLE ${tempTableName};
    `);

    return students.length;
  },

  async softDeleteAll() {
    await query(
      "UPDATE dbo.enrolled_students SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET() WHERE is_deleted = 0"
    );
  },

  async softDeleteByStudentIds(studentIds) {
    if (studentIds.length === 0) return;
    const ids = studentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    await query(
      `UPDATE dbo.enrolled_students SET is_deleted = 1, deleted_at = SYSDATETIMEOFFSET()
       WHERE student_id IN (${ids}) AND is_deleted = 0`
    );
  },
};
