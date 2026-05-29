import { defineConfig } from 'vite'
// Vite 构建配置：负责 React 插件启用和本地 dist 文件可直接打开的路径设置。
import react from '@vitejs/plugin-react'

// base: './' 让打包后的 dist/index.html 可以直接双击打开。
export default defineConfig({
  plugins: [react()],
  base: './',
})
