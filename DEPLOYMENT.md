# BOS 前后端发布流程

## 统一部署架构

- 前端：Vite 构建产物 `dist`，由 Cloudflare Pages 托管。
- 在线 API：`functions/api/[[path]].js`，随 Pages 同一次部署发布。
- 数据库与登录：Supabase。
- 本地开发 API：`server.js`，仅作为本地联调备用。
- 生产分支：GitHub `main`。Cloudflare Pages 必须启用生产分支自动部署。

浏览器统一请求同源接口：

- 困难生写操作：`/api/difficulty-students/*`
- AI 治理分析：`/api/deepseek`

因此一次 `main` 合并会同时更新页面和 API，不需要再单独发布 Express 服务。

## Cloudflare Pages 设置

- Git 仓库：`24106602/BOS-system`
- 生产分支：`main`
- 构建命令：`npm run build`
- 构建输出目录：`dist`
- 自动部署：启用

构建期变量（前端可见）：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DIFFICULTY_API_URL=/api/difficulty-students`
- `VITE_DEEPSEEK_API_URL=/api/deepseek`

Functions 运行时变量/Secret（只在服务端可见）：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（必须使用 Secret，禁止添加 `VITE_` 前缀）
- `DEEPSEEK_API_KEY`（使用 Secret）
- `DEEPSEEK_MODEL=deepseek-chat`（可选）
- `ALLOWED_ORIGINS`（可选；同源访问无需填写）

## Supabase 数据库准备

在 Supabase SQL Editor 中按顺序执行：

1. `supabase/extend_difficulty_student_status.sql`
2. 在线 API 和登录联调通过后，再执行 `supabase/lock_difficulty_student_writes_to_api.sql`

第二个脚本会锁定浏览器对 `students` 的直接写权限，因此不得在 Pages Functions 的运行时 Secret 配置完成前执行。

## 每次修改后的标准流程

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/<本次修改名称>

npm run lint
npm run build
git diff --check

git add <本次修改文件>
git commit -m "<规范提交说明>"
git push -u origin codex/<本次修改名称>
```

随后创建 Pull Request，检查通过后合并到 `main`。Cloudflare 应自动生成新的生产部署。验收时同时检查：

1. Cloudflare 最新生产部署的提交 SHA 与 GitHub `main` 一致。
2. 页面正常打开，刷新深层路由不返回 404。
3. 登录后调用 `/api/difficulty-students/*` 不返回 404/503。
4. 学院账号只能操作本学院数据，管理员账号可审核和上报。
5. Supabase 对应表能读取到本次写入。

## 故障定位

- GitHub 已更新但页面没变：检查 Cloudflare 自动部署是否启用、生产分支是否为 `main`、生产部署 SHA 是否落后。
- 页面更新但 API 404：检查 `functions/api/[[path]].js` 是否进入构建部署。
- API 503：检查 Functions 运行时的三个 Supabase 变量是否完整。
- API 401：登录会话过期，重新登录。
- API 403：检查账号 `user_profiles`、学院范围与当前困难生状态。
- Supabase 状态约束失败：执行状态迁移脚本，并核对是否仍存在未知旧状态。
