# shadcn/vue 组件清单

> 官网：https://shadcn-vue.com | npm: 无（通过 CLI 添加组件到项目）
> 依赖：`radix-vue` + `tailwindcss` + `class-variance-authority` + `lucide-vue-next`
> 安装方式：`npx shadcn-vue@latest init` → `npx shadcn-vue@latest add <组件名>`

---

## 特点

- **复制到项目**：组件不是 npm 依赖，是复制到项目 `components/ui/` 目录的源码
- **完全控制**：所有样式在组件源码里用 Tailwind 类直接控制
- **按需添加**：只添加你用的组件，不产生额外包体积
- **无障碍**：基于 Radix Vue，自带无障碍属性

## 核心组件

| 组件名 | CLI 添加命令 | 用途 | Radix Vue 底层 |
|--------|-------------|------|---------------|
| `Button` | `npx shadcn-vue add button` | 按钮 | 基础 HTML |
| `Input` | `npx shadcn-vue add input` | 文本输入 | 基础 HTML |
| `Label` | `npx shadcn-vue add label` | 标签 | 基础 HTML |
| `Form` | `npx shadcn-vue add form` | 表单 | `radix-vue` Form |
| `Select` | `npx shadcn-vue add select` | 下拉选择 | `RadixSelect` |
| `Checkbox` | `npx shadcn-vue add checkbox` | 复选框 | `RadixCheckbox` |
| `RadioGroup` | `npx shadcn-vue add radio-group` | 单选组 | `RadixRadioGroup` |
| `Switch` | `npx shadcn-vue add switch` | 开关 | `RadixSwitch` |
| `Slider` | `npx shadcn-vue add slider` | 滑块 | `RadixSlider` |
| `Textarea` | `npx shadcn-vue add textarea` | 多行输入 | 基础 HTML |
| `Dialog` | `npx shadcn-vue add dialog` | 模态框 | `RadixDialog` |
| `Popover` | `npx shadcn-vue add popover` | 气泡卡片 | `RadixPopover` |
| `Tooltip` | `npx shadcn-vue add tooltip` | 文字提示 | `RadixTooltip` |
| `DropdownMenu` | `npx shadcn-vue add dropdown-menu` | 下拉菜单 | `RadixDropdownMenu` |
| `ContextMenu` | `npx shadcn-vue add context-menu` | 右键菜单 | `RadixContextMenu` |
| `Sheet` | `npx shadcn-vue add sheet` | 抽屉面板 | `RadixDialog` (改编) |
| `Drawer` | `npx shadcn-vue add drawer` | 抽屉（移动端） | `vaul-vue` |
| `Tabs` | `npx shadcn-vue add tabs` | 标签页 | `RadixTabs` |
| `Accordion` | `npx shadcn-vue add accordion` | 折叠面板 | `RadixAccordion` |
| `Alert` | `npx shadcn-vue add alert` | 警告提示 | 基础 HTML |
| `Card` | `npx shadcn-vue add card` | 卡片 | 基础 HTML |
| `Badge` | `npx shadcn-vue add badge` | 徽标/标签 | 基础 HTML |
| `Avatar` | `npx shadcn-vue add avatar` | 头像 | `RadixAvatar` |
| `Progress` | `npx shadcn-vue add progress` | 进度条 | `RadixProgress` |
| `Skeleton` | `npx shadcn-vue add skeleton` | 骨架屏 | 基础 HTML |
| `Separator` | `npx shadcn-vue add separator` | 分割线 | `RadixSeparator` |
| `Table` | `npx shadcn-vue add table` | 数据表格 | 基础 HTML |
| `Pagination` | `npx shadcn-vue add pagination` | 分页 | 基础 HTML |
| `Command` | `npx shadcn-vue add command` | 命令面板 | `cmdk-vue` |
| `Toast` | `npx shadcn-vue add toast` | 消息提示 | `vue-sonner` |
| `Calendar` | `npx shadcn-vue add calendar` | 日历 | `radix-vue` DatePicker |
| `DatePicker` | `npx shadcn-vue add date-picker` | 日期选择 | Calendar + Popover |

## 导入方式

组件复制到 `components/ui/` 后，从本路径导入：

```vue
<script setup>
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/toast'
</script>
```

## Vue 组件写法

```vue
<script setup>
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast/use-toast'

const { toast } = useToast()

const onSubmit = () => {
  toast({ title: '提交成功', description: '数据已保存' })
}
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button>编辑</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>编辑信息</DialogTitle>
        <DialogDescription>修改以下字段</DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <Input placeholder="名称" />
      </div>
      <DialogFooter>
        <Button type="submit" @click="onSubmit">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

## 目录结构

```
src/
  components/
    ui/
      button/
        Button.vue
      input/
        Input.vue
      dialog/
        Dialog.vue
        DialogContent.vue
        ...
```

## 关键注意

| 要点 | 说明 |
|------|------|
| **非 npm 包** | 组件源码直接复制到项目，可任意修改样式 |
| **Tailwind 必需** | 项目必须已配置 Tailwind CSS |
| **图标库** | 推荐搭配 `lucide-vue-next` 图标 |
| **主题通过 CSS 变量** | 修改 `globals.css` 中的 CSS 变量即可换肤 |
| **组件命名** | 导入路径以 `@/components/ui/` 开头 |
