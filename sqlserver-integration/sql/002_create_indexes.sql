-- ============================================================
-- BOS 数据治理平台 - SQL Server 索引脚本
-- 在 001_create_tables.sql 之后执行
-- ============================================================

USE BOS_System;
GO

-- -----------------------------------------------------------
-- 在校生表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_enrolled_students_id_card' AND object_id = OBJECT_ID('dbo.enrolled_students'))
BEGIN
    CREATE INDEX idx_enrolled_students_id_card ON dbo.enrolled_students (id_card);
    PRINT 'Index idx_enrolled_students_id_card created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_enrolled_students_college' AND object_id = OBJECT_ID('dbo.enrolled_students'))
BEGIN
    CREATE INDEX idx_enrolled_students_college ON dbo.enrolled_students (college);
    PRINT 'Index idx_enrolled_students_college created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_enrolled_students_name' AND object_id = OBJECT_ID('dbo.enrolled_students'))
BEGIN
    CREATE INDEX idx_enrolled_students_name ON dbo.enrolled_students (name);
    PRINT 'Index idx_enrolled_students_name created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_enrolled_students_is_deleted' AND object_id = OBJECT_ID('dbo.enrolled_students'))
BEGIN
    CREATE INDEX idx_enrolled_students_is_deleted ON dbo.enrolled_students (is_deleted);
    PRINT 'Index idx_enrolled_students_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 困难生表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_hardship_students_student_id' AND object_id = OBJECT_ID('dbo.hardship_students'))
BEGIN
    CREATE INDEX idx_hardship_students_student_id ON dbo.hardship_students (student_id);
    PRINT 'Index idx_hardship_students_student_id created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_hardship_students_id_card' AND object_id = OBJECT_ID('dbo.hardship_students'))
BEGIN
    CREATE INDEX idx_hardship_students_id_card ON dbo.hardship_students (id_card);
    PRINT 'Index idx_hardship_students_id_card created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_hardship_students_college' AND object_id = OBJECT_ID('dbo.hardship_students'))
BEGIN
    CREATE INDEX idx_hardship_students_college ON dbo.hardship_students (college);
    PRINT 'Index idx_hardship_students_college created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_hardship_students_name' AND object_id = OBJECT_ID('dbo.hardship_students'))
BEGIN
    CREATE INDEX idx_hardship_students_name ON dbo.hardship_students (name);
    PRINT 'Index idx_hardship_students_name created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_hardship_students_is_deleted' AND object_id = OBJECT_ID('dbo.hardship_students'))
BEGIN
    CREATE INDEX idx_hardship_students_is_deleted ON dbo.hardship_students (is_deleted);
    PRINT 'Index idx_hardship_students_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 学院批次表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_college_batches_college' AND object_id = OBJECT_ID('dbo.college_batches'))
BEGIN
    CREATE INDEX idx_college_batches_college ON dbo.college_batches (college_name);
    PRINT 'Index idx_college_batches_college created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_college_batches_type' AND object_id = OBJECT_ID('dbo.college_batches'))
BEGIN
    CREATE INDEX idx_college_batches_type ON dbo.college_batches (data_type);
    PRINT 'Index idx_college_batches_type created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_college_batches_year' AND object_id = OBJECT_ID('dbo.college_batches'))
BEGIN
    CREATE INDEX idx_college_batches_year ON dbo.college_batches (academic_year);
    PRINT 'Index idx_college_batches_year created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_college_batches_is_deleted' AND object_id = OBJECT_ID('dbo.college_batches'))
BEGIN
    CREATE INDEX idx_college_batches_is_deleted ON dbo.college_batches (is_deleted);
    PRINT 'Index idx_college_batches_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 批次明细表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_batch_rows_batch_id' AND object_id = OBJECT_ID('dbo.batch_rows'))
BEGIN
    CREATE INDEX idx_batch_rows_batch_id ON dbo.batch_rows (batch_id);
    PRINT 'Index idx_batch_rows_batch_id created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_batch_rows_is_deleted' AND object_id = OBJECT_ID('dbo.batch_rows'))
BEGIN
    CREATE INDEX idx_batch_rows_is_deleted ON dbo.batch_rows (is_deleted);
    PRINT 'Index idx_batch_rows_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 三大奖批次表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batches_college' AND object_id = OBJECT_ID('dbo.award_batches'))
BEGIN
    CREATE INDEX idx_award_batches_college ON dbo.award_batches (college_name);
    PRINT 'Index idx_award_batches_college created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batches_type' AND object_id = OBJECT_ID('dbo.award_batches'))
BEGIN
    CREATE INDEX idx_award_batches_type ON dbo.award_batches (award_type);
    PRINT 'Index idx_award_batches_type created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batches_year' AND object_id = OBJECT_ID('dbo.award_batches'))
BEGIN
    CREATE INDEX idx_award_batches_year ON dbo.award_batches (academic_year);
    PRINT 'Index idx_award_batches_year created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batches_is_deleted' AND object_id = OBJECT_ID('dbo.award_batches'))
BEGIN
    CREATE INDEX idx_award_batches_is_deleted ON dbo.award_batches (is_deleted);
    PRINT 'Index idx_award_batches_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 三大奖明细表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batch_rows_batch_id' AND object_id = OBJECT_ID('dbo.award_batch_rows'))
BEGIN
    CREATE INDEX idx_award_batch_rows_batch_id ON dbo.award_batch_rows (batch_id);
    PRINT 'Index idx_award_batch_rows_batch_id created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_award_batch_rows_is_deleted' AND object_id = OBJECT_ID('dbo.award_batch_rows'))
BEGIN
    CREATE INDEX idx_award_batch_rows_is_deleted ON dbo.award_batch_rows (is_deleted);
    PRINT 'Index idx_award_batch_rows_is_deleted created.';
END
GO

-- -----------------------------------------------------------
-- 操作日志表索引
-- -----------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_operation_logs_user_id' AND object_id = OBJECT_ID('dbo.operation_logs'))
BEGIN
    CREATE INDEX idx_operation_logs_user_id ON dbo.operation_logs (user_id);
    PRINT 'Index idx_operation_logs_user_id created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_operation_logs_module' AND object_id = OBJECT_ID('dbo.operation_logs'))
BEGIN
    CREATE INDEX idx_operation_logs_module ON dbo.operation_logs (module);
    PRINT 'Index idx_operation_logs_module created.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_operation_logs_created_at' AND object_id = OBJECT_ID('dbo.operation_logs'))
BEGIN
    CREATE INDEX idx_operation_logs_created_at ON dbo.operation_logs (created_at DESC);
    PRINT 'Index idx_operation_logs_created_at created.';
END
GO

PRINT '========================================';
PRINT '所有索引创建完成！';
PRINT '========================================';
