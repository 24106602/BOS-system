-- ============================================================
-- BOS 数据治理平台 - SQL Server 数据库表结构
-- 执行方式：在 SQL Server Management Studio 中按顺序执行
-- 数据库：请先创建数据库 BOS_System 再执行此脚本
-- ============================================================

USE BOS_System;
GO

-- -----------------------------------------------------------
-- 1. 用户表（自建认证系统）
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.users (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(20) NOT NULL DEFAULT 'college', -- admin | college
        college_name NVARCHAR(100) NULL,
        display_name NVARCHAR(100) NULL,
        enabled BIT NOT NULL DEFAULT 1,
        last_login_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT users_email_uq UNIQUE (email)
    );
    PRINT 'Table dbo.users created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.users already exists.';
END
GO

-- -----------------------------------------------------------
-- 2. 在校生数据库表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'enrolled_students' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.enrolled_students (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        student_id NVARCHAR(50) NOT NULL,
        name NVARCHAR(100) NOT NULL,
        id_card NVARCHAR(50) NULL,
        college NVARCHAR(100) NULL,
        department NVARCHAR(100) NULL,
        major NVARCHAR(100) NULL,
        class_name NVARCHAR(100) NULL,
        gender NVARCHAR(10) NULL,
        grade NVARCHAR(20) NULL,
        academic_year NVARCHAR(20) NULL,
        semester NVARCHAR(20) NULL,
        examinee_id NVARCHAR(50) NULL,
        id_card_type NVARCHAR(20) NULL,
        birth_date NVARCHAR(20) NULL,
        political_status NVARCHAR(50) NULL,
        nationality NVARCHAR(50) NULL,
        student_type NVARCHAR(50) NULL,
        study_form NVARCHAR(50) NULL,
        counselor_name NVARCHAR(100) NULL,
        major_category NVARCHAR(50) NULL,
        level NVARCHAR(20) NULL,
        school_system NVARCHAR(20) NULL,
        enrollment_date NVARCHAR(20) NULL,
        is_rural_student NVARCHAR(10) NULL,
        student_source NVARCHAR(50) NULL,
        phone NVARCHAR(50) NULL,
        source_file NVARCHAR(255) NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        deleted_by UNIQUEIDENTIFIER NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT enrolled_students_uq UNIQUE (student_id)
    );
    PRINT 'Table dbo.enrolled_students created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.enrolled_students already exists.';
END
GO

-- -----------------------------------------------------------
-- 3. 困难生数据库表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'hardship_students' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.hardship_students (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        [key] NVARCHAR(100) NOT NULL,
        student_id NVARCHAR(50) NULL,
        name NVARCHAR(100) NULL,
        id_card NVARCHAR(50) NULL,
        college NVARCHAR(100) NULL,
        major NVARCHAR(100) NULL,
        class_name NVARCHAR(100) NULL,
        hardship_level NVARCHAR(50) NULL,
        [year] NVARCHAR(20) NULL,
        special_type NVARCHAR(100) NULL,
        remark NVARCHAR(500) NULL,
        source_file NVARCHAR(255) NULL,
        imported_at NVARCHAR(50) NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        deleted_by UNIQUEIDENTIFIER NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT hardship_students_key_uq UNIQUE ([key])
    );
    PRINT 'Table dbo.hardship_students created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.hardship_students already exists.';
END
GO

-- -----------------------------------------------------------
-- 4. 学院提交批次表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'college_batches' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.college_batches (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        college_name NVARCHAR(100) NOT NULL,
        data_type NVARCHAR(20) NOT NULL, -- student | family
        academic_year NVARCHAR(20) NOT NULL,
        row_count INT NOT NULL DEFAULT 0,
        status NVARCHAR(20) NOT NULL DEFAULT 'uploaded', -- uploaded | reviewed | approved
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        deleted_by UNIQUEIDENTIFIER NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT college_batches_uq UNIQUE (college_name, data_type, academic_year),
        CONSTRAINT college_batches_data_type_ck CHECK (data_type IN ('student', 'family')),
        CONSTRAINT college_batches_status_ck CHECK (status IN ('uploaded', 'reviewed', 'approved'))
    );
    PRINT 'Table dbo.college_batches created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.college_batches already exists.';
END
GO

-- -----------------------------------------------------------
-- 5. 批次明细数据表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'batch_rows' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.batch_rows (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        batch_id UNIQUEIDENTIFIER NOT NULL,
        row_data NVARCHAR(MAX) NOT NULL DEFAULT '{}', -- JSON 格式
        row_index INT NOT NULL DEFAULT 0,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT batch_rows_batch_id_fk FOREIGN KEY (batch_id)
            REFERENCES dbo.college_batches(id) ON DELETE CASCADE
    );
    PRINT 'Table dbo.batch_rows created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.batch_rows already exists.';
END
GO

-- -----------------------------------------------------------
-- 6. 三大奖提交批次表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'award_batches' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.award_batches (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        college_name NVARCHAR(100) NOT NULL,
        award_type NVARCHAR(20) NOT NULL, -- national | inspirational | shanghai
        academic_year NVARCHAR(20) NOT NULL,
        row_count INT NOT NULL DEFAULT 0,
        review_status NVARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | confirmed
        submit_status NVARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | submitted
        confirmed_at DATETIMEOFFSET NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        deleted_by UNIQUEIDENTIFIER NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT award_batches_uq UNIQUE (college_name, award_type, academic_year),
        CONSTRAINT award_batches_award_type_ck CHECK (award_type IN ('national', 'inspirational', 'shanghai')),
        CONSTRAINT award_batches_review_status_ck CHECK (review_status IN ('draft', 'confirmed')),
        CONSTRAINT award_batches_submit_status_ck CHECK (submit_status IN ('pending', 'submitted'))
    );
    PRINT 'Table dbo.award_batches created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.award_batches already exists.';
END
GO

-- -----------------------------------------------------------
-- 7. 三大奖批次明细数据表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'award_batch_rows' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.award_batch_rows (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        batch_id UNIQUEIDENTIFIER NOT NULL,
        row_data NVARCHAR(MAX) NOT NULL DEFAULT '{}', -- JSON 格式
        row_index INT NOT NULL DEFAULT 0,
        is_deleted BIT NOT NULL DEFAULT 0,
        deleted_at DATETIMEOFFSET NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT award_batch_rows_batch_id_fk FOREIGN KEY (batch_id)
            REFERENCES dbo.award_batches(id) ON DELETE CASCADE
    );
    PRINT 'Table dbo.award_batch_rows created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.award_batch_rows already exists.';
END
GO

-- -----------------------------------------------------------
-- 8. 困难生认定办法文档表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'difficulty_policy_documents' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.difficulty_policy_documents (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        academic_year NVARCHAR(20) NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        file_path NVARCHAR(500) NULL,
        file_size BIGINT NULL,
        uploaded_by UNIQUEIDENTIFIER NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        updated_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
    PRINT 'Table dbo.difficulty_policy_documents created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.difficulty_policy_documents already exists.';
END
GO

-- -----------------------------------------------------------
-- 9. 操作日志表
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'operation_logs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.operation_logs (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NULL,
        user_email NVARCHAR(255) NULL,
        action NVARCHAR(100) NOT NULL,
        module NVARCHAR(50) NOT NULL,
        detail NVARCHAR(MAX) NULL, -- JSON 格式
        ip_address NVARCHAR(50) NULL,
        created_at DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET()
    );
    PRINT 'Table dbo.operation_logs created.';
END
ELSE
BEGIN
    PRINT 'Table dbo.operation_logs already exists.';
END
GO

PRINT '========================================';
PRINT '所有表创建完成！';
PRINT '========================================';
