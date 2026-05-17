# kf-annotate

## 轻量暗门注释注入技能

**不生成页面，只注入注释。**

Phase 5 代码完成后，向现有 HTML 页面注入 PRD 级注释（L0-L6 七层），生成宣讲看板供客户演示和团队宣讲。

### 三阶段流水线

```
Scan → Inject → Dashboard
读取页面+PRD  注入 data-ann 属性  生成宣讲看板
              + 暗门切换脚本      含 Mermaid 图表
```

### 交互方式

- `Ctrl+M` 切换暗门模式
- 蓝色虚线边框标注含注释的元素
- 悬停显示注释气泡
- 再次 `Ctrl+M` 恢复正常页面

### 被谁依赖

- `kf-mvp` — Phase 6 自动调用
