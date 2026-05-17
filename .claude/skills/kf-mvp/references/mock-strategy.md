# Mock 策略与签名规范

> kf-mvp 所有第三方服务 MUST 使用 Mock。签名与真实服务完全一致，切换仅需替换 import 路径。

---

## 核心原则

1. **签名一致**：Mock 服务的函数签名（参数名、类型、返回值、异常类型）与真实服务 100% 一致
2. **零依赖**：Mock 不引入任何第三方 SDK 依赖
3. **可切换**：`src/services/index.js` 统一导出，通过环境变量切换 Mock/真实
4. **逼真数据**：返回数据使用真实感的中文姓名、合理金额、时间戳
5. **模拟延迟**：Mock 服务模拟 200-500ms 网络延迟（可选）

---

## 统一导出模式

```javascript
// src/services/index.js
const isMock = process.env.NODE_ENV !== 'production';

module.exports = {
  paymentService: isMock 
    ? require('./payment.mock') 
    : require('./payment.real'),
  smsService: isMock 
    ? require('./sms.mock') 
    : require('./sms.real'),
  storageService: isMock 
    ? require('./storage.mock') 
    : require('./storage.real'),
  pushService: isMock 
    ? require('./push.mock') 
    : require('./push.real'),
};
```

---

## 支付服务 Mock

```javascript
// src/services/payment.mock.js

/**
 * 创建支付订单
 * @param {Object} params
 * @param {string} params.orderId - 订单 ID
 * @param {number} params.amount - 金额（分）
 * @param {string} params.subject - 商品描述
 * @returns {Promise<{payUrl: string, tradeNo: string}>}
 * @throws {PaymentError} 支付失败时抛出
 */
async function createPayment(params) {
  const { orderId, amount, subject } = params;
  
  // 模拟网络延迟
  await delay(300);
  
  // 模拟：金额 ≤ 0 时失败
  if (amount <= 0) {
    throw new PaymentError('INVALID_AMOUNT', '金额必须大于 0');
  }
  
  return {
    payUrl: `https://mock-pay.example.com/pay?orderId=${orderId}&amount=${amount}`,
    tradeNo: `MOCK_TRADE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * 查询支付状态
 * @param {string} tradeNo - 交易号
 * @returns {Promise<{status: 'SUCCESS'|'FAIL'|'PENDING', paidAt: string|null}>}
 */
async function queryPayment(tradeNo) {
  await delay(200);
  return {
    status: 'SUCCESS',
    paidAt: new Date().toISOString(),
  };
}

class PaymentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'PaymentError';
  }
}

module.exports = { createPayment, queryPayment, PaymentError };
```

---

## 短信服务 Mock

```javascript
// src/services/sms.mock.js

/**
 * 发送短信验证码
 * @param {Object} params
 * @param {string} params.phone - 手机号
 * @param {string} params.code - 验证码
 * @returns {Promise<{success: boolean, messageId: string}>}
 * @throws {SmsError} 发送失败时抛出
 */
async function sendSms(params) {
  const { phone, code } = params;
  
  await delay(100);
  
  // 输出到控制台（开发调试用）
  console.log(`[Mock SMS] 发送验证码到 ${phone}: ${code}`);
  
  return {
    success: true,
    messageId: `MOCK_SMS_${Date.now()}`,
  };
}

class SmsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'SmsError';
  }
}

module.exports = { sendSms, SmsError };
```

---

## 存储服务 Mock

```javascript
// src/services/storage.mock.js
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 上传文件
 * @param {Object} params
 * @param {string} params.fileName - 文件名
 * @param {Buffer} params.data - 文件内容
 * @returns {Promise<{url: string, fileId: string}>}
 */
async function uploadFile(params) {
  const { fileName, data } = params;
  const fileId = `MOCK_FILE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const filePath = path.join(UPLOAD_DIR, fileId);
  
  await delay(200);
  fs.writeFileSync(filePath, data);
  
  return {
    url: `http://localhost:3000/uploads/${fileId}`,
    fileId,
  };
}

/**
 * 获取文件访问 URL
 * @param {string} fileId - 文件 ID
 * @returns {Promise<string>} 文件 URL
 */
async function getFileUrl(fileId) {
  return `http://localhost:3000/uploads/${fileId}`;
}

module.exports = { uploadFile, getFileUrl };
```

---

## 推送服务 Mock

```javascript
// src/services/push.mock.js
const fs = require('fs');
const path = require('path');

const PUSH_LOG = path.join(__dirname, '../../mock-push-log.json');

/**
 * 发送推送通知
 * @param {Object} params
 * @param {string[]} params.userIds - 目标用户 ID 列表
 * @param {string} params.title - 推送标题
 * @param {string} params.body - 推送内容
 * @returns {Promise<{success: number, failed: number}>}
 */
async function sendPush(params) {
  const { userIds, title, body } = params;
  
  await delay(100);
  
  // 记录推送日志
  const log = {
    timestamp: new Date().toISOString(),
    userIds,
    title,
    body,
  };
  
  let logs = [];
  if (fs.existsSync(PUSH_LOG)) {
    logs = JSON.parse(fs.readFileSync(PUSH_LOG, 'utf-8'));
  }
  logs.push(log);
  fs.writeFileSync(PUSH_LOG, JSON.stringify(logs, null, 2));
  
  console.log(`[Mock Push] 推送给 ${userIds.length} 个用户: ${title}`);
  
  return {
    success: userIds.length,
    failed: 0,
  };
}

module.exports = { sendPush };
```

---

## Mock 数据种子

```javascript
// server/seed.js
const db = require('./db');

function seed() {
  const now = new Date();
  
  // 示例：用户种子数据
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, phone, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  insertUser.run('u1', '张三', '13800138001', 'admin', now.toISOString());
  insertUser.run('u2', '李四', '13800138002', 'user', now.toISOString());
  insertUser.run('u3', '王五', '13800138003', 'user', new Date(now - 86400000).toISOString());
  
  console.log('[Seed] Mock 种子数据已插入');
}

module.exports = { seed };
```

---

## 延迟模拟工具

```javascript
// src/services/_delay.js
function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { delay };
```

---

## 真实服务切换指南

当需要接入真实第三方服务时：

1. 创建 `src/services/{service}.real.js`，保持与 mock 完全相同的函数签名
2. 修改 `src/services/index.js` 的 `isMock` 判断逻辑
3. 业务代码零改动

```javascript
// 示例：真实支付服务骨架
// src/services/payment.real.js

const AlipaySDK = require('alipay-sdk');  // 真实 SDK

async function createPayment(params) {
  const { orderId, amount, subject } = params;  // 签名一致
  // 真实支付逻辑...
  return { payUrl: '...', tradeNo: '...' };      // 返回值一致
}

class PaymentError extends Error {
  constructor(code, message) {                    // 异常类型一致
    super(message);
    this.code = code;
    this.name = 'PaymentError';
  }
}

module.exports = { createPayment, queryPayment, PaymentError };
```
