# Tailwind CSS 模式参考

> 官网：https://tailwindcss.com | npm: `tailwindcss`
> 版本：4.x（2025+，使用 CSS-first configuration）
> Vue 3 集成：通过 Vite PostCSS 插件

---

## 常用布局模式

### 页面布局（Admin 风格）

```html
<div class="min-h-screen bg-gray-50">
  <!-- 侧边栏 -->
  <aside class="fixed left-0 top-0 h-screen w-64 bg-white border-r">
    <nav class="p-4 space-y-1">...</nav>
  </aside>
  <!-- 主内容 -->
  <main class="ml-64 p-6">
    <!-- 头部 -->
    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold text-gray-900">页面标题</h1>
      <button class="...">操作</button>
    </header>
    <!-- 内容区 -->
    <div class="...">...</div>
  </main>
</div>
```

### 移动端页面布局

```html
<div class="flex flex-col min-h-screen">
  <header class="sticky top-0 z-10 bg-white border-b px-4 h-14 flex items-center">
    <h1 class="text-lg font-medium">标题</h1>
  </header>
  <main class="flex-1 px-4 py-4 overflow-y-auto">
    ...
  </main>
  <footer class="sticky bottom-0 bg-white border-t px-4 py-3">
    <button class="w-full ...">提交</button>
  </footer>
</div>
```

### 响应式网格

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <div v-for="item in items" :key="item.id" class="bg-white rounded-lg shadow p-4">
    {{ item.name }}
  </div>
</div>
```

### Flex 两栏

```html
<div class="flex gap-6">
  <div class="w-72 flex-shrink-0">侧边栏</div>
  <div class="flex-1 min-w-0">主内容（min-w-0 防止溢出）</div>
</div>
```

---

## 常用组件模式

### 卡片

```html
<div class="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
  <div class="p-6">
    <h3 class="text-lg font-semibold text-gray-900">卡片标题</h3>
    <p class="mt-2 text-sm text-gray-500">卡片描述内容</p>
  </div>
  <div class="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
    <span class="text-xs text-gray-400">底部信息</span>
  </div>
</div>
```

### 表单元素

```html
<!-- 输入框 -->
<div class="space-y-1">
  <label class="block text-sm font-medium text-gray-700">标签</label>
  <input class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
  <p class="text-xs text-gray-400">提示文字</p>
</div>

<!-- 按钮 -->
<button class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
  主要按钮
</button>

<button class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
  次要按钮
</button>
```

### 表格

```html
<div class="overflow-x-auto">
  <table class="min-w-full divide-y divide-gray-200">
    <thead class="bg-gray-50">
      <tr>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
        <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
      </tr>
    </thead>
    <tbody class="bg-white divide-y divide-gray-200">
      <tr v-for="row in data" :key="row.id" class="hover:bg-gray-50">
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ row.name }}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full"
                :class="row.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'">
            {{ row.status }}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
          <button class="text-blue-600 hover:text-blue-800">编辑</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### 模态框

```html
<!-- 遮罩 -->
<teleport to="body">
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="fixed inset-0 bg-black/50" @click="open = false" />
    <div class="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 z-10">
      <h3 class="text-lg font-semibold">标题</h3>
      <p class="mt-2 text-sm text-gray-500">内容</p>
      <div class="mt-6 flex justify-end gap-3">
        <button class="..." @click="open = false">取消</button>
        <button class="..." @click="handleConfirm">确认</button>
      </div>
    </div>
  </div>
</teleport>
```

### 标签 Badge

```html
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      :class="{
        'bg-green-100 text-green-800': type === 'success',
        'bg-yellow-100 text-yellow-800': type === 'warning',
        'bg-red-100 text-red-800': type === 'error',
        'bg-blue-100 text-blue-800': type === 'info',
      }">
  <span class="w-1.5 h-1.5 rounded-full mr-1.5"
        :class="{
          'bg-green-500': type === 'success',
          'bg-yellow-500': type === 'warning',
          'bg-red-500': type === 'error',
          'bg-blue-500': type === 'info',
        }" />
  {{ label }}
</span>
```

---

## 主题定制

### tailwind.config.js

```javascript
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
```

### CSS-first 配置（Tailwind 4.x）

```css
@import "tailwindcss";
@theme {
  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
}
```

### Vue 3 + Tailwind 最佳实践

| 实践 | 说明 |
|------|------|
| 动态类名 | 使用 `:class="[cond && 'class1', 'class2']"` 而非字符串拼接 |
| 提取组件 | 重复的类组合提取为 Vue 组件 |
| `@apply` 适度 | 在组件内用 `@apply` 提取复杂组合，避免滥用丧失灵活性 |
| Dark Mode | 用 `class` 策略 + `dark:` 前缀 |
| 图标 | 搭配 `lucide-vue-next` 或 `heroicons` |
| 无预置组件 | Tailwind 不提供预置组件，需要时搭配 shadcn/vue 或 Radix Vue |

## Vue 组件写法

```vue
<script setup>
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

const open = ref(false)
const items = ref([{ id: 1, name: '示例', status: 'active' }])
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-gray-900">标题</h1>
      <button
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        @click="open = true"
      >
        新增
      </button>
    </div>

    <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="item in items" :key="item.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm">{{ item.name }}</td>
            <td class="px-6 py-4 text-right text-sm">
              <button class="text-blue-600 hover:text-blue-800">编辑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="open = false">
      <div class="fixed inset-0 bg-black/50" />
      <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 z-10">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-600" @click="open = false">
          <X class="w-5 h-5" />
        </button>
        <h3 class="text-lg font-semibold">新增</h3>
        <div class="mt-4">
          <input class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="名称" />
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="px-4 py-2 text-sm text-gray-700 hover:text-gray-900" @click="open = false">取消</button>
          <button class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```
