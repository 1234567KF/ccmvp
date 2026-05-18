# UI 框架模板参考索引

> 按需加载：Phase 5 编码阶段前加载选定框架的组件清单。
> 框架选定记录在 `memory/mvp-generation-log.md`。

---

## 可用框架

| 框架 | 类型 | 组件清单 | 主题参考 |
|------|------|---------|---------|
| [Ant Design Vue 4.x](./ant-design-vue/components.md) | Web 桌面端 | ✅ 50+ 组件 | ConfigProvider + CSS 变量 |
| [Element Plus](./element-plus/components.md) | Web 桌面端 | ✅ 50+ 组件 | CSS 变量 + 主题编辑器 |
| [Arco Design Vue](./arco-design/components.md) | Web 桌面端 | ✅ 50+ 组件 | CSS 变量 + 可视化平台 |
| [Vant 4.x](./vant/components.md) | H5 移动端 | ✅ 40+ 组件 | ConfigProvider + CSS 变量 |
| [shadcn/vue](./shadcn-vue/components.md) | Web 桌面端 | ✅ 30+ 组件 | Tailwind CSS 变量 |
| [Tailwind CSS](./tailwind/patterns.md) | 通用（工具类） | ✅ 模式参考 | tailwind.config.js / CSS |

## 加载规则

| 时机 | 动作 |
|------|------|
| Phase 0 (框架选定) | 记录框架名称到 `memory/mvp-generation-log.md` |
| Phase 5 编码前 | 加载选定框架的组件清单文件 |
| Phase 5 结束后 | 框架引用从活跃上下文卸载 |
| 其他 Phase | 仅记录名称，不加载组件清单 |
