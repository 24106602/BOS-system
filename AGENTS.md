# BOS 项目文件位置约束

- BOS 唯一正式仓库：`D:\助理部门\软件\bos-system`。
- BOS Git worktree 统一放在：`D:\助理部门\软件\bos-worktrees`。
- BOS 临时补丁、测试输出和构建缓存统一放在：`D:\助理部门\软件\bos-work`。
- BOS 历史补丁和旧构建归档统一放在：`D:\助理部门\软件\bos-archive`。
- 禁止在 `C:\Users\33378\Documents\系统创建` 或其他 C 盘目录创建 BOS 源码副本、构建产物、补丁目录或 worktree。
- 在执行任何 BOS 命令前，先确认工作目录为 D 盘正式仓库或 D 盘 BOS worktree。
- Vite 正式构建输出保留在仓库内的 `dist`；临时验证构建应显式指定到 `D:\助理部门\软件\bos-work`。
