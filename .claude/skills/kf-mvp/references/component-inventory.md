# MVP 组件清单（Component Inventory）

> 用于 build-gate.mjs 的组件存在性校验。
> 当前为多框架索引模式——按 Phase 0 选定的框架加载对应组件清单。
> 组件校验路径：根据选定框架指向 `ui-templates/{框架}/components.md`

---

## 框架组件清单索引

| 框架 | 组件清单路径 | 组件数 | 适用场景 |
|------|------------|--------|---------|
| **Ant Design Vue 4.x** | `references/ui-templates/ant-design-vue/components.md` | ~50 | Web 管理端、企业后台 |
| **Element Plus 2.x** | `references/ui-templates/element-plus/components.md` | ~50 | Web 管理端、通用后台 |
| **Arco Design Vue 2.x** | `references/ui-templates/arco-design/components.md` | ~50 | Web 管理端、现代企业应用 |
| **Vant 4.x** | `references/ui-templates/vant/components.md` | ~40+ | H5 移动端 |
| **shadcn/vue** | `references/ui-templates/shadcn-vue/components.md` | ~30+ | Web 现代应用 |
| **Tailwind CSS 4.x** | `references/ui-templates/tailwind/patterns.md` | 模式参考 | 自定义设计 |

---

## 选定框架后的校验配置

Phase 0 选定框架后，build-gate.mjs 组件校验指向对应的组件清单文件：

```bash
# Ant Design Vue
node build-gate.mjs --component-inventory references/ui-templates/ant-design-vue/components.md

# Element Plus
node build-gate.mjs --component-inventory references/ui-templates/element-plus/components.md

# Vant
node build-gate.mjs --component-inventory references/ui-templates/vant/components.md
```

---

## 全局禁止规则（所有框架通用）

| 组件/库 | 原因 | 替代方案 |
|---------|------|---------|
| `jquery` | MVP 使用 Vue 3，不引入 jQuery | 使用 Vue 响应式 |
| `bootstrap` | CSS 框架与 Vue 组件库样式冲突 | 使用框架自带栅格/Tailwind |
| Element UI（非 Plus） | Element UI 是 Vue 2 版 | 使用 Element Plus |
| 两个框架混用 | 同一页面混用两个 Web 组件库导致样式/体积问题 | 统一使用选定框架 |

---

## 组件校验规则

1. **组件名必须与官方文档一致**（区分大小写）
2. **禁止使用文档中不存在的组件名**
3. **优先使用最新版本语法**（如 Ant Design Vue 4.x 的 `v-model:open` 而非 `v-model:visible`）
4. **Web 框架和移动端框架不可在同一页面混用**（Hybrid 项目需分页面使用）
