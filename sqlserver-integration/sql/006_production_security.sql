-- ============================================================
-- 生产环境数据库安全配置
-- 1. 修改 bos_app 密码为强密码
-- 2. 移除 db_owner 角色，配置最小权限
-- ============================================================

USE BOS_System;
GO

-- 1. 修改 bos_app 登录密码（强密码）
ALTER LOGIN bos_app WITH PASSWORD = 'B0s@Pr0d#2025!Sys';
GO

-- 2. 移除 db_owner 角色
ALTER ROLE db_owner DROP MEMBER bos_app;
GO

-- 3. 授予必要的权限
-- 读取权限
GRANT SELECT ON users TO bos_app;
GRANT SELECT ON enrolled_students TO bos_app;
GRANT SELECT ON hardship_students TO bos_app;
GRANT SELECT ON college_batches TO bos_app;
GRANT SELECT ON batch_rows TO bos_app;
GRANT SELECT ON award_batches TO bos_app;
GRANT SELECT ON award_batch_rows TO bos_app;
GRANT SELECT ON difficulty_students TO bos_app;
GRANT SELECT ON difficulty_family_members TO bos_app;
GRANT SELECT ON difficulty_policy_documents TO bos_app;
GRANT SELECT ON operation_logs TO bos_app;

-- 写入权限
GRANT INSERT ON users TO bos_app;
GRANT UPDATE ON users TO bos_app;
GRANT DELETE ON users TO bos_app;

GRANT INSERT ON enrolled_students TO bos_app;
GRANT UPDATE ON enrolled_students TO bos_app;
GRANT DELETE ON enrolled_students TO bos_app;

GRANT INSERT ON hardship_students TO bos_app;
GRANT UPDATE ON hardship_students TO bos_app;
GRANT DELETE ON hardship_students TO bos_app;

GRANT INSERT ON college_batches TO bos_app;
GRANT UPDATE ON college_batches TO bos_app;
GRANT DELETE ON college_batches TO bos_app;

GRANT INSERT ON batch_rows TO bos_app;
GRANT UPDATE ON batch_rows TO bos_app;
GRANT DELETE ON batch_rows TO bos_app;

GRANT INSERT ON award_batches TO bos_app;
GRANT UPDATE ON award_batches TO bos_app;
GRANT DELETE ON award_batches TO bos_app;

GRANT INSERT ON award_batch_rows TO bos_app;
GRANT UPDATE ON award_batch_rows TO bos_app;
GRANT DELETE ON award_batch_rows TO bos_app;

GRANT INSERT ON difficulty_students TO bos_app;
GRANT UPDATE ON difficulty_students TO bos_app;
GRANT DELETE ON difficulty_students TO bos_app;

GRANT INSERT ON difficulty_family_members TO bos_app;
GRANT UPDATE ON difficulty_family_members TO bos_app;
GRANT DELETE ON difficulty_family_members TO bos_app;

GRANT INSERT ON difficulty_policy_documents TO bos_app;
GRANT UPDATE ON difficulty_policy_documents TO bos_app;
GRANT DELETE ON difficulty_policy_documents TO bos_app;

GRANT INSERT ON operation_logs TO bos_app;
GRANT UPDATE ON operation_logs TO bos_app;
GRANT DELETE ON operation_logs TO bos_app;
GO

-- 4. 验证权限
PRINT '=== bos_app 用户权限 ===';
SELECT 
    dp.permission_name,
    so.name as object_name,
    dp.state_desc
FROM sys.database_permissions dp
JOIN sys.database_principals dpr ON dp.grantee_principal_id = dpr.principal_id
LEFT JOIN sys.objects so ON dp.major_id = so.object_id
WHERE dpr.name = 'bos_app'
ORDER BY so.name, dp.permission_name;
GO
