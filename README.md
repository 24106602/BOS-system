# BOS 高校资助数据治理平台

BOS 是面向高校学生资助业务的数据治理平台，采用 Vite、React、TypeScript 与 Supabase 构建。系统包含学院端和管理员端，当前重点支持困难生数据治理及三大奖业务。

## 技术栈

- Vite
- React
- TypeScript
- Supabase
- `xlsx-js-style`

应用入口由 `main.tsx` 渲染 `PlatformApp`，页面通过平台路由进入学院端或管理员端。

## 当前功能

### 困难生业务

- 学院端本专科信息和家庭成员信息处理。
- Excel 模板识别、数据治理、自动修复及问题分析。
- 通过数据、不通过数据和问题分析弹窗查看。
- 学院确认审核及上载学校端流程。
- 存在不通过数据时禁止确认和上载。
- 学院端按学院隔离查看困难生明细。
- 管理员端按学年导入、查询和汇总困难生数据。
- 困难生申请档案表格按标准模板 40 列展示。
- 学校上报前校验学籍、家庭成员、学生照片、学校认定办法及流程状态。
- 单条与批量学校上报均由后端 API 执行；批量状态写入使用数据库事务，禁止部分成功。

### 三大奖业务

系统支持以下奖项：

- 国家奖学金
- 国家励志奖学金
- 上海市奖学金

主要能力包括：

- 学院端 Excel 导入、模板与官方 Sheet 识别。
- 使用既有三奖规则执行数据治理。
- 通过名单、不通过名单及问题说明导出。
- 学院确认审核与上载学校端。
- 管理员端三奖提交总览和分奖项汇总。
- 按学年、奖项、学院、姓名、学号、身份证号、专业、班级和审核状态筛选。
- 根据奖项类型动态展示对应模板字段。

## 页面风格

困难生和三奖页面已统一为“高校资助数据治理平台”风格：

- 固定左侧业务菜单与顶部账号栏。
- 页面标题、业务说明和奖项切换区。
- 顶部驾驶舱统计卡片。
- 高级筛选区和统一操作工具栏。
- 超宽数据表格、横向滚动和固定表头。
- 表格首列复选框、全选及当前视图删除。
- 数据导入、结果名单、问题分析和学生详情弹窗。
- 表格与弹窗内部独立滚动，避免页面内容被裁切。

当前界面仅保留现有业务需要的 Excel 导入与导出入口。

## 数据保存说明

- 困难生学校端数据按项目现有逻辑写入和读取 Supabase。
- 学校困难生认定办法元数据保存在 `difficulty_policy_documents`，文件本体应保存在 Supabase Storage。
- 三大奖数据当前通过 `localStorage` 暂存，并由管理员端汇总页面读取。
- 页面中的“删除”仅影响当前页面展示，不删除 Supabase 或 `localStorage` 中的数据。
- 项目不会写入尚未创建的 Supabase 三奖表。

## 主要路由

### 学院端

| 路由 | 页面 |
|---|---|
| `/college` | 学院端首页 |
| `/college/difficulty` | 困难生业务首页 |
| `/college/difficulty/student` | 本专科信息处理 |
| `/college/difficulty/family` | 家庭成员信息处理 |
| `/college/difficulty/students` | 困难生明细 |
| `/college/records` | 提交记录 |
| `/college/awards` | 三奖业务首页 |
| `/college/awards/national` | 国家奖学金数据处理 |
| `/college/awards/inspirational` | 国家励志奖学金数据处理 |
| `/college/awards/shanghai` | 上海市奖学金数据处理 |

### 管理员端

| 路由 | 页面 |
|---|---|
| `/admin` | 管理员首页 |
| `/admin/difficulty` | 困难生业务总览 |
| `/admin/summary` | 全校数据汇总 |
| `/admin/student-summary` | 本专科信息汇总 |
| `/admin/family-summary` | 家庭成员信息汇总 |
| `/admin/students` | 困难生数据库 |
| `/admin/awards` | 三奖提交总览 |
| `/admin/awards/national` | 国家奖学金汇总 |
| `/admin/awards/inspirational` | 国家励志奖学金汇总 |
| `/admin/awards/shanghai` | 上海市奖学金汇总 |

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:5173/
```

## 提交前验证

```bash
npm run lint
npm run build
npm run build:functions
npm run test:report-integrity
git diff --check
```

`npm run build` 生成的生产文件位于 `dist`。

## 困难生学校上报 API

- 单条上报：`POST /api/difficulty-students/:id/report`
- 批量上报：`POST /api/difficulty-students/batch-report`，请求体为 `{ "ids": ["uuid"] }`
- 数据不完整时返回 HTTP 400、错误码 `INCOMPLETE_DATA` 和逐学生缺失原因。
- `DIFFICULTY_REPORT_REQUIRED_CHECKS` 可按需选择校验项；未配置时默认启用全部校验。

## 维护边界

修改页面时应保持以下边界：

- 不削弱困难生治理规则。
- 不削弱三大奖模板识别和校验规则。
- 不擅自改变 Supabase 读写逻辑。
- 不硬编码不存在的 Supabase 表。
- 不把当前视图删除改成持久化数据删除。
