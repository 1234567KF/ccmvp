# Ant Design Vue 4.x 组件清单

> 官网：https://antdv.com | npm: `ant-design-vue`
> 导入方式：全局注册或 `import { Button } from 'ant-design-vue'`

---

## 基础组件

| 组件名 | 导入路径 | 用途 | v4 写法 |
|--------|---------|------|---------|
| `Button` | `ant-design-vue` | 按钮 | `@click` / `v-on:click` |
| `Icon` | `@ant-design/icons-vue` | 图标 | `<IconFont />` |
| `Typography` | `ant-design-vue` | 排版 | 含 Title/Text/Paragraph |
| `Divider` | `ant-design-vue` | 分割线 | |
| `Grid` (Row/Col) | `ant-design-vue` | 栅格 | |
| `Space` | `ant-design-vue` | 间距 | |
| `Layout` | `ant-design-vue` | 布局 | 含 Header/Sider/Content/Footer |

## 表单组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Form` / `Form.Item` | `ant-design-vue` | 表单容器 |
| `Input` | `ant-design-vue` | 文本输入 |
| `InputNumber` | `ant-design-vue` | 数字输入 |
| `Textarea` | `ant-design-vue` | 多行文本 |
| `Select` | `ant-design-vue` | 下拉选择 |
| `TreeSelect` | `ant-design-vue` | 树选择 |
| `Cascader` | `ant-design-vue` | 级联选择 |
| `DatePicker` | `ant-design-vue` | 日期选择 |
| `TimePicker` | `ant-design-vue` | 时间选择 |
| `Switch` | `ant-design-vue` | 开关 |
| `Radio` / `Radio.Group` | `ant-design-vue` | 单选 |
| `Checkbox` / `Checkbox.Group` | `ant-design-vue` | 多选 |
| `Upload` | `ant-design-vue` | 上传 |
| `Slider` | `ant-design-vue` | 滑块 |
| `Rate` | `ant-design-vue` | 评分 |
| `Transfer` | `ant-design-vue` | 穿梭框 |

## 数据展示

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Table` | `ant-design-vue` | 表格（核心组件） |
| `List` | `ant-design-vue` | 列表 |
| `Card` | `ant-design-vue` | 卡片 |
| `Descriptions` | `ant-design-vue` | 描述列表 |
| `Tag` | `ant-design-vue` | 标签 |
| `Badge` | `ant-design-vue` | 徽标 |
| `Avatar` | `ant-design-vue` | 头像 |
| `Image` | `ant-design-vue` | 图片 |
| `Carousel` | `ant-design-vue` | 轮播 |
| `Collapse` | `ant-design-vue` | 折叠面板 |
| `Timeline` | `ant-design-vue` | 时间线 |
| `Tree` | `ant-design-vue` | 树形控件 |
| `Calendar` | `ant-design-vue` | 日历 |

## 导航组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Menu` / `Menu.Item` / `SubMenu` | `ant-design-vue` | 导航菜单 |
| `Breadcrumb` | `ant-design-vue` | 面包屑 |
| `Dropdown` | `ant-design-vue` | 下拉菜单 |
| `Steps` | `ant-design-vue` | 步骤条 |
| `Pagination` | `ant-design-vue` | 分页 |
| `Tabs` | `ant-design-vue` | 标签页 |
| `Anchor` | `ant-design-vue` | 锚点 |

## 反馈组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Modal` | `ant-design-vue` | 模态框 → `v-model:open` |
| `Drawer` | `ant-design-vue` | 抽屉 → `v-model:open` |
| `Popconfirm` | `ant-design-vue` | 气泡确认 |
| `Popover` | `ant-design-vue` | 气泡卡片 |
| `Tooltip` | `ant-design-vue` | 文字提示 |
| `Spin` | `ant-design-vue` | 加载中 |
| `Progress` | `ant-design-vue` | 进度条 |
| `Skeleton` | `ant-design-vue` | 骨架屏 |
| `Empty` | `ant-design-vue` | 空状态 |
| `Result` | `ant-design-vue` | 结果页 |
| `Alert` | `ant-design-vue` | 警告提示 |
| `message` | `ant-design-vue` | 全局消息（函数式） |
| `notification` | `ant-design-vue` | 通知提醒（函数式） |

## v3 → v4 关键变化

| v3 (3.x) | v4 (4.x) |
|---------|---------|
| `v-model:visible` | `v-model:open` |
| `v-model:visible` on Drawer | `v-model:open` |
| `a-table` columns 配置 | 不变，v4 新增 `@resizeColumn` |
| `a-form` `v-model` | `v-model` 绑定 Form 实例 |
| `a-form-model` / `a-form` | 统一为 `a-form` |

## Vue 组件写法

```vue
<script setup>
import { ref } from 'vue'
import { Button, Table, Modal, message } from 'ant-design-vue'

const open = ref(false)
const data = ref([])
const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '操作', key: 'action' }
]
</script>

<template>
  <Button type="primary" @click="open = true">新增</Button>
  <Table :dataSource="data" :columns="columns" />
  <Modal v-model:open="open" title="标题">
    <p>内容</p>
  </Modal>
</template>
```
