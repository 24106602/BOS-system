-- ============================================================
-- BOS System - 困难生本专科信息表 & 家庭成员信息表
-- ============================================================
USE BOS_System;
GO

-- ------------------------------------------------------------
-- 1. 困难生本专科信息表（difficulty_students）
--    对应前端 difficultyStudentTemplate.ts 的 41 个字段
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'difficulty_students')
BEGIN
    CREATE TABLE dbo.difficulty_students (
        id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        [key]           NVARCHAR(200)    NOT NULL,
        academic_year   NVARCHAR(20)     NULL,
        semester        NVARCHAR(20)     NULL,
        college_name    NVARCHAR(100)    NULL,

        -- 基本信息
        name            NVARCHAR(100)    NOT NULL,
        student_id      NVARCHAR(50)     NULL,
        id_card         NVARCHAR(50)     NULL,
        native_place    NVARCHAR(200)    NULL,
        phone           NVARCHAR(50)     NULL,
        counselor_name  NVARCHAR(100)    NULL,

        -- 家庭经济信息
        family_population       INT             NULL,
        labor_population       INT             NULL,
        unemployed_population  INT             NULL,
        dependent_population   INT             NULL,
        family_income          NVARCHAR(50)    NULL,
        family_address         NVARCHAR(500)   NULL,
        postcode               NVARCHAR(20)    NULL,
        parent_phone           NVARCHAR(50)    NULL,
        income_source          NVARCHAR(200)   NULL,
        family_debt_amount      NVARCHAR(50)    NULL,
        family_debt_reason     NVARCHAR(500)   NULL,

        -- 特殊困难类型
        special_difficulty_type    NVARCHAR(200)   NULL,
        household_type             NVARCHAR(50)    NULL,
        is_wubao_household         NVARCHAR(10)    NULL,
        is_single_parent_child     NVARCHAR(10)    NULL,
        disability_category        NVARCHAR(100)   NULL,
        parents_lost_labor_ability NVARCHAR(10)   NULL,
        has_major_disease_patient  NVARCHAR(10)    NULL,

        -- 灾害/突发事件
        has_natural_disaster           NVARCHAR(10)    NULL,
        natural_disaster_description   NVARCHAR(500)   NULL,
        has_unexpected_event           NVARCHAR(10)    NULL,
        unexpected_event_description   NVARCHAR(500)   NULL,
        family_disability_weak_labor   NVARCHAR(500)   NULL,
        family_unemployment_situation  NVARCHAR(500)   NULL,

        -- 其他
        other_situation        NVARCHAR(500)   NULL,

        -- 认定/审核
        application_date           NVARCHAR(20)    NULL,
        final_recommend_level      NVARCHAR(50)    NULL,
        student_statement          NVARCHAR(500)   NULL,
        recognition_date           NVARCHAR(20)    NULL,
        agrees_review_group        NVARCHAR(10)    NULL,
        college_recommend_level    NVARCHAR(50)    NULL,
        college_opinion            NVARCHAR(500)   NULL,
        agrees_college_working_group NVARCHAR(10)  NULL,
        school_recommend_level     NVARCHAR(50)    NULL,
        school_opinion             NVARCHAR(500)   NULL,

        -- 来源/审计
        source_file        NVARCHAR(255)   NULL,
        imported_at       NVARCHAR(50)     NULL,
        is_deleted         BIT             NOT NULL DEFAULT 0,
        deleted_at        DATETIMEOFFSET  NULL,
        deleted_by        NVARCHAR(255)   NULL,
        created_at        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    );

    CREATE UNIQUE INDEX UX_difficulty_students_key
        ON dbo.difficulty_students([key]) WHERE is_deleted = 0;
    CREATE INDEX IX_difficulty_students_id_card
        ON dbo.difficulty_students(id_card) WHERE is_deleted = 0;
    CREATE INDEX IX_difficulty_students_student_id
        ON dbo.difficulty_students(student_id) WHERE is_deleted = 0;
    CREATE INDEX IX_difficulty_students_college_year
        ON dbo.difficulty_students(college_name, academic_year) WHERE is_deleted = 0;

    PRINT 'Table difficulty_students created.';
END
ELSE
BEGIN
    PRINT 'Table difficulty_students already exists.';
END
GO

-- ------------------------------------------------------------
-- 2. 家庭成员信息表（difficulty_family_members）
--    对应前端 difficultyFamilyTemplate.ts 的 10 个字段
-- ------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'difficulty_family_members')
BEGIN
    CREATE TABLE dbo.difficulty_family_members (
        id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        [key]           NVARCHAR(200)    NOT NULL,
        academic_year   NVARCHAR(20)     NULL,
        semester        NVARCHAR(20)     NULL,
        student_id_card NVARCHAR(50)     NOT NULL,

        -- 家庭成员信息
        member_name     NVARCHAR(100)    NOT NULL,
        member_age      INT              NULL,
        relation        NVARCHAR(50)     NULL,
        work_unit       NVARCHAR(200)    NULL,
        annual_income   NVARCHAR(50)     NULL,
        occupation      NVARCHAR(100)    NULL,
        health_status   NVARCHAR(100)    NULL,

        -- 来源/审计
        source_file        NVARCHAR(255)   NULL,
        imported_at        NVARCHAR(50)    NULL,
        is_deleted         BIT             NOT NULL DEFAULT 0,
        deleted_at        DATETIMEOFFSET  NULL,
        created_at        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at        DATETIMEOFFSET  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    );

    CREATE INDEX IX_diff_family_members_student_id_card
        ON dbo.difficulty_family_members(student_id_card) WHERE is_deleted = 0;
    CREATE INDEX IX_diff_family_members_key
        ON dbo.difficulty_family_members([key]) WHERE is_deleted = 0;

    PRINT 'Table difficulty_family_members created.';
END
ELSE
BEGIN
    PRINT 'Table difficulty_family_members already exists.';
END
GO

-- 验证
SELECT name AS table_name FROM sys.tables WHERE name IN ('difficulty_students', 'difficulty_family_members') ORDER BY name;
GO
