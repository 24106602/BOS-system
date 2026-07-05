# 学院端困难生业务页面全面重构计划

## 一、重构目标

参考 vue-element-admin 的布局理念与交互丝滑度，对学院端困难生业务所有页面进行全面重构，实现：

1. **视觉一致性**：统一配色、间距、圆角、阴影等视觉语言
2. **交互丝滑度**：页面切换动画、按钮状态反馈、弹窗过渡、加载状态
3. **组件复用**：抽取公共组件，消除各页面间的重复代码
4. **代码质量**：拆分过大的组件，职责清晰，可维护性提升

## 二、当前问题分析

### 2.1 CollegeDifficultyPage（业务首页）
- 页面信息密度低，驾驶舱统计卡片缺失
- 缺少业务流程引导（步骤条/进度指示）
- 提交记录表格样式内联，未使用全局样式类
- 缺少页面过渡动画

### 2.2 CollegeUploadPage（本专科/家庭成员处理）
- 直接嵌入 App.tsx（1000+行巨型组件），耦合严重
- 仅有 tab 切换外壳，核心业务逻辑全在 App.tsx
- 缺少独立的页面头部、步骤引导、状态展示

### 2.3 CollegeDifficultyStudentsPage（困难生明细）
- 驾驶舱卡片使用独立 CockpitStat 组件，与其他页面风格不统一
- 详情弹窗过于简陋，缺少分组、标签等结构化展示
- 大量内联样式（styles 对象 400+ 行），应抽取为 CSS 类

### 2.4 CollegeRecordsPage（提交记录）
- 页面功能单一，缺少状态进度展示
- 筛选区布局不统一
- 导出功能缺少格式选择

### 2.5 全局问题
- 各页面独立维护 `styles: Record<string, CSSProperties>`，大量重复
- 无页面切换过渡动画
- 无全局加载状态管理
- 无面包屑导航组件

## 三、重构方案

### 3.1 新建公共组件

#### (1) `src/components/ui/Breadcrumb.tsx`
- 面包屑导航组件，接收路径数组
- 参考 vue-element-admin 的面包屑

#### (2) `src/components/ui/PageContainer.tsx`
- 页面容器组件，统一标题区、面包屑、操作区布局
- 支持学年选择器 slot
- 统一 padding、margin、border、background

#### (3) `src/components/ui/StatCard.tsx`（重构现有）
- 统一统计卡片，替代 CockpitStat 和内联 stat-card
- 支持 icon、label、value、trend、tone
- 参考 vue-element-admin Dashboard 的卡片风格

#### (4) `src/components/ui/FilterBar.tsx`
- 统一筛选栏组件，支持灵活的筛选字段配置
- 统一查询/重置按钮布局

#### (5) `src/components/ui/ActionBar.tsx`
- 统一操作工具栏，按钮分组、间距统一

#### (6) `src/components/ui/DataTable.tsx`
- 统一数据表格组件
- 支持固定表头、横向滚动、首列复选框
- 支持空状态、加载状态
- 统一 thead/tbody 样式

#### (7) `src/components/ui/DetailModal.tsx`
- 统一详情弹窗组件
- 支持分组展示、标签值对
- 过渡动画

#### (8) `src/components/ui/StepGuide.tsx`
- 业务步骤引导组件（上传模板 → 上传数据 → 数据治理 → 确认审核 → 上载学校端）
- 展示当前步骤状态

### 3.2 页面重构详情

#### CollegeDifficultyPage（业务首页）— 重构
**改动**：
- 使用 PageContainer 替代手写 header
- 增加驾驶舱统计卡片（4-6 个 StatCard）
- 增加业务流程进度指示（StepGuide）
- 增加快捷入口卡片（本专科信息处理、家庭成员信息处理、困难生明细、提交记录）
- 提交记录表格改用 DataTable 组件
- 整体布局：标题区 → 驾驶舱 → 流程进度 → 快捷入口 → 最近记录

#### CollegeUploadPage（本专科/家庭成员处理）— 重构
**改动**：
- 增加独立的页面头部（标题 + 业务说明 + tab 切换）
- 将 App.tsx 中的上传和处理逻辑保留（暂不拆分 App.tsx 内部逻辑，避免破坏核心业务）
- 外壳页面使用 PageContainer + StepGuide
- tab 切换使用统一样式

#### CollegeDifficultyStudentsPage（困难生明细）— 重构
**改动**：
- 使用 PageContainer 替代手写 header
- 驾驶舱改用统一 StatCard
- 筛选区改用 FilterBar
- 数据表格改用 DataTable
- 详情弹窗改用 DetailModal，增加分组展示（基础信息、家庭情况、困难认定、审核意见）
- 删除全部内联 styles 对象

#### CollegeRecordsPage（提交记录）— 重构
**改动**：
- 使用 PageContainer 替代手写 header
- 增加驾驶舱统计卡片
- 筛选区改用 FilterBar
- 表格改用 DataTable
- 删除全部内联 styles 对象

### 3.3 样式系统统一

#### index.css 增强
- 增加页面过渡动画类（`.bos-page-enter`, `.bos-page-enter-active`）
- 统一卡片、表格、筛选栏、操作栏的样式
- 清理重复的 CSS 覆盖块（当前存在两套样式系统覆盖）
- 增加组件级别的 CSS 类

### 3.4 交互增强

- 按钮点击增加 loading 状态（spinner）
- 表格行 hover 高亮
- 弹窗进出动画（fade + scale）
- 页面内容加载骨架屏

## 四、文件修改清单

### 新建文件
| 文件 | 说明 |
|------|------|
| `src/components/ui/Breadcrumb.tsx` | 面包屑导航 |
| `src/components/ui/PageContainer.tsx` | 页面容器 |
| `src/components/ui/FilterBar.tsx` | 筛选栏 |
| `src/components/ui/ActionBar.tsx` | 操作工具栏 |
| `src/components/ui/DataTable.tsx` | 数据表格 |
| `src/components/ui/DetailModal.tsx` | 详情弹窗 |
| `src/components/ui/StepGuide.tsx` | 业务步骤引导 |
| `src/components/ui/LoadingSpinner.tsx` | 加载指示器 |
| `src/components/ui/EmptyState.tsx` | 空状态占位 |

### 修改文件
| 文件 | 改动范围 |
|------|----------|
| `src/pages/college/CollegeDifficultyPage.tsx` | 全面重构，使用公共组件 |
| `src/pages/college/CollegeUploadPage.tsx` | 增加页面头部和步骤引导 |
| `src/pages/college/CollegeDifficultyStudentsPage.tsx` | 全面重构，删除内联样式 |
| `src/pages/college/CollegeRecordsPage.tsx` | 全面重构，删除内联样式 |
| `src/components/ui/StatCard.tsx` | 重构，统一接口 |
| `src/index.css` | 增加过渡动画、统一组件样式 |

### 不修改文件
| 文件 | 原因 |
|------|------|
| `src/App.tsx` | 核心业务逻辑，本次不拆分内部逻辑，避免破坏风险 |
| `src/services/*` | 服务层逻辑正确，无需修改 |
| `src/db/*` | 数据层无需修改 |
| `src/layouts/CollegeLayout.tsx` | 布局框架保持不变 |

## 五、实施步骤

### 第一步：创建公共组件
按依赖顺序创建：LoadingSpinner → EmptyState → Breadcrumb → PageContainer → StatCard → FilterBar → ActionBar → DataTable → DetailModal → StepGuide

### 第二步：重构 CollegeDifficultyPage（业务首页）
使用新组件重建页面结构

### 第三步：重构 CollegeUploadPage（处理页面外壳）
增加页面头部、步骤引导

### 第四步：重构 CollegeDifficultyStudentsPage（困难生明细）
删除内联样式，使用公共组件

### 第五步：重构 CollegeRecordsPage（提交记录）
删除内联样式，使用公共组件

### 第六步：增强 index.css
增加过渡动画、统一组件样式类

### 第七步：验证
- `npm run lint` 无错误
- `npm run build` 构建成功
- 各页面功能正常

## 六、风险与约束

1. **不修改 App.tsx 内部业务逻辑**：本次重构仅改造页面外壳和UI组件，不触碰核心数据治理逻辑
2. **不改变数据流**：所有 Supabase 读写、IndexedDB 操作保持不变
3. **不改变路由结构**：路由映射和权限守卫保持不变
4. **不削弱治理规则**：困难生和三奖校验规则不修改
5. **样式兼容**：新增 CSS 类不与现有样式冲突
6. **渐进式重构**：每个页面独立可测试，不会一次性全量替换
