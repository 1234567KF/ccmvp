# Arco Design Vue 组件清单

> 官网：https://arco.design/vue | npm: `@arco-design/web-vue`
> 导入方式：全局注册或 `import { Button } from '@arco-design/web-vue'`

---

## 基础组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Button` | `@arco-design/web-vue` | 按钮 |
| `Icon` | `@arco-design/web-vue/es/icon` | 图标 |
| `Typography` | `@arco-design/web-vue` | 排版 |
| `Divider` | `@arco-design/web-vue` | 分割线 |
| `Grid` (Row/Col) | `@arco-design/web-vue` | 栅格 |
| `Space` | `@arco-design/web-vue` | 间距 |
| `Layout` | `@arco-design/web-vue` | 布局（Header/Sider/Content/Footer） |

## 表单组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Form` / `FormItem` | `@arco-design/web-vue` | 表单 |
| `Input` | `@arco-design/web-vue` | 文本输入 |
| `InputNumber` | `@arco-design/web-vue` | 数字输入 |
| `Select` | `@arco-design/web-vue` | 下拉选择 |
| `TreeSelect` | `@arco-design/web-vue` | 树选择 |
| `Cascader` | `@arco-design/web-vue` | 级联选择 |
| `DatePicker` | `@arco-design/web-vue` | 日期选择 |
| `TimePicker` | `@arco-design/web-vue` | 时间选择 |
| `Switch` | `@arco-design/web-vue` | 开关 |
| `Radio` / `RadioGroup` | `@arco-design/web-vue` | 单选 |
| `Checkbox` / `CheckboxGroup` | `@arco-design/web-vue` | 多选 |
| `Upload` | `@arco-design/web-vue` | 上传 |
| `Slider` | `@arco-design/web-vue` | 滑块 |
| `Rate` | `@arco-design/web-vue` | 评分 |
| `Transfer` | `@arco-design/web-vue` | 穿梭框 |
| `AutoComplete` | `@arco-design/web-vue` | 自动完成 |

## 数据展示

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Table` | `@arco-design/web-vue` | 表格 |
| `List` | `@arco-design/web-vue` | 列表 |
| `Card` | `@arco-design/web-vue` | 卡片 |
| `Descriptions` | `@arco-design/web-vue` | 描述列表 |
| `Tag` | `@arco-design/web-vue` | 标签 |
| `Badge` | `@arco-design/web-vue` | 徽标 |
| `Avatar` | `@arco-design/web-vue` | 头像 |
| `Image` | `@arco-design/web-vue` | 图片 |
| `Carousel` | `@arco-design/web-vue` | 轮播 |
| `Collapse` | `@arco-design/web-vue` | 折叠面板 |
| `Timeline` | `@arco-design/web-vue` | 时间线 |
| `Tree` | `@arco-design/web-vue` | 树形控件 |
| `Calendar` | `@arco-design/web-vue` | 日历 |
| `Skeleton` | `@arco-design/web-vue` | 骨架屏 |
| `Statistic` | `@arco-design/web-vue` | 统计数值 |

## 导航组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Menu` | `@arco-design/web-vue` | 导航菜单 |
| `Breadcrumb` | `@arco-design/web-vue` | 面包屑 |
| `Dropdown` | `@arco-design/web-vue` | 下拉菜单 |
| `Steps` | `@arco-design/web-vue` | 步骤条 |
| `Pagination` | `@arco-design/web-vue` | 分页 |
| `Tabs` | `@arco-design/web-vue` | 标签页 |
| `Anchor` | `@arco-design/web-vue` | 锚点 |

## 反馈组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Modal` | `@arco-design/web-vue` | 模态框 → `v-model:visible` |
| `Drawer` | `@arco-design/web-vue` | 抽屉 → `v-model:visible` |
| `Popconfirm` | `@arco-design/web-vue` | 气泡确认 |
| `Popover` | `@arco-design/web-vue` | 气泡卡片 |
| `Tooltip` | `@arco-design/web-vue` | 文字提示 |
| `Spin` | `@arco-design/web-vue` | 加载中 |
| `Progress` | `@arco-design/web-vue` | 进度条 |
| `Empty` | `@arco-design/web-vue` | 空状态 |
| `Result` | `@arco-design/web-vue` | 结果页 |
| `Alert` | `@arco-design/web-vue` | 警告提示 |
| `Message` | `@arco-design/web-vue` | 全局消息（函数式） |
| `Notification` | `@arco-design/web-vue` | 通知（函数式） |

## 特色组件

| 组件名 | 用途 | 说明 |
|--------|------|------|
| `ResizeBox` | 可缩放容器 | 拖拽调整大小 |
| `Split` | 面板分割 | 左右/上下可拖拽分割 |
| `Calendar` | 日历 | 支持周/月视图切换 |
| `Highlight` | 文本高亮 | 自动高亮匹配关键词 |

## Vue 组件写法

```vue
<script setup>
import { ref } from 'vue'
import { Button, Table, Modal, Message } from '@arco-design/web-vue'

const visible = ref(false)
const data = ref([])
const columns = [
  { title: '名称', dataIndex: 'name' },
  { title: '操作', dataIndex: 'action' }
]
</script>

<template>
  <Button type="primary" @click="visible = true">新增</Button>
  <Table :data="data" :columns="columns" />
  <Modal v-model:visible="visible" title="标题">
    <p>内容</p>
  </Modal>
</template>
```
