# Vant 4.x 组件清单

> 官网：https://vant-ui.github.io | npm: `vant`
> 导入方式：`import { Button } from 'vant'`（按需导入，无需全局注册）

---

## 基础组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Button` | `vant` | 按钮 |
| `Icon` | `vant` | 图标 |
| `Cell` / `CellGroup` | `vant` | 单元格（列表项） |
| `Image` | `vant` | 图片 |
| `Row` / `Col` | `vant` | 栅格布局 |
| `Space` | `vant` | 间距 |
| `Divider` | `vant` | 分割线 |
| `ConfigProvider` | `vant` | 主题配置 |

## 表单组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Form` | `vant` | 表单容器 |
| `Field` | `vant` | 输入框（功能丰富） |
| `Picker` | `vant` | 选择器 |
| `DatePicker` (见 DatetimePicker) | `vant` | 日期选择器 |
| `TimePicker` | `vant` | 时间选择器 |
| `Cascader` | `vant` | 级联选择 |
| `Switch` | `vant` | 开关 |
| `Radio` / `RadioGroup` | `vant` | 单选 |
| `Checkbox` / `CheckboxGroup` | `vant` | 多选 |
| `Stepper` | `vant` | 步进器（数量增减） |
| `Rate` | `vant` | 评分 |
| `Slider` | `vant` | 滑块 |
| `Uploader` | `vant` | 文件上传 |
| `Search` | `vant` | 搜索框 |
| `PasswordInput` | `vant` | 密码输入 |
| `NumberKeyboard` | `vant` | 数字键盘 |

## 反馈组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Dialog` | `vant` | 对话框（函数式 + 组件式） |
| `Toast` | `vant` | 轻提示（函数式） |
| `Notify` | `vant` | 通知（顶部消息） |
| `ActionSheet` | `vant` | 动作面板 |
| `Popup` | `vant` | 弹出层 → `v-model:show` |
| `Loading` | `vant` | 加载图标 |
| `Overlay` | `vant` | 遮罩层 |
| `Skeleton` | `vant` | 骨架屏 |
| `Empty` | `vant` | 空状态 |

## 展示组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `List` | `vant` | 列表（滚动加载，替代 Table） |
| `Tag` | `vant` | 标签 |
| `Badge` | `vant` | 徽标 |
| `Collapse` | `vant` | 折叠面板 |
| `Swipe` / `SwipeItem` | `vant` | 轮播 |
| `NoticeBar` | `vant` | 通知栏 |
| `Steps` | `vant` | 步骤条 |
| `Progress` | `vant` | 进度条 |
| `Circle` | `vant` | 环形进度 |
| `ImagePreview` | `vant` | 图片预览（函数式） |
| `CountDown` | `vant` | 倒计时 |
| `Grid` / `GridItem` | `vant` | 宫格 |
| `Card` | `vant` | 商品卡片 |
| `Panel` | `vant` | 面板 |

## 导航组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `NavBar` | `vant` | 顶部导航栏 |
| `Tabbar` / `TabbarItem` | `vant` | 底部标签栏 |
| `Tab` / `Tabs` | `vant` | 标签页 |
| `Sidebar` / `SidebarItem` | `vant` | 侧边导航 |
| `IndexBar` / `IndexAnchor` | `vant` | 索引栏（通讯录风格） |
| `DropdownMenu` | `vant` | 下拉菜单 |
| `Pagination` | `vant` | 分页 |
| `Sticky` | `vant` | 粘性布局 |

## 业务组件

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `AddressList` | `vant` | 地址列表 |
| `AddressEdit` | `vant` | 地址编辑 |
| `Area` | `vant` | 省市区选择 |
| `Sku` | `vant` | 商品 SKU 选择 |
| `CouponCell` | `vant` | 优惠券单元格 |
| `CouponList` | `vant` | 优惠券列表 |
| `SubmitBar` | `vant` | 提交订单栏 |
| `GoodsAction` | `vant` | 商品行动按钮 |

## Vue 组件写法

```vue
<script setup>
import { ref } from 'vue'
import { showToast, showDialog } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'

const show = ref(false)
const list = ref([])

const onLoad = () => {
  // 滚动加载
}

const onSubmit = (values) => {
  showToast('提交成功')
}
</script>

<template>
  <van-nav-bar title="页面标题" left-arrow @click-left="onBack" />
  <van-list v-model:loading="loading" :finished="finished" @load="onLoad">
    <van-cell v-for="item in list" :key="item.id" :title="item.name" />
  </van-list>
  <van-popup v-model:show="show" position="bottom">
    <p>弹出内容</p>
  </van-popup>
  <van-button type="primary" block @click="onSubmit">提交</van-button>
</template>
```

## 关键注意

| 要点 | 说明 |
|------|------|
| **组件前缀** | 模板中使用 `van-` 前缀（如 `van-button`） |
| **Toast/Dialog** | Vant 4 中改为函数式（`showToast`），需手动引入样式 |
| **rem 适配** | Vant 默认基于 37.5px 设计稿，需 `postcss-pxtorem` |
| **无 Table 组件** | 列表用 `van-list` + `van-cell` 实现 |
| **Popup 使用** | `v-model:show` 控制显示，非 v4 版本用 `v-model:show` |
