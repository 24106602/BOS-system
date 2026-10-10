-- ============================================================
-- BOS 数据治理平台 - SQL Server 触发器脚本
-- 在 002_create_indexes.sql 之后执行
-- 功能：updated_at 自动更新
-- ============================================================

USE BOS_System;
GO

-- -----------------------------------------------------------
-- updated_at 自动更新触发器函数
-- SQL Server 使用触发器而非函数，直接为每张表创建
-- -----------------------------------------------------------

-- 1. users 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_users_updated_at' AND parent_id = OBJECT_ID('dbo.users'))
    DROP TRIGGER dbo.trg_users_updated_at;
GO

CREATE TRIGGER dbo.trg_users_updated_at
ON dbo.users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.users
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.users u
    INNER JOIN inserted i ON u.id = i.id;
END
GO
PRINT 'Trigger trg_users_updated_at created.';

-- 2. enrolled_students 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_enrolled_students_updated_at' AND parent_id = OBJECT_ID('dbo.enrolled_students'))
    DROP TRIGGER dbo.trg_enrolled_students_updated_at;
GO

CREATE TRIGGER dbo.trg_enrolled_students_updated_at
ON dbo.enrolled_students
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.enrolled_students
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.enrolled_students e
    INNER JOIN inserted i ON e.id = i.id;
END
GO
PRINT 'Trigger trg_enrolled_students_updated_at created.';

-- 3. hardship_students 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_hardship_students_updated_at' AND parent_id = OBJECT_ID('dbo.hardship_students'))
    DROP TRIGGER dbo.trg_hardship_students_updated_at;
GO

CREATE TRIGGER dbo.trg_hardship_students_updated_at
ON dbo.hardship_students
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.hardship_students
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.hardship_students h
    INNER JOIN inserted i ON h.id = i.id;
END
GO
PRINT 'Trigger trg_hardship_students_updated_at created.';

-- 4. college_batches 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_college_batches_updated_at' AND parent_id = OBJECT_ID('dbo.college_batches'))
    DROP TRIGGER dbo.trg_college_batches_updated_at;
GO

CREATE TRIGGER dbo.trg_college_batches_updated_at
ON dbo.college_batches
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.college_batches
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.college_batches c
    INNER JOIN inserted i ON c.id = i.id;
END
GO
PRINT 'Trigger trg_college_batches_updated_at created.';

-- 5. award_batches 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_award_batches_updated_at' AND parent_id = OBJECT_ID('dbo.award_batches'))
    DROP TRIGGER dbo.trg_award_batches_updated_at;
GO

CREATE TRIGGER dbo.trg_award_batches_updated_at
ON dbo.award_batches
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.award_batches
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.award_batches a
    INNER JOIN inserted i ON a.id = i.id;
END
GO
PRINT 'Trigger trg_award_batches_updated_at created.';

-- 6. difficulty_policy_documents 表
IF EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_policy_docs_updated_at' AND parent_id = OBJECT_ID('dbo.difficulty_policy_documents'))
    DROP TRIGGER dbo.trg_policy_docs_updated_at;
GO

CREATE TRIGGER dbo.trg_policy_docs_updated_at
ON dbo.difficulty_policy_documents
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.difficulty_policy_documents
    SET updated_at = SYSDATETIMEOFFSET()
    FROM dbo.difficulty_policy_documents d
    INNER JOIN inserted i ON d.id = i.id;
END
GO
PRINT 'Trigger trg_policy_docs_updated_at created.';

GO
PRINT '========================================';
PRINT '所有触发器创建完成！';
PRINT '========================================';
