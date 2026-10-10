-- ============================================================
-- BOS 数据治理平台 - 初始数据脚本
-- 在 003_create_triggers.sql 之后执行
-- 功能：创建默认管理员账号
-- 默认账号：admin@bos.edu.cn / admin123456
-- ============================================================

USE BOS_System;
GO

-- 使用 Node.js crypto 生成的 bcrypt hash（admin123456）
-- 如果你想自己生成，可以运行：node -e "const bc = require('bcryptjs'); console.log(bc.hashSync('admin123456', 10))"
-- 这里使用 bcryptjs 兼容的 hash 值
DECLARE @adminEmail NVARCHAR(255) = 'admin@bos.edu.cn';
DECLARE @adminPasswordHash NVARCHAR(255) = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; -- admin123456
DECLARE @adminRole NVARCHAR(20) = 'admin';
DECLARE @adminName NVARCHAR(100) = '系统管理员';

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = @adminEmail)
BEGIN
    INSERT INTO dbo.users (email, password_hash, role, college_name, display_name, enabled)
    VALUES (@adminEmail, @adminPasswordHash, @adminRole, NULL, @adminName, 1);
    PRINT '默认管理员账号创建成功！';
    PRINT '账号：' + @adminEmail;
    PRINT '密码：admin123456';
    PRINT '⚠️  请登录后立即修改密码！';
END
ELSE
BEGIN
    PRINT '管理员账号已存在，跳过创建。';
END
GO

-- 创建示例学院账号（可选）
DECLARE @collegeEmail NVARCHAR(255) = 'college@bos.edu.cn';
DECLARE @collegePasswordHash NVARCHAR(255) = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'; -- admin123456
DECLARE @collegeRole NVARCHAR(20) = 'college';
DECLARE @collegeName NVARCHAR(100) = '示例学院';
DECLARE @collegeDisplayName NVARCHAR(100) = '示例学院管理员';

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE email = @collegeEmail)
BEGIN
    INSERT INTO dbo.users (email, password_hash, role, college_name, display_name, enabled)
    VALUES (@collegeEmail, @collegePasswordHash, @collegeRole, @collegeName, @collegeDisplayName, 1);
    PRINT '示例学院账号创建成功！';
    PRINT '账号：' + @collegeEmail;
    PRINT '密码：admin123456';
END
ELSE
BEGIN
    PRINT '示例学院账号已存在，跳过创建。';
END
GO

PRINT '========================================';
PRINT '初始数据插入完成！';
PRINT '========================================';
