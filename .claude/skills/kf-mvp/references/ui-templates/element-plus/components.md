# Element Plus 组件清单

> 官网：https://element-plus.org | npm: `element-plus`
> 导入方式：全局注册或 `import { ElButton } from 'element-plus'`

---

## 基础组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `ElButton` | `element-plus` | 按钮 |
| `ElIcon` | `@element-plus/icons-vue` | 图标 |
| `ElTypography` | `element-plus` | 排版 |
| `ElDivider` | `element-plus` | 分割线 |
| `ElRow` / `ElCol` | `element-plus` | 栅格布局 |
| `ElSpace` | `element-plus` | 间距 |
| `ElContainer` | `element-plus` | 布局容器 |
| `ElHeader` / `ElAside` / `ElMain` / `ElFooter` | `element-plus` | 布局区域 |

## 表单组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `ElForm` / `ElFormItem` | `element-plus` | 表单 |
| `ElInput` | `element-plus` | 文本输入 |
| `ElInputNumber` | `element-plus` | 数字输入 |
| `ElSelect` | `element-plus` | 下拉选择 |
| `ElTreeSelect` | `element-plus` | 树选择 |
| `ElCascader` | `element-plus` | 级联选择 |
| `ElDatePicker` | `element-plus` | 日期选择 |
| `ElTimePicker` | `element-plus` | 时间选择 |
| `ElSwitch` | `element-plus` | 开关 |
| `ElRadioGroup` / `ElRadio` | `element-plus` | 单选 |
| `ElCheckboxGroup` / `ElCheckbox` | `element-plus` | 多选 |
| `ElUpload` | `element-plus` | 上传 |
| `ElSlider` | `element-plus` | 滑块 |
| `ElRate` | `element-plus` | 评分 |
| `ElColorPicker` | `element-plus` | 颜色选择器 |
| `ElTransfer` | `element-plus` | 穿梭框 |
| `ElAutoComplete` | `element-plus` | 自动完成 |

## 数据展示

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `ElTable` / `ElTableColumn` | `element-plus` | 表格（核心组件） |
| `ElDescriptions` | `element-plus` | 描述列表 |
| `ElTag` | `element-plus` | 标签 |
| `ElBadge` | `element-plus` | 徽标 |
| `ElAvatar` | `element-plus` | 头像 |
| `ElImage` | `element-plus` | 图片 |
| `ElCard` | `element-plus` | 卡片 |
| `ElCarousel` / `ElCarouselItem` | `element-plus` | 轮播 |
| `ElCollapse` | `element-plus` | 折叠面板 |
| `ElTimeline` | `element-plus` | 时间线 |
| `ElTree` / `ElTreeNode` | `element-plus` | 树形控件 |
| `ElCalendar` | `element-plus` | 日历 |
| `ElStatistic` | `element-plus` | 统计数值 |
| `ElProgress` | `element-plus` | 进度条 |

## 导航组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `ElMenu` / `ElMenuItem` / `ElSubMenu` | `element-plus` | 导航菜单 |
| `ElBreadcrumb` | `element-plus` | 面包屑 |
| `ElDropdown` | `element-plus` | 下拉菜单 |
| `ElSteps` | `element-plus` | 步骤条 |
| `ElPagination` | `element-plus` | 分页 |
| `ElTabs` / `ElTabPane` | `element-plus` | 标签页 |
| `ElAffix` | `element-plus` | 固钉 |
| `ElAnchor` | `element-plus` | 锚点 |
| `ElBacktop` | `element-plus` | 回到顶部 |

## 反馈组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `ElDialog` | `element-plus` | 对话框 → `v-model` |
| `ElDrawer` | `element-plus` | 抽屉 → `v-model` |
| `ElPopconfirm` | `element-plus` | 气泡确认框 |
| `ElPopover` | `element-plus` | 气泡卡片 |
| `ElTooltip` | `element-plus` | 文字提示 |
| `ElLoading` | `element-plus` | 加载（指令/服务） |
| `ElSkeleton` | `element-plus` | 骨架屏 |
| `ElEmpty` | `element-plus` | 空状态 |
| `ElResult` | `element-plus` | 结果页 |
| `ElAlert` | `element-plus` | 警告提示 |
| `ElMessage` | `element-plus` | 全局消息（函数式） |
| `ElNotification` | `element-plus` | 通知（函数式） |
| `ElMessageBox` | `element-plus` | 弹框（函数式） |

## Vue 组件写法

```vue
<script setup>
import { ref } from 'vue'
import { ElButton, ElTable, ElDialog, ElMessage } from 'element-plus'

const dialogVisible = ref(false)
const data = ref([])
const columns = [
  { prop: 'name', label: '名称' },
  { prop: 'action', label: '操作' }
]
</script>

<template>
  <ElButton type="primary" @click="dialogVisible = true">新增</ElButton>
  <ElTable :data="data">
    <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
  </ElTable>
  <ElDialog v-model="dialogVisible" title="标题">
    <p>内容</p>
  </ElDialog>
</template>
```
