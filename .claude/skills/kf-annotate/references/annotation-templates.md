# 暗门注释模板（Annotation Templates v2）

> 用于 kf-annotate 的结构化注释 JSON 数据块生成。每层定义必填字段和示例。
> v2 增加：inputType/dataSource/conditionalDisplay/linkageRules/modeDiff/appliesTo + 页面分类(pageType)

---

## 页面分类（pageType）

每个页面在顶层标注类型，AI 按类型选择必填层级：

| pageType | 说明 | 必填层级 |
|----------|------|---------|
| `list` | 列表型页面（搜索+表格+批量操作） | l0, l0_ops, l0_search, l1, l2, l4, l6 |
| `form` | 表单型页面/弹窗（新增/编辑/查看） | l0, l0_ops, l1, l1_bounds, l2, l4, l6 |
| `stats` | 统计型页面（图表/报表/看板） | l0, l1_stats, l2, l4, l6 |
| `special` | 特殊页面（自定义布局/复杂交互） | l0, l0_ops, l1, l2, l4, l6 |

---

## L0 — 页面概览

**必填字段**：`pageName`, `module`, `description`, `targetUsers`, `prdRef`, `pageType`

```json
{
  "l0": {
    "title": "页面概览",
    "content": [
      {"key": "页面名称", "value": "订单管理"},
      {"key": "所属模块", "value": "交易管理 > 订单列表"},
      {"key": "页面类型", "value": "list"},
      {"key": "业务说明", "value": "展示全部订单，支持多条件查询和状态筛选"},
      {"key": "目标用户", "value": "管理员、运营人员"},
      {"key": "PRD 来源", "value": "[PRD 3.2] 订单管理"}
    ]
  }
}
```

---

## L0.ops — 操作定义

**必填字段**：`name`, `description`, `roles`
**新增字段**：`condition`（条件显示规则，无条件的按钮不填）

```json
{
  "l0_ops": {
    "title": "操作定义",
    "content": [
      {"name": "查询", "description": "按条件筛选订单列表", "roles": ["@Admin", "@Manager"], "prdRef": "[PRD 3.2.1]"},
      {"name": "新增订单", "description": "创建新订单，填写客户/商品/金额信息", "roles": ["@Admin", "@Manager"], "prdRef": "[PRD 3.2.1]"},
      {"name": "批量导出", "description": "导出选中订单为 Excel", "roles": ["@Admin"], "prdRef": "[PRD 3.2.5]"},
      {"name": "回退", "description": "将已审核工单回退到待审核状态", "roles": ["@Admin"], "condition": "仅【已审核】状态可操作", "prdRef": "[PRD 3.2.6]"},
      {"name": "删除", "description": "删除订单（软删除）", "roles": ["@Admin"], "condition": "仅【已取消】或【已完成】状态可操作", "prdRef": "[PRD 3.2.6]"}
    ]
  }
}
```

---

## L0.search — 搜索字段（列表型页面专用）

**必填字段**：`field`, `inputType`, `description`

```json
{
  "l0_search": {
    "title": "搜索条件",
    "content": [
      {"field": "keyword", "inputType": "text", "description": "订单号/客户姓名模糊搜索", "placeholder": "输入订单号或客户姓名"},
      {"field": "status", "inputType": "select", "description": "订单状态筛选", "dataSource": "订单状态枚举（待支付/已支付/处理中/已完成/已取消/已退款）"},
      {"field": "dateRange", "inputType": "dateRange", "description": "创建时间范围筛选"},
      {"field": "amountRange", "inputType": "numberRange", "description": "订单金额范围筛选", "min": "0.01", "max": "99999999.99"}
    ]
  }
}
```

---

## L0.deps — 模块依赖（可选）

```json
{
  "l0_deps": {
    "title": "模块依赖",
    "content": [
      {"module": "商品管理", "type": "只读引用", "field": "product_id"},
      {"module": "客户管理", "type": "只读引用", "field": "customer_id"}
    ]
  }
}
```

---

## L1 — 字段说明（增强版 v2）

> **v2 增强**：新增 `inputType`, `dataSource`, `conditionalDisplay`, `linkageRules`, `modeDiff`, `appliesTo`

**必填字段**：`field`, `type`, `description`, `rules`, `example`, `inputType`, `prdRef`
**增强字段**：

| 字段 | 说明 | 适用场景 |
|------|------|---------|
| `inputType` | 前端输入控件类型 | 所有字段 |
| `dataSource` | 下拉/多选的数据来源 | select/multiSelect/radio/checkbox |
| `conditionalDisplay` | 字段的条件显示规则 | 有显示条件的字段 |
| `linkageRules` | 与其他字段的联动规则 | 有联动关系的字段 |
| `modeDiff` | 新增/编辑/查看模式的字段差异 | 表单型页面 |
| `appliesTo` | 字段在哪些上下文中出现 | 所有字段 |

### inputType 枚举

| inputType | 说明 | 示例 |
|-----------|------|------|
| `text` | 文本输入框 | 客户姓名 |
| `number` | 数字输入框 | 订单金额 |
| `select` | 下拉单选 | 订单状态 |
| `multiSelect` | 下拉多选 | 商品标签 |
| `radio` | 单选按钮组 | 性别 |
| `checkbox` | 多选框组 | 通知方式 |
| `file` | 文件上传 | 附件 |
| `date` | 日期选择 | 创建日期 |
| `dateRange` | 日期范围选择 | 查询时间段 |
| `numberRange` | 数字范围 | 金额区间 |
| `datetime` | 日期时间选择 | 精确时间 |
| `textarea` | 多行文本 | 备注说明 |
| `switch` | 开关切换 | 启用/禁用 |
| `cascader` | 级联选择 | 地区选择 |

### 完整示例

```json
{
  "l1": {
    "title": "字段说明",
    "content": [
      {
        "field": "order_no",
        "type": "String(20)",
        "inputType": "text",
        "description": "系统自动生成，格式 ORD+8位数字，全局唯一",
        "rules": "必填，唯一，不可修改",
        "example": "ORD20250101001",
        "appliesTo": ["search", "list", "form"],
        "modeDiff": {"add": "不可见", "edit": "不可见", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.2 R001]"
      },
      {
        "field": "customer_name",
        "type": "String(50)",
        "inputType": "text",
        "description": "客户姓名",
        "rules": "必填，2-50字符",
        "example": "张三",
        "appliesTo": ["search", "list", "form"],
        "modeDiff": {"add": "可见+可编辑", "edit": "可见+可编辑", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.2 R002]"
      },
      {
        "field": "amount",
        "type": "Decimal(10,2)",
        "inputType": "number",
        "description": "订单总金额",
        "rules": "≥ 0.01，2位小数",
        "example": "199.00",
        "appliesTo": ["list", "form"],
        "modeDiff": {"add": "可见+可编辑", "edit": "可见+可编辑", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.2 R003]"
      },
      {
        "field": "status",
        "type": "Enum",
        "inputType": "select",
        "description": "订单状态",
        "dataSource": "订单状态枚举：待支付/已支付/处理中/已完成/已取消/已退款",
        "rules": "见 L3 状态机",
        "example": "待支付",
        "appliesTo": ["search", "list", "form"],
        "modeDiff": {"add": "不可见", "edit": "可见+只读（系统自动流转）", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.3]"
      },
      {
        "field": "invoice_type",
        "type": "Enum",
        "inputType": "radio",
        "description": "发票类型",
        "dataSource": "增值税普通发票/增值税专用发票/电子发票",
        "rules": "必填",
        "example": "电子发票",
        "appliesTo": ["form"],
        "conditionalDisplay": {"dependsOn": "need_invoice", "condition": "equals", "value": true},
        "linkageRules": [
          {"when": "选择「增值税专用发票」", "action": "显示 tax_id 字段"},
          {"when": "invoice_type 变更", "action": "重置 invoice_title 校验规则"}
        ],
        "modeDiff": {"add": "可见+可编辑", "edit": "可见+可编辑", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.7]"
      },
      {
        "field": "remark",
        "type": "String(500)",
        "inputType": "textarea",
        "description": "备注说明",
        "rules": "可选，最多500字符",
        "example": "客户要求周末配送",
        "appliesTo": ["form"],
        "modeDiff": {"add": "可见+可编辑", "edit": "可见+可编辑", "view": "可见+只读"},
        "prdRef": "[PRD 3.2.2]"
      },
      {
        "field": "attachment",
        "type": "File",
        "inputType": "file",
        "description": "相关附件",
        "rules": "可选，支持 pdf/jpg/png，单文件 ≤ 5MB",
        "example": "合同扫描件.pdf",
        "appliesTo": ["form"],
        "modeDiff": {"add": "可见+可上传", "edit": "可见+可上传", "view": "可见+可下载"},
        "prdRef": "[PRD 3.2.8]"
      }
    ]
  }
}
```

---

## L1.list — 列表展示字段配置（列表型页面专用，可选）

当列表展示与表单字段有差异时，在此层补充：

```json
{
  "l1_list": {
    "title": "列表展示配置",
    "content": [
      {"field": "order_no", "width": "160px", "sortable": true, "ellipsis": false},
      {"field": "customer_name", "width": "100px", "sortable": false, "ellipsis": true},
      {"field": "amount", "width": "120px", "sortable": true, "align": "right", "format": "¥#,##0.00"},
      {"field": "status", "width": "100px", "sortable": true, "renderAs": "tag", "colorMap": {"待支付": "orange", "已支付": "blue", "已完成": "green", "已取消": "gray"}},
      {"field": "created_at", "width": "160px", "sortable": true, "format": "YYYY-MM-DD HH:mm"}
    ]
  }
}
```

---

## L1.stats — 统计字段（统计型页面专用）

**必填字段**：`field`, `label`, `calcLogic`, `displayFormat`

```json
{
  "l1_stats": {
    "title": "统计指标",
    "content": [
      {
        "field": "total_orders",
        "label": "订单总数",
        "calcLogic": "COUNT(order_no) WHERE created_at IN 筛选时间段",
        "displayFormat": "number",
        "prdRef": "[PRD 4.1]"
      },
      {
        "field": "total_amount",
        "label": "订单总金额",
        "calcLogic": "SUM(amount) WHERE status != '已取消' AND created_at IN 筛选时间段",
        "displayFormat": "currency",
        "prdRef": "[PRD 4.1]"
      },
      {
        "field": "completion_rate",
        "label": "完成率",
        "calcLogic": "COUNT(status='已完成') / COUNT(*) × 100%",
        "displayFormat": "percent",
        "prdRef": "[PRD 4.2]"
      },
      {
        "field": "status_distribution",
        "label": "订单状态分布",
        "calcLogic": "GROUP BY status → COUNT(*)，按筛选条件过滤",
        "displayFormat": "pieChart",
        "linkageRules": [
          {"when": "dateRange 变更", "action": "重新计算所有统计指标"},
          {"when": "点击饼图扇区", "action": "下方列表筛选对应状态的订单"}
        ],
        "prdRef": "[PRD 4.3]"
      }
    ]
  }
}
```

---

## L1.perm — 权限矩阵（可选）

```json
{
  "l1_perm": {
    "title": "权限矩阵",
    "content": [
      {"field": "amount", "roles": {"@Admin": "读写", "@Manager": "只读", "@Viewer": "不可见"}},
      {"field": "customer_phone", "roles": {"@Admin": "读写", "@Manager": "只读", "@Viewer": "脱敏（138****1234）"}}
    ]
  }
}
```

---

## L1.bounds — 边界值（必填）

> **v2 增强**：新增 `maxInputLen`（最大输入长度）

```json
{
  "l1_bounds": {
    "title": "边界值约束",
    "content": [
      {"field": "amount", "min": "0.01", "max": "99999999.99", "format": "\\d{1,8}\\.\\d{2}", "maxInputLen": 12},
      {"field": "customer_name", "minLen": 2, "maxLen": 50, "maxInputLen": 50, "pattern": "^[\\u4e00-\\u9fa5a-zA-Z]+$"},
      {"field": "remark", "maxLen": 500, "maxInputLen": 500},
      {"field": "order_no", "pattern": "^ORD\\d{12}$", "maxInputLen": 15}
    ]
  }
}
```

---

## L2 — 业务规则

**必填字段**：`ruleId`, `name`, `condition`, `logic`, `scope`, `prdRef`

```json
{
  "l2": {
    "title": "业务规则",
    "content": [
      {"ruleId": "BR-001", "name": "金额计算", "condition": "创建/编辑订单时", "logic": "商品单价 × 数量 - 优惠金额 + 运费", "scope": "amount 字段", "prdRef": "[PRD 3.2.4 R005]"},
      {"ruleId": "BR-002", "name": "库存扣减", "condition": "订单支付成功后", "logic": "对应商品库存 -= 订单数量", "scope": "product.stock 字段", "prdRef": "[PRD 3.2.4 R006]"},
      {"ruleId": "BR-003", "name": "超时取消", "condition": "订单创建后 30 分钟未支付", "logic": "自动将状态改为「已取消」+ 释放库存", "scope": "order.status", "prdRef": "[PRD 3.2.4 R007]"}
    ]
  }
}
```

---

## L2.exceptions — 异常处理与边界值表（测试视角）

> **v2 增强**：从测试团队需求出发，增加 `boundary` 字段

**必填字段**：`scenario`, `trigger`, `recovery`, `prdRef`
**新增字段**：`boundary`（关联的边界值定义）

```json
{
  "l2_exceptions": {
    "title": "异常处理与边界值",
    "content": [
      {
        "scenario": "支付金额与订单金额不一致",
        "trigger": "支付回调金额 ≠ 订单金额",
        "recovery": "标记订单为「异常」，记录差异日志，人工介入处理",
        "boundary": "差异金额 > 0.01 时触发",
        "prdRef": "[PRD 3.4.1]"
      },
      {
        "scenario": "库存不足",
        "trigger": "支付时可用库存 < 订单数量",
        "recovery": "支付失败，前端提示「库存不足」，订单保持「待支付」",
        "boundary": "库存 = 0 时按钮置灰不可点击",
        "prdRef": "[PRD 3.4.2]"
      },
      {
        "scenario": "客户姓名超长",
        "trigger": "输入 > 50 字符",
        "recovery": "前端 maxlength=50 截断 + 后端校验拒绝",
        "boundary": "maxLen: 50, maxInputLen: 50",
        "prdRef": "[PRD 3.4.3]"
      },
      {
        "scenario": "并发修改冲突",
        "trigger": "两人同时编辑同一订单并保存",
        "recovery": "后保存者收到「数据已被他人修改，请刷新后重试」提示",
        "boundary": "基于 updated_at 时间戳乐观锁",
        "prdRef": "[PRD 3.4.4]"
      }
    ]
  }
}
```

---

## L3 — 状态机

```json
{
  "l3": {
    "title": "状态机",
    "entity": "订单 (Order)",
    "states": ["待支付", "已支付", "处理中", "已完成", "已取消", "已退款"],
    "transitions": [
      {"from": "待支付", "to": "已支付", "event": "支付成功", "guard": "金额匹配 + 库存充足", "roles": ["系统"]},
      {"from": "待支付", "to": "已取消", "event": "超时/手动取消", "guard": "创建超过30分钟 或 用户手动", "roles": ["系统", "@Customer"]},
      {"from": "已支付", "to": "处理中", "event": "管理员接单", "guard": "无", "roles": ["@Admin"]},
      {"from": "处理中", "to": "已完成", "event": "发货确认", "guard": "物流单号已填写", "roles": ["@Admin"]},
      {"from": "已支付", "to": "已退款", "event": "申请退款通过", "guard": "退款金额 ≤ 订单金额", "roles": ["@Admin"]}
    ],
    "mermaid": "stateDiagram-v2\n  [*] --> 待支付\n  待支付 --> 已支付: 支付成功\n  待支付 --> 已取消: 超时/手动取消\n  已支付 --> 处理中: 管理员接单\n  已支付 --> 已退款: 退款通过\n  处理中 --> 已完成: 发货确认\n  已完成 --> [*]\n  已取消 --> [*]\n  已退款 --> [*]",
    "prdRef": "[PRD 3.2.3] 订单状态流转"
  }
}
```

---

## L4 — API 契约

**必填字段**：`endpoint`, `method`, `description`, `request`, `response`, `prdRef`

```json
{
  "l4": {
    "title": "API 契约",
    "content": [
      {"endpoint": "/api/orders", "method": "GET", "description": "获取订单列表（分页+搜索）", "request": "?page=1&size=20&status=待支付&keyword=张三&dateFrom=2025-01-01&dateTo=2025-01-31", "response": "{\"code\":0,\"data\":{\"list\":[...],\"total\":100,\"page\":1,\"size\":20}}", "prdRef": "[PRD 5.1]"},
      {"endpoint": "/api/orders/:id", "method": "GET", "description": "获取订单详情", "request": "路径参数 id", "response": "{\"code\":0,\"data\":{\"orderNo\":\"ORD...\",\"customerName\":\"张三\",\"amount\":199.00,\"status\":\"待支付\",...}}", "prdRef": "[PRD 5.2]"},
      {"endpoint": "/api/orders", "method": "POST", "description": "创建订单", "request": "{\"customerId\":\"c1\",\"items\":[{\"productId\":\"p1\",\"qty\":2}],\"couponCode\":null}", "response": "{\"code\":0,\"data\":{\"orderNo\":\"ORD...\",\"id\":\"o1\"}}", "prdRef": "[PRD 5.3]"},
      {"endpoint": "/api/orders/:id", "method": "PUT", "description": "更新订单", "request": "{\"customerName\":\"张三\",\"amount\":299.00}", "response": "{\"code\":0,\"data\":{\"updatedAt\":\"2025-01-15 10:30:00\"}}", "prdRef": "[PRD 5.4]"},
      {"endpoint": "/api/orders/:id", "method": "DELETE", "description": "删除订单（软删除）", "request": "路径参数 id", "response": "{\"code\":0,\"message\":\"删除成功\"}", "prdRef": "[PRD 5.5]"},
      {"endpoint": "/api/orders/stats", "method": "GET", "description": "订单统计", "request": "?dateFrom=2025-01-01&dateTo=2025-01-31", "response": "{\"code\":0,\"data\":{\"totalOrders\":150,\"totalAmount\":45000.00,\"completionRate\":0.85,\"statusDistribution\":{...}}}", "prdRef": "[PRD 5.6]"}
    ]
  }
}
```

---

## L5 — 性能备注（可选）

```json
{
  "l5": {
    "title": "性能备注",
    "content": [
      {"item": "订单列表分页", "expectedVolume": "≤ 10万条", "strategy": "SQL LIMIT/OFFSET 分页，每页 20 条", "note": "MVP 阶段不做索引优化"},
      {"item": "订单详情", "expectedVolume": "单条", "strategy": "主键查询", "note": "关联查询 ≤ 3 张表"}
    ]
  }
}
```

---

## L6 — 开放问题

**必填**

```json
{
  "l6": {
    "title": "开放问题",
    "content": [
      {"id": "Q-001", "question": "订单超时 30 分钟是否可配置？", "status": "待决策", "prdRef": "[PRD 3.2.4 R007]", "proposedBy": "蓝队"},
      {"id": "Q-002", "question": "退款是否需要审批流？", "status": "待决策", "prdRef": "[PRD 3.5]", "proposedBy": "绿队"}
    ]
  }
}
```

---

## 完整 JSON 数据结构（v2）

每个页面在 `</body>` 前注入以下结构：

```html
<!-- ═══ kf-annotate: 页面注释区块（开始） ═══ -->
<script id="kf-ann-data" type="application/json">
{
  "pageId": "order-list",
  "pageTitle": "订单管理",
  "pageType": "list",
  "layers": {
    "l0": { ... },
    "l0_ops": { ... },
    "l0_search": { ... },
    "l0_deps": { ... },
    "l1": { ... },
    "l1_list": { ... },
    "l1_stats": { ... },
    "l1_perm": { ... },
    "l1_bounds": { ... },
    "l2": { ... },
    "l2_exceptions": { ... },
    "l3": { ... },
    "l4": { ... },
    "l5": { ... },
    "l6": { ... }
  }
}
</script>
<!-- 暗门抽屉渲染脚本 -->
<script src="kf-ann-drawer.js"></script>
<!-- ═══ kf-annotate: 页面注释区块（结束） ═══ -->
```

### 按页面类型的层级要求

| pageType | 必填层级 | 可选层级 |
|----------|---------|---------|
| `list` | l0, l0_ops, l0_search, l1, l2, l4, l6 | l0_deps, l1_list, l1_perm, l1_bounds, l2_exceptions, l3, l5 |
| `form` | l0, l0_ops, l1, l1_bounds, l2, l4, l6 | l0_deps, l1_perm, l2_exceptions, l3, l5 |
| `stats` | l0, l1_stats, l2, l4, l6 | l0_deps, l1_perm, l2_exceptions, l5 |
| `special` | l0, l0_ops, l1, l2, l4, l6 | l0_deps, l1_list, l1_stats, l1_perm, l1_bounds, l2_exceptions, l3, l5 |

---

## L1 字段对象完整属性参考

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field` | string | ✅ | 字段名，与 HTML `name`/`id` 一致 |
| `type` | string | ✅ | 数据类型（String(50)/Decimal(10,2)/Enum/DateTime/File/Boolean） |
| `inputType` | string | ✅ | 前端控件类型（见 inputType 枚举表） |
| `description` | string | ✅ | 字段说明 |
| `rules` | string | ✅ | 校验规则 |
| `example` | string | ✅ | 示例值 |
| `dataSource` | string | ○ | 下拉/多选的数据来源描述 |
| `conditionalDisplay` | object | ○ | `{"dependsOn":"field","condition":"equals/notEmpty/gt/lt","value":...}` |
| `linkageRules` | array | ○ | `[{"when":"...","action":"...","target":"..."}]` |
| `modeDiff` | object | ○ | `{"add":"...","edit":"...","view":"..."}` — 三种模式下的字段行为差异 |
| `appliesTo` | array | ○ | `["search","list","form"]` — 字段在哪些上下文中出现 |
| `prdRef` | string | ✅ | PRD 章节引用 |

---

## PRD 引用格式规范

| 引用类型 | 格式 | 示例 |
|---------|------|------|
| PRD 章节 | `[PRD x.x.x]` | `[PRD 3.2.1]` |
| PRD 规则 | `[PRD x.x.x Rxxx]` | `[PRD 3.2.4 R005]` |
| 状态引用 | `[L3-StateName]` | `[L3-Approved]` |
| 角色引用 | `[@RoleName]` | `[@Admin]` |
| 异常场景 | `[#Error-Scenario]` | `[#Error-DataConflict]` |
| 字段引用 | `[field_name]` | `[customer_id]` |
