# BOS 数据治理平台项目结构说明

本文档用于交接和后续维护，说明当前项目中主要文件的位置和职责。当前项目是 **Vite + React + TypeScript 的纯前端本地网页工具**，没有独立后端服务。

## 一、核心结论

### 1. 前端页面文件在哪里

- `index.html`：网页 HTML 入口，提供 `<div id="root"></div>`。
- `src/main.tsx`：React 入口文件，把 `App` 挂载到页面 root 节点。
- `src/App.tsx`：主页面组件，只保留功能区切换、上传按钮、状态管理、预览表格和日志展示。
- `src/components/StudentDatabasePanel.tsx`：困难生数据库子页面组件，负责数据库导入、检索、导出和清空。

### 2. 上传页面代码在哪里

- `src/App.tsx`
  - `uploadTemplate`：本专科困难生模板上传入口。
  - `uploadData`：本专科困难生待处理数据上传入口。
  - `uploadFamilyTemplate`：家庭成员模板上传入口。
  - `uploadFamilyData`：家庭成员数据上传入口。
  - 页面按钮和展示区也保留在此文件。

- `src/components/StudentDatabasePanel.tsx`
  - `uploadDatabase`：困难生数据库 Excel 上传导入入口。

上传后的 Excel 读取和模板解析由服务层负责：

- `src/services/templateParser.ts`

### 3. 后端上传接口在哪里

当前项目 **没有后端上传接口**，也没有新增后端。

所有上传都是浏览器本地读取：

- `src/services/templateParser.ts` 中通过 `FileReader` 读取 Excel。
- `src/components/StudentDatabasePanel.tsx` 中通过 `file.arrayBuffer()` 读取困难生库 Excel。
- 困难生数据库保存在浏览器本地 IndexedDB，失败时回退到 localStorage。

### 4. Excel 数据处理核心代码在哪里

重构后，Excel 处理逻辑已经从 `src/App.tsx` 拆分到服务层：

- `src/services/templateParser.ts`
  - `readWorkbook`：读取 Excel 工作簿。
  - `parseStudentTemplate`：解析本专科困难生模板。
  - `parseFamilyTemplate`：解析家庭成员模板。
  - `buildDictionaryFromSheet`：解析模板字典值。
  - `inferFieldDictMap`：推断字段和字典类型关系。
  - `findHeaderRowIndex`：识别学院上交数据的表头行。
  - `buildColumnMap`：把源数据表头映射到模板字段。
  - `makeSourcePreview`：生成页面预览数据。

- `src/services/studentProcessor.ts`
  - `processStudentRows`：本专科困难生数据处理主流程。
  - `exportStudentExcel`：本专科困难生处理结果导出。

- `src/services/familyProcessor.ts`
  - `processFamilyRows`：家庭成员信息处理主流程。
  - `exportFamilyExcel`：家庭成员处理结果导出。

- `src/services/excelExport.ts`
  - `cloneWorksheet`：复制模板工作表。
  - `applyHighlightStyle`：把黄、红、紫标记写入导出 Excel。

### 5. 校验逻辑在哪里

通用校验和修正规则集中在：

- `src/utils/validators.ts`

主要包含：

- 身份证号校验：`isValidIdCard`
- 手机号校验：`isValidPhone`
- 邮编校验：`isValidPostcode`
- 必填项判断：`isRequiredByRule`
- 数字列判断：`shouldBeNumber`
- 金额解析：`parseAmountToNumber`
- 文本长度提取：`extractMaxLength`
- 特殊困难类型修正：`fixSpecialDifficulty`
- 收入来源修正：`fixIncomeSource`
- 年度、学期、关系、健康状况修正：`fixSchoolYear`、`fixTerm`、`fixRelation`、`fixHealthStatus`

### 6. 账号登录和用户信息相关代码在哪里

当前项目 **没有账号登录、用户权限、用户信息模块**。

也没有用户表、密码字段、登录页面、登录接口或 token 管理。当前系统定位是本机个人使用工具，数据只存放在本机浏览器。

唯一和“人员信息”相关的数据类型是：

- `src/types/student.ts`：困难生基础库学生记录类型 `StudentRecord`。

## 二、主要目录结构

```text
bos-system
├─ src
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ index.css
│  ├─ App.css
│  ├─ components
│  │  └─ StudentDatabasePanel.tsx
│  ├─ db
│  │  └─ localStudentDb.ts
│  ├─ services
│  │  ├─ types.ts
│  │  ├─ templateParser.ts
│  │  ├─ studentProcessor.ts
│  │  ├─ familyProcessor.ts
│  │  └─ excelExport.ts
│  ├─ utils
│  │  └─ validators.ts
│  ├─ types
│  │  └─ student.ts
│  └─ assets
├─ public
│  ├─ favicon.svg
│  └─ icons.svg
├─ dist
│  └─ 打包后的网页文件
├─ tools
│  └─ patches
│     └─ 历史维护脚本归档
├─ index.html
├─ package.json
├─ package-lock.json
├─ vite.config.ts
├─ tsconfig.json
├─ tsconfig.app.json
├─ tsconfig.node.json
├─ eslint.config.js
├─ README.md
├─ PROJECT_STRUCTURE.md
└─ 打开BOS数据治理平台.bat
```

## 三、主要文件作用

| 文件 | 作用 |
|---|---|
| `src/App.tsx` | 主页面组件，负责状态管理、按钮事件、模块切换、预览表格和日志展示。 |
| `src/main.tsx` | React 应用入口，把 `App` 渲染到 `index.html` 的 root 节点。 |
| `src/components/StudentDatabasePanel.tsx` | 困难生数据库页面组件，负责上传困难生库、检索学生、导出数据库、清空数据库。 |
| `src/db/localStudentDb.ts` | 浏览器本地数据库封装，优先使用 IndexedDB，失败时使用 localStorage。 |
| `src/services/types.ts` | 服务层共享类型定义，例如工作簿、标记、日志、统计和处理结果类型。 |
| `src/services/templateParser.ts` | Excel 读取、模板字段解析、字典解析、表头识别和字段映射。 |
| `src/services/studentProcessor.ts` | 本专科困难生信息处理和导出。 |
| `src/services/familyProcessor.ts` | 家庭成员信息处理、困难生库匹配、待复核名单生成和导出。 |
| `src/services/excelExport.ts` | Excel 导出时复用的模板复制和标色辅助函数。 |
| `src/utils/validators.ts` | 身份证、手机号、邮编、必填项、数字、金额、字典值修正等通用校验工具。 |
| `src/types/student.ts` | 困难生数据库学生记录的 TypeScript 类型定义。 |
| `src/index.css` | 全局样式文件，定义页面基础字体、颜色、根节点布局等。 |
| `src/App.css` | Vite 初始模板遗留样式，目前主功能主要使用 `App.tsx` 内联样式。 |
| `index.html` | 开发环境 HTML 入口。 |
| `vite.config.ts` | Vite 配置，`base: './'` 用于支持打包后本地打开 `dist/index.html`。 |
| `package.json` | 项目依赖和脚本命令配置，例如 `npm run dev`、`npm run build`。 |
| `README.md` | 面向使用者的运行和交接说明。 |
| `打开BOS数据治理平台.bat` | 双击打开打包后的本地网页。 |
| `tools/patches` | 历史补丁和维护脚本归档，正常使用系统不需要运行。 |
| `dist` | 构建产物目录，由 `npm run build` 生成。 |
| `node_modules` | 依赖安装目录，由 `npm install` 生成，不建议作为交接重点。 |

## 四、当前运行方式

开发调试：

```bash
npm run dev
```

打包：

```bash
npm run build
```

日常打开：

```text
打开BOS数据治理平台.bat
```

或直接打开：

```text
dist/index.html
```

## 五、后续扩展建议

如果后续要加入账号登录、多人使用、服务器数据库、正式上传接口，可以新增：

- `server` 或 `backend` 后端目录。
- 上传接口，例如 `/api/upload-template`、`/api/upload-data`。
- 用户表和登录接口。
- 权限控制。
- 服务端数据库，例如 MySQL、PostgreSQL 或 SQLite。

当前版本没有这些模块，因此交接时应明确：这是一个本地个人版 Excel 数据治理工具。
