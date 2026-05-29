# BOS 数据治理平台

这是一个面向个人本地使用的 Excel 数据治理网页工具。系统基于 Vite + React + TypeScript 开发，可用于上传标准模板、上传待处理数据、自动检查/修复/标记异常，并导出治理后的 Excel 结果。

## 日常使用方式

已经打包完成后，不需要打开 VS Code，也不需要运行命令。

直接双击以下任意一个文件即可打开系统：

```text
打开BOS数据治理平台.bat
```

或者直接打开：

```text
dist/index.html
```

## 使用流程

```text
1. 点击“上传模板”
2. 选择标准 Excel 模板
3. 点击“上传待处理数据”
4. 选择学院上交的 Excel 数据
5. 点击“开始治理”
6. 查看实时治理日志、问题汇总和结果预览
7. 点击“导出结果”生成治理后的 Excel 文件
```

## 项目结构说明

```text
bos-system
├─ dist                 打包后的网页文件，日常使用打开这里
├─ public               静态资源，例如 favicon、图标
├─ src                  源代码目录
│  ├─ App.tsx           主功能页面和 Excel 治理逻辑
│  ├─ App.css           页面样式文件
│  ├─ index.css         全局样式文件
│  └─ main.tsx          React 网页入口
├─ index.html           开发环境 HTML 入口
├─ package.json         项目依赖和命令配置
├─ vite.config.ts       Vite 配置，已设置 base: './' 以支持本地打开
└─ 打开BOS数据治理平台.bat  双击打开本地网页
```

## 每个软件的作用

| 软件 | 作用 |
|---|---|
| VS Code | 修改代码、维护项目时使用，日常使用不需要打开 |
| Node.js | 安装依赖、打包项目时使用 |
| npm | 执行安装、开发、打包命令 |
| Vite | 开发和打包前端网页 |
| React | 构建网页界面和交互 |
| TypeScript | 让代码更规范，减少类型错误 |
| 浏览器 | 日常打开并使用系统 |
| Excel/WPS | 提供模板、待处理数据和查看导出结果 |

## 后续修改代码时

如果以后需要改功能，才需要打开 VS Code，并执行：

```bash
npm install
npm run dev
```

开发时浏览器访问：

```text
http://localhost:5173/
```

修改完成后，重新打包：

```bash
npm run build
```

打包完成后，新的网页会生成到：

```text
dist/index.html
```

## 交接说明

交接项目时建议保留：

```text
src
public
index.html
package.json
package-lock.json
vite.config.ts
tsconfig*.json
README.md
打开BOS数据治理平台.bat
```

`node_modules` 文件夹很大，可以不交接。别人拿到项目后执行 `npm install` 会自动重新生成。

## 当前系统定位

本系统当前是“本地个人版数据治理网页”，主要处理 Excel 文件，不依赖后端服务器和远程数据库。适合个人在本机完成模板校验、数据治理和结果导出。

后续如果要扩展成奖助学金筛选系统，可以继续增加：

```text
困难生数据库
奖助学金规则库
通知文字规则识别
学院上报名单匹配
筛选结果归档
```
