# BOS System - SQL Server 双数据源接入方案

## 概述

本方案为 BOS System 增加 SQL Server 数据库支持，实现 **Supabase / SQL Server 双数据源并行**，以及 **自建 JWT 认证系统**，可通过环境变量无缝切换。

## 架构图

```
┌─────────────────────────────────────────────────┐
│                   前端 (React)                    │
│  ┌───────────────────────────────────────────┐  │
│  │         Auth Provider 抽象层               │  │
│  │   ┌─────────────┐  ┌──────────────────┐  │  │
│  │   │ Supabase Auth│  │  JWT Auth (自建) │  │  │
│  │   └─────────────┘  └──────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │         Data Service 抽象层                │  │
│  │   ┌─────────────┐  ┌──────────────────┐  │  │
│  │   │ Supabase 直连│  │  后端 API 调用   │  │  │
│  │   └─────────────┘  └──────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ HTTP API
┌──────────────────────▼──────────────────────────┐
│              Express 后端 (server.js)            │
│  ┌───────────────────────────────────────────┐  │
│  │         Data Repository 工厂               │  │
│  │   ┌─────────────┐  ┌──────────────────┐  │  │
│  │   │ Supabase     │  │  SQL Server      │  │  │
│  │   │ Repository   │  │  Repository      │  │  │
│  │   └─────────────┘  └──────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │         JWT 认证中间件                     │  │
│  └───────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
   Supabase (PostgreSQL)        SQL Server
```

## 目录结构

```
sqlserver-integration/
├── sql/                              # SQL Server 数据库脚本
│   ├── 001_create_tables.sql         # 建表脚本（所有业务表）
│   ├── 002_create_indexes.sql        # 索引脚本
│   ├── 003_create_triggers.sql       # 触发器（updated_at 自动更新）
│   └── 004_seed_data.sql             # 初始数据（管理员账号）
├── server/                           # 后端代码
│   ├── data/
│   │   ├── index.js                  # 数据源工厂
│   │   └── sqlserver/
│   │       ├── connection.js         # SQL Server 连接池
│   │       ├── userRepository.js     # 用户 Repository
│   │       ├── enrolledStudentRepository.js
│   │       ├── hardshipStudentRepository.js
│   │       ├── collegeBatchRepository.js
│   │       └── awardBatchRepository.js
│   ├── auth/
│   │   ├── index.js                  # 认证模块入口
│   │   ├── password.js               # 密码哈希（bcryptjs）
│   │   ├── jwt.js                    # JWT 签发/验证
│   │   └── middleware.js             # Express 认证中间件
│   └── routes/
│       └── authRoutes.js             # 认证 API 路由
├── src/                              # 前端代码
│   ├── lib/
│   │   └── apiClient.ts              # API 客户端（带 token 刷新）
│   ├── providers/
│   │   ├── authProvider.ts           # 认证提供者接口
│   │   └── jwtAuthProvider.ts        # JWT 认证提供者实现
│   └── services/
│       ├── authService.ts            # 认证服务（双模式切换）
│       └── apiDataService.ts         # API 数据服务（替代 supabaseDataService）
└── .env.example                      # 环境变量示例
```

## 快速开始

### 第一步：准备 SQL Server 数据库

1. 安装 SQL Server（本地或 Docker）
2. 创建数据库 `BOS_System`
3. 按顺序执行 SQL 脚本：

```sql
-- 在 SQL Server Management Studio 中执行
-- 1. 建表
:r sql/001_create_tables.sql

-- 2. 创建索引
:r sql/002_create_indexes.sql

-- 3. 创建触发器
:r sql/003_create_triggers.sql

-- 4. 初始化数据（管理员账号）
:r sql/004_seed_data.sql
```

默认管理员账号：
- 邮箱：`admin@bos.edu.cn`
- 密码：`admin123456`

> ⚠️ 登录后请立即修改密码！

### 第二步：安装后端依赖

```bash
npm install mssql bcryptjs jsonwebtoken --save
```

### 第三步：复制文件到项目

将以下文件/目录复制到 BOS-system 项目对应位置：

| 源路径 | 目标路径 | 说明 |
|---|---|---|
| `server/data/` | `server/data/` | 数据访问层 |
| `server/auth/` | `server/auth/` | JWT 认证模块 |
| `server/routes/authRoutes.js` | `server/routes/authRoutes.js` | 认证路由 |
| `src/lib/apiClient.ts` | `src/lib/apiClient.ts` | API 客户端 |
| `src/providers/` | `src/providers/` | 认证提供者 |
| `src/services/authService.ts` | `src/services/authService.ts` | 认证服务（替换原有） |
| `src/services/apiDataService.ts` | `src/services/apiDataService.ts` | API 数据服务 |

### 第四步：修改 server.js

在现有 `server.js` 中添加认证路由注册：

```javascript
// 在文件顶部添加
import { registerAuthRoutes } from "./server/routes/authRoutes.js";

// 在 registerDifficultyStudentRoutes(app) 之后添加
registerAuthRoutes(app);
```

### 第五步：配置环境变量

复制 `.env.example` 为 `.env`，填写 SQL Server 和 JWT 配置：

```env
# 认证模式切换
VITE_AUTH_MODE=jwt

# 数据源模式切换
VITE_DATA_SOURCE=api

# 后端数据源
DATA_SOURCE=sqlserver

# SQL Server 连接
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_DATABASE=BOS_System
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=your_password

# JWT 密钥（生产环境必须修改！）
JWT_SECRET=your-very-long-random-secret-key
```

### 第六步：前端替换认证服务

在使用 `authService` 的地方，将导入从旧的改为新的：

```typescript
// 旧
// import { signInWithPassword, getCurrentSessionProfile } from "./services/authService";

// 新（需要先获取 provider）
import { getAuthProvider } from "./services/authService";

// 使用示例
const provider = await getAuthProvider();
const profile = await provider.signInWithPassword(email, password);
```

### 第七步：启动服务

```bash
# 启动后端 API（包含 SQL Server 连接和 JWT 认证）
npm run server

# 启动前端开发服务器
npm run dev
```

## 模式切换说明

### 模式 1：Supabase 模式（原有方式）

```env
VITE_AUTH_MODE=supabase
VITE_DATA_SOURCE=supabase
DATA_SOURCE=supabase
```

- 认证：Supabase Auth
- 数据：前端直接连 Supabase
- 后端仅用于 DeepSeek 代理和困难生上报 API

### 模式 2：SQL Server 模式（新增）

```env
VITE_AUTH_MODE=jwt
VITE_DATA_SOURCE=api
DATA_SOURCE=sqlserver
```

- 认证：自建 JWT + SQL Server 用户表
- 数据：前端 → Express API → SQL Server
- 所有数据操作通过后端 API 进行

### 模式 3：混合模式（灵活配置）

```env
VITE_AUTH_MODE=jwt           # 认证用 JWT
VITE_DATA_SOURCE=supabase    # 数据直接连 Supabase
DATA_SOURCE=sqlserver        # 后端用 SQL Server
```

## 数据表对照

| Supabase 表名 | SQL Server 表名 | 说明 |
|---|---|---|
| `auth.users` | `dbo.users` | 用户表（自建） |
| `public.user_profiles` | 合并到 `dbo.users` | 用户资料 |
| `public.enrolled_students` | `dbo.enrolled_students` | 在校生表 |
| `public.hardship_students` | `dbo.hardship_students` | 困难生表 |
| `public.college_batches` | `dbo.college_batches` | 学院提交批次 |
| `public.batch_rows` | `dbo.batch_rows` | 批次明细 |
| `public.award_batches` | `dbo.award_batches` | 三大奖批次 |
| `public.award_batch_rows` | `dbo.award_batch_rows` | 三大奖明细 |
| `public.difficulty_policy_documents` | `dbo.difficulty_policy_documents` | 认定办法文档 |
| - | `dbo.operation_logs` | 操作日志（新增） |

## 主要差异说明

### 1. RLS vs 应用层权限

- **Supabase**：使用 RLS（行级安全策略）在数据库层控制数据访问
- **SQL Server**：在 Express 中间件层控制数据访问（`withCollegeScope`）

### 2. 认证方式

- **Supabase Auth**：邮箱密码登录，Supabase 托管用户
- **JWT 认证**：自建用户表，bcrypt 密码哈希，JWT token 认证

### 3. 数据访问方式

- **Supabase 模式**：前端直接使用 `@supabase/supabase-js` 操作数据库
- **SQL Server 模式**：前端通过 REST API 访问后端，后端使用 `mssql` 操作数据库

### 4. JSON 字段

- **PostgreSQL**：原生 `jsonb` 类型，支持索引和查询
- **SQL Server**：使用 `NVARCHAR(MAX)` 存储 JSON，兼容 SQL Server 2016+

## API 端点列表

### 认证相关

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/auth/login` | 登录 | 公开 |
| POST | `/api/auth/refresh` | 刷新 token | 公开 |
| GET | `/api/auth/me` | 获取当前用户 | 已登录 |
| PUT | `/api/auth/password` | 修改密码 | 已登录 |
| POST | `/api/auth/logout` | 登出 | 已登录 |
| POST | `/api/auth/users` | 创建用户 | 管理员 |

### 在校生数据

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/enrolled-students` | 获取在校生列表 | 管理员/学院 |
| POST | `/api/enrolled-students/batch` | 批量导入 | 管理员 |
| DELETE | `/api/enrolled-students` | 清空（软删除） | 管理员 |
| POST | `/api/enrolled-students/verify` | 验证学生身份 | 管理员/学院 |

> **注意**：更多 API 端点（困难生、批次、三大奖等）需要根据业务需求补充。

## 生产环境注意事项

1. **JWT 密钥**：必须使用足够长的随机字符串，建议 32 字符以上
2. **HTTPS**：生产环境必须启用 HTTPS，防止 token 被窃取
3. **密码强度**：建议增加密码复杂度校验
4. **限流**：登录接口建议加限流，防止暴力破解
5. **SQL 注入**：Repository 层已使用参数化查询，请勿拼接 SQL
6. **连接池**：根据实际并发调整 `pool.max` 配置

## 常见问题

### Q: 上传数据失败怎么办？

A: 检查以下几点：
1. SQL Server 是否启动，端口是否正确
2. `.env` 中 SQL_SERVER 配置是否正确
3. 数据库 `BOS_System` 是否已创建，表是否已建好
4. 浏览器控制台和后端控制台的错误信息

### Q: 登录提示"账号或密码错误"？

A: 
1. 确认已执行 `004_seed_data.sql` 初始化管理员账号
2. 检查邮箱和密码是否正确（默认 admin@bos.edu.cn / admin123456）
3. 确认 `users` 表中 `enabled` 字段为 1

### Q: 如何从 Supabase 迁移数据到 SQL Server？

A: 可以编写数据迁移脚本：
1. 从 Supabase 导出数据为 JSON
2. 编写 Node.js 脚本读取 JSON 并写入 SQL Server
3. 使用 `enrolledStudentRepository.bulkUpsert()` 等方法批量导入

### Q: 可以同时使用 Supabase 和 SQL Server 吗？

A: 可以！本方案就是为双数据源设计的。通过环境变量切换即可，代码层面对外接口一致。

## 后续扩展建议

1. **验证码**：登录增加图形验证码或短信验证码
2. **操作日志**：完善 `operation_logs` 表的写入
3. **数据导出**：SQL Server 端支持直接生成 Excel 导出
4. **缓存**：热点数据增加 Redis 缓存
5. **数据库连接监控**：添加连接池监控和告警
