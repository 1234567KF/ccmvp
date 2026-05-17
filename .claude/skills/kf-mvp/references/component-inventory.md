# MVP 组件清单（Component Inventory）

> 用于 build-gate.mjs 的组件存在性校验。定义 MVP 项目中允许和禁止使用的 UI 组件。

---

## 允许使用

### Ant Design Vue 4.x（Web 管理端）

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `Table` | `ant-design-vue` | 数据表格 |
| `Form`, `FormItem` | `ant-design-vue` | 表单 |
| `Input` | `ant-design-vue` | 文本输入 |
| `InputNumber` | `ant-design-vue` | 数字输入 |
| `Select`, `SelectOption` | `ant-design-vue` | 下拉选择 |
| `DatePicker` | `ant-design-vue` | 日期选择 |
| `Button` | `ant-design-vue` | 按钮 |
| `Modal` | `ant-design-vue` | 模态对话框 |
| `Card` | `ant-design-vue` | 卡片容器 |
| `Tag` | `ant-design-vue` | 标签 |
| `Badge` | `ant-design-vue` | 徽标 |
| `Space` | `ant-design-vue` | 间距布局 |
| `Row`, `Col` | `ant-design-vue` | 栅格布局 |
| `Layout`, `LayoutHeader`, `LayoutSider`, `LayoutContent` | `ant-design-vue` | 页面布局 |
| `Menu`, `MenuItem`, `SubMenu` | `ant-design-vue` | 导航菜单 |
| `Breadcrumb`, `BreadcrumbItem` | `ant-design-vue` | 面包屑 |
| `Pagination` | `ant-design-vue` | 分页 |
| `Dropdown`, `DropdownMenu`, `DropdownItem` | `ant-design-vue` | 下拉菜单 |
| `Popconfirm` | `ant-design-vue` | 气泡确认框 |
| `Tooltip` | `ant-design-vue` | 文字提示 |
| `Spin` | `ant-design-vue` | 加载中 |
| `Empty` | `ant-design-vue` | 空状态 |
| `Result` | `ant-design-vue` | 结果页 |
| `Tabs`, `TabPane` | `ant-design-vue` | 标签页 |
| `Descriptions`, `DescriptionsItem` | `ant-design-vue` | 描述列表 |
| `Avatar` | `ant-design-vue` | 头像 |
| `Upload` | `ant-design-vue` | 文件上传 |
| `Image` | `ant-design-vue` | 图片 |
| `Divider` | `ant-design-vue` | 分割线 |
| `Alert` | `ant-design-vue` | 警告提示 |
| `message` | `ant-design-vue` | 全局消息（函数调用） |
| `notification` | `ant-design-vue` | 通知提醒（函数调用） |
| `Tree`, `TreeNode` | `ant-design-vue` | 树形控件 |

### Vant 4.x（H5 移动端）

| 组件名 | 导入路径 | 用途 |
|--------|---------|------|
| `List` | `vant` | 列表（替代不存在的 van-table） |
| `Cell`, `CellGroup` | `vant` | 单元格 |
| `Form`, `Field` | `vant` | 表单字段 |
| `Button` | `vant` | 按钮 |
| `NavBar` | `vant` | 导航栏 |
| `Tabbar`, `TabbarItem` | `vant` | 底部标签栏 |
| `Tab`, `Tabs` | `vant` | 标签页 |
| `Popup` | `vant` | 弹出层 |
| `Dialog` | `vant` | 对话框 |
| `Toast` | `vant` | 轻提示 |
| `Search` | `vant` | 搜索 |
| `Picker` | `vant` | 选择器 |
| `DatetimePicker` | `vant` | 时间选择 |
| `Uploader` | `vant` | 文件上传 |
| `Image` | `vant` | 图片 |
| `Empty` | `vant` | 空状态 |
| `Loading` | `vant` | 加载 |
| `Overlay` | `vant` | 遮罩层 |
| `Swipe`, `SwipeItem` | `vant` | 轮播 |
| `Tag` | `vant` | 标签 |
| `Badge` | `vant` | 徽标 |
| `Stepper` | `vant` | 步进器 |
| `Switch` | `vant` | 开关 |
| `Checkbox`, `CheckboxGroup` | `vant` | 复选框 |
| `Radio`, `RadioGroup` | `vant` | 单选框 |
| `Rate` | `vant` | 评分 |
| `Slider` | `vant` | 滑块 |
| `PullRefresh` | `vant` | 下拉刷新 |
| `Sticky` | `vant` | 粘性布局 |
| `NoticeBar` | `vant` | 通知栏 |
| `ActionSheet` | `vant` | 动作面板 |
| `DropdownMenu` | `vant` | 下拉菜单 |

---

## 禁止使用

| 组件名 | 原因 | 替代方案 |
|--------|------|---------|
| `van-table` | Vant 4.x 中**不存在**此组件 | 使用 `van-list` + `van-cell` 构建列表 |
| `a-table` (Ant Design 3.x) | 旧版 API | 使用 `a-table` (Ant Design 4.x v4 语法) |
| `van-tree-select` | Vant 4.x 中已废弃 | 使用 `van-sidebar` + `van-tree-select` 替代 |
| Element UI / Element Plus | 非项目 UI 框架，与 Ant Design 混用会导致样式冲突 | 统一使用 Ant Design Vue |
| `bootstrap` | CSS 框架与 Ant Design 冲突 | 使用 Ant Design 内置栅格系统 |
| `jquery` | MVP 使用 Vue 3，不引入 jQuery | 使用 Vue 响应式 |

---

## 验证规则

1. **Ant Design Vue 和 Vant 不可在同一页面混用**（分别用于 Web 管理端和 H5 移动端）
2. **组件名必须与官方文档一致**（区分大小写，如 `NavBar` 不是 `Navbar`）
3. **禁止使用文档中不存在的组件**（如 `van-table`）
4. **优先使用 `v4` 语法**（如 Ant Design Vue 4.x 的 `v-model:open` 而非 `v-model:visible`）
