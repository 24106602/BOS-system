# Patch Archive

This folder stores historical maintenance scripts used while shaping the BOS local tool.

These scripts are not required for normal daily use. Use the application through:

```text
D:\助理部门\软件\bos-system\打开BOS数据治理平台.bat
```

Archived scripts:

- `add-db-module.js`: added the local hardship-student database module.
- `add-db-module.ps1`: earlier PowerShell version of the database module patch.
- `add-family-panel.js`: added the undergraduate hardship-student and family-member processing sub-sections.
- `fix-family-layout.js`: adjusted layout styles for the module and sub-module navigation.

Before re-running any script here, review it against the current `src\App.tsx` because the application may have changed since the script was archived.
