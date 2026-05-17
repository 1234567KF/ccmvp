#!/usr/bin/env node
/**
 * annotate-generator.mjs — 注释生成器（Phase 6 工具）
 *
 * 根据 PRD/Spec 和模板定义，为 HTML 页面生成结构化注释 JSON 数据块，
 * 并将其注入到页面的 </body> 之前。替代旧的 data-ann-* 属性注入方案。
 *
 * 用法:
 *   # 为页面生成并注入注释 JSON
 *   node {IDE_ROOT}/helpers/annotate-generator.mjs \
 *     --page public/index.html \
 *     --prd docs/prd.md \
 *     --spec docs/spec.md \
 *     --template {IDE_ROOT}/skills/kf-annotate/references/annotation-templates.md \
 *     --output public/index.html \
 *     --mode inject
 *
 *   # 仅生成 JSON（不注入页面）
 *   node {IDE_ROOT}/helpers/annotate-generator.mjs \
 *     --page public/index.html \
 *     --prd docs/prd.md \
 *     --spec docs/spec.md \
 *     --output annotations.json \
 *     --mode generate
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

const CWD = process.env.CLAUDE_PROJECT_DIR || process.env.QODER_PROJECT_DIR || process.cwd();

// ─── 参数解析 ──────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: 'inject' };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--page':     opts.page = args[++i]; break;
      case '--prd':      opts.prd = args[++i]; break;
      case '--spec':     opts.spec = args[++i]; break;
      case '--template': opts.template = args[++i]; break;
      case '--output':   opts.output = args[++i]; break;
      case '--mode':     opts.mode = args[++i]; break;
      case '--help':
        console.log('Usage: annotate-generator.mjs --page <html-file> --prd <prd-md> --spec <spec-md> [--template <templates-md>] --output <out> [--mode inject|generate]');
        process.exit(0);
    }
  }
  return opts;
}

// ─── 文件读取 ──────────────────────────────────────────────────────────
function resolvePath(p) {
  if (!p) return null;
  return resolve(CWD, p);
}

function safeRead(filePath, label) {
  const full = resolvePath(filePath);
  if (!full || !existsSync(full)) {
    console.warn(`[!] ${label} 文件不存在: ${full}`);
    return '';
  }
  return readFileSync(full, 'utf-8');
}

// ─── PRD 内容提取 ─────────────────────────────────────────────────────
function extractPrdSections(prdContent) {
  const sections = {};
  // 提取所有章节标题和内容
  const headingRe = /^#{1,3}\s+([^\n]+)/gm;
  let match;
  const headings = [];
  while ((match = headingRe.exec(prdContent)) !== null) {
    headings.push({ title: match[1].trim(), pos: match.index });
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].pos;
    const end = i + 1 < headings.length ? headings[i + 1].pos : prdContent.length;
    sections[headings[i].title] = prdContent.slice(start, end).trim();
  }
  return sections;
}

// ─── Spec 内容提取 ─────────────────────────────────────────────────────
function extractSpecEntities(specContent) {
  const entities = {};
  // 尝试提取接口定义、数据模型、字段定义
  const headingRe = /^#{1,3}\s+([^\n]+)/gm;
  let match;
  const headings = [];
  while ((match = headingRe.exec(specContent)) !== null) {
    headings.push({ title: match[1].trim(), pos: match.index });
  }
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].pos;
    const end = i + 1 < headings.length ? headings[i + 1].pos : specContent.length;
    entities[headings[i].title] = specContent.slice(start, end).trim();
  }
  return entities;
}

// ─── 页面分析 ──────────────────────────────────────────────────────────
function analyzePage(html) {
  const info = {
    title: '',
    fields: [],
    buttons: [],
    tables: [],
    forms: [],
    links: []
  };

  // 提取 title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) info.title = titleMatch[1].trim();
  if (!info.title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) info.title = h1Match[1].trim();
  }

  // 提取表单字段 (input, select, textarea)
  const fieldRe = /<(?:input|select|textarea)\b[^>]*>/gi;
  let fm;
  while ((fm = fieldRe.exec(html)) !== null) {
    const tag = fm[0];
    const nameMatch = tag.match(/name=["']([^"']+)["']/i);
    const idMatch = tag.match(/id=["']([^"']+)["']/i);
    const typeMatch = tag.match(/type=["']([^"']+)["']/i);
    const placeholderMatch = tag.match(/placeholder=["']([^"']+)["']/i);
    info.fields.push({
      name: nameMatch ? nameMatch[1] : (idMatch ? idMatch[1] : null),
      type: typeMatch ? typeMatch[1] : 'text',
      placeholder: placeholderMatch ? placeholderMatch[1] : '',
      tag: tag.slice(1, tag.indexOf(' ') > 0 ? tag.indexOf(' ') : tag.indexOf('>'))
    });
  }

  // 提取 button
  const btnRe = /<button[^>]*>([^<]*)<\/button>/gi;
  while ((fm = btnRe.exec(html)) !== null) {
    info.buttons.push(fm[1].trim());
  }

  // 提取 a 标签
  const aRe = /<a[^>]*>([^<]*)<\/a>/gi;
  while ((fm = aRe.exec(html)) !== null) {
    const text = fm[1].trim();
    if (text) info.links.push(text);
  }

  // 提取 table th
  const thRe = /<th[^>]*>([^<]*)<\/th>/gi;
  while ((fm = thRe.exec(html)) !== null) {
    info.tables.push(fm[1].trim());
  }

  return info;
}

// ─── 生成注释 JSON ────────────────────────────────────────────────────
function generateAnnotationData(pageInfo, pageId, prdSections, specEntities) {
  // 查找相关 PRD 章节
  const prdRefs = [];
  for (const [title] of Object.entries(prdSections)) {
    prdRefs.push(title);
  }
  const mainPrdRef = prdRefs.length > 0 ? `[PRD ${prdRefs[0]}]` : '[PRD 待补充]';

  const annotation = {
    pageId: pageId || pageInfo.title.replace(/\s+/g, '-').toLowerCase() || 'untitled',
    pageTitle: pageInfo.title || '未命名页面',
    pageType: 'list',
    layers: {}
  };

  // ── L0: 页面概览 ──
  const moduleName = pageInfo.title ? pageInfo.title.replace(/管理|列表|详情/g, '').trim() : '';
  annotation.layers.l0 = {
    title: '页面概览',
    content: [
      { key: '页面名称', value: pageInfo.title || '未命名页面' },
      { key: '所属模块', value: moduleName ? `${moduleName}管理` : '待确认' },
      { key: '页面类型', value: 'list' },
      { key: '业务说明', value: `${pageInfo.title || '本页面'}的功能描述` },
      { key: '目标用户', value: '管理员、运营人员' },
      { key: 'PRD 来源', value: mainPrdRef }
    ]
  };

  // ── L0.ops: 操作定义 ──
  const ops = [];
  for (const btn of pageInfo.buttons) {
    if (btn && btn !== '提交' && btn !== '取消' && btn !== '确定') {
      ops.push({
        name: btn,
        description: `${btn}操作`,
        roles: ['@Admin'],
        prdRef: mainPrdRef
      });
    }
  }
  annotation.layers.l0_ops = {
    title: '操作定义',
    content: ops.length > 0 ? ops : [{ name: '页面操作', description: '该页面的主要操作', roles: ['@Admin'], prdRef: mainPrdRef }]
  };

  // ── L1: 字段说明 ──
  const l1Fields = [];
  // 根据 HTML 标签类型推断 inputType
  function inferInputType(field) {
    var t = field.tag;
    if (t === 'select') return 'select';
    if (t === 'textarea') return 'textarea';
    var ft = field.type;
    if (ft === 'number') return 'number';
    if (ft === 'date') return 'date';
    if (ft === 'datetime' || ft === 'datetime-local') return 'datetime';
    if (ft === 'checkbox') return 'checkbox';
    if (ft === 'radio') return 'radio';
    if (ft === 'file') return 'file';
    if (ft === 'range') return 'numberRange';
    return 'text';
  }
  for (const field of pageInfo.fields) {
    if (field.name) {
      var it = inferInputType(field);
      l1Fields.push({
        field: field.name,
        type: field.type === 'number' ? 'Number' : field.type === 'date' ? 'Date' : 'String',
        inputType: it,
        description: field.placeholder || field.name,
        rules: '必填',
        example: field.type === 'number' ? '100' : field.type === 'date' ? '2025-01-01' : '示例值',
        appliesTo: ['form'],
        modeDiff: { add: '可见+可编辑', edit: '可见+可编辑', view: '可见+只读' },
        prdRef: mainPrdRef
      });
    }
  }
  for (const col of pageInfo.tables) {
    if (col && !l1Fields.find(f => f.field === col)) {
      l1Fields.push({
        field: col,
        type: 'String',
        inputType: 'text',
        description: `${col}列`,
        rules: '-',
        example: '示例值',
        appliesTo: ['list'],
        modeDiff: { view: '可见+只读' },
        prdRef: mainPrdRef
      });
    }
  }
  annotation.layers.l1 = {
    title: '字段说明',
    content: l1Fields
  };

  // ── L1.list: 列表展示配置 ──
  if (pageInfo.tables.length > 0) {
    var listCols = [];
    for (const col of pageInfo.tables) {
      if (col) {
        listCols.push({ field: col, width: 'auto', sortable: false });
      }
    }
    if (listCols.length > 0) {
      annotation.layers.l1_list = { title: '列表展示配置', content: listCols };
    }
  }

  // ── L0.search: 搜索字段（列表型页面）──
  var searchFields = [];
  for (const field of pageInfo.fields) {
    if (field.name && (field.type === 'text' || field.name.toLowerCase().includes('search') || field.name.toLowerCase().includes('keyword'))) {
      searchFields.push({
        field: field.name,
        inputType: inferInputType(field),
        description: field.placeholder || field.name + '搜索'
      });
    }
  }
  if (searchFields.length > 0) {
    annotation.layers.l0_search = { title: '搜索条件', content: searchFields };
  }

  // ── L1.bounds: 边界值 ──
  annotation.layers.l1_bounds = {
    title: '边界值约束',
    content: pageInfo.fields.filter(f => f.name).map(f => ({
      field: f.name,
      min: f.type === 'number' ? '0' : '',
      max: f.type === 'number' ? '99999999' : '',
      minLen: f.type === 'text' ? 1 : undefined,
      maxLen: f.type === 'text' ? 255 : undefined,
      maxInputLen: f.type === 'text' ? 255 : (f.type === 'number' ? 12 : undefined),
      pattern: ''
    })).filter(b => b.min || b.max || b.minLen)
  };

  // ── L2: 业务规则 ──
  annotation.layers.l2 = {
    title: '业务规则',
    content: [
      {
        ruleId: 'BR-001',
        name: '表单提交校验',
        condition: '提交表单时',
        logic: '必填字段非空校验，格式校验',
        scope: '所有字段',
        prdRef: mainPrdRef
      }
    ]
  };

  // ── L2.exceptions: 异常处理与边界值（测试视角）──
  annotation.layers.l2_exceptions = {
    title: '异常处理与边界值',
    content: [
      {
        scenario: '网络请求失败',
        trigger: 'API 调用超时或网络断开',
        recovery: '前端提示「网络异常，请重试」，保留已填写表单数据',
        prdRef: mainPrdRef
      },
      {
        scenario: '数据校验失败',
        trigger: '后端返回校验错误',
        recovery: '前端在对应字段下方显示错误提示',
        prdRef: mainPrdRef
      }
    ]
  };

  // ── L3: 状态机（页面级，非实体级 — 占位）──
  var entityName = moduleName || '实体';
  annotation.layers.l3 = {
    title: '状态机',
    entity: entityName,
    states: ['待处理', '处理中', '已完成'],
    transitions: [],
    mermaid: 'stateDiagram-v2\n  [*] --> 待处理\n  待处理 --> 处理中\n  处理中 --> 已完成\n  已完成 --> [*]',
    prdRef: mainPrdRef
  };

  // ── L4: API 契约 ──
  annotation.layers.l4 = {
    title: 'API 契约',
    content: [
      {
        endpoint: `/api/${(moduleName || 'resource').toLowerCase()}`,
        method: 'GET',
        description: `获取${moduleName || '资源'}列表`,
        request: '?page=1&size=20',
        response: '{"code":0,"data":{"list":[...],"total":0,"page":1}}',
        prdRef: mainPrdRef
      }
    ]
  };

  // ── L6: 开放问题 ──
  annotation.layers.l6 = {
    title: '开放问题',
    content: [
      {
        id: 'Q-001',
        question: `${pageInfo.title || '页面'}的业务规则是否完整？`,
        status: '待确认',
        prdRef: mainPrdRef,
        proposedBy: '系统'
      }
    ]
  };

  return annotation;
}

// ─── 注入 JSON 数据块到 HTML ──────────────────────────────────────────
function injectAnnotationData(html, annotationData, annotationPath) {
  // 检查是否已经注入过
  if (html.includes('id="kf-ann-data"')) {
    console.log('[i] 页面已包含注释数据，将替换现有数据块');
    // 移除现有的注释区块
    html = html.replace(
      /<!--\s*═══\s*kf-annotate:\s*页面注释区块（开始）\s*═══\s*-->[\s\S]*?<!--\s*═══\s*kf-annotate:\s*页面注释区块（结束）\s*═══\s*-->/,
      ''
    );
  }

  const jsonStr = JSON.stringify(annotationData, null, 2);

  const annotationBlock = `
<!-- ═══ kf-annotate: 页面注释区块（开始） ═══ -->

<!-- 暗门注释数据（结构化 JSON，供抽屉渲染） -->
<script id="kf-ann-data" type="application/json">
${jsonStr}
</script>

<!-- 暗门抽屉渲染脚本（从 JSON 数据渲染表格/列表/状态机） -->
<script>
(function(){
var D=document,E=D.documentElement,B=D.body,drawer=null,btn=null,currentTab=null,annData=null;

// 读取注释 JSON 数据
try{
  var dataEl=D.getElementById('kf-ann-data');
  if(dataEl){annData=JSON.parse(dataEl.textContent);}
}catch(e){console.error('kf-annotate: JSON 解析失败',e);return;}

// 创建底部按钮
btn=D.createElement('button');
btn.id='kf-ann-btn';
btn.textContent='\\u{1F4CD} \\u6697\\u95E8';
btn.style.cssText='position:fixed;bottom:16px;right:16px;z-index:99998;background:#1890ff;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:sans-serif;border:none;line-height:1.5';
B.appendChild(btn);

// 抽屉 HTML
drawer=D.createElement('div');
drawer.id='kf-ann-drawer';
drawer.style.cssText='position:fixed;top:0;right:0;width:420px;height:100vh;z-index:99999;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .25s ease;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#333';

// 生成标签页
var tabs=[];
if(annData&&annData.layers){
  var layerKeys=Object.keys(annData.layers);
  var tabMap={l0:'L0 概览',l0_ops:'L0.ops 操作',l0_deps:'L0.deps 关联',l1:'L1 字段',l1_perm:'L1.perm 权限',l1_bounds:'L1.bounds 边界',l2:'L2 规则',l2_exceptions:'L2 异常',l3:'L3 状态',l4:'L4 API',l5:'L5 性能',l6:'L6 问题'};
  tabs=layerKeys.map(function(k){return {key:k,label:tabMap[k]||k};});
}

var tabsHtml=tabs.map(function(t,i){return '<span class="ann-tab'+(i===0?' active':'')+'" data-tab="'+t.key+'">'+t.label+'</span>';}).join('');

drawer.innerHTML='<div class="ann-resize" style="position:absolute;top:0;left:-4px;width:8px;height:100%;cursor:col-resize;z-index:1"></div>'
  +'<div class="ann-header" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e8e8e8;flex-shrink:0">'
  +'<h3 style="margin:0;font-size:15px;font-weight:600">\\u6697\\u95E8\\u6CE8\\u91CA</h3>'
  +'<button id="kf-ann-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#999;padding:0 4px;line-height:1">&times;</button></div>'
  +'<div class="ann-tabs" style="display:flex;border-bottom:1px solid #e8e8e8;overflow-x:auto;flex-shrink:0;background:#fafafa">'+tabsHtml+'</div>'
  +'<div class="ann-body" style="flex:1;overflow-y:auto;padding:12px 16px"></div>';

B.appendChild(drawer);

// 渲染函数
function renderPanel(tabKey){
  var layer=annData&&annData.layers?annData.layers[tabKey]:null;
  var body=drawer.querySelector('.ann-body');
  if(!layer){body.innerHTML='<p style="color:#bbb;font-style:italic">\\u672C\\u5C42\\u65E0\\u6CE8\\u91CA\\u6570\\u636E</p>';return;}

  var html='<h4 style="margin:0 0 12px;font-size:14px">'+layer.title+'</h4>';
  html+='<div style="font-size:12px">';

  // L3 状态机特殊渲染
  if(tabKey==='l3'&&layer.states){
    html+='<p><strong>\\u5B9E\\u4F53:</strong> '+layer.entity+'</p>';
    html+='<p><strong>\\u72B6\\u6001\\u5217\\u8868:</strong> '+layer.states.join(' → ')+'</p>';
    if(layer.transitions&&layer.transitions.length>0){
      html+='<table style="width:100%;border-collapse:collapse;margin-top:8px"><tr style="background:#f5f5f5"><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u4ECE</th><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u5230</th><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u4E8B\\u4EF6</th><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u89D2\\u8272</th></tr>';
      layer.transitions.forEach(function(t){
        html+='<tr><td style="padding:4px 6px;border:1px solid #e8e8e8">'+t.from+'</td><td style="padding:4px 6px;border:1px solid #e8e8e8">'+t.to+'</td><td style="padding:4px 6px;border:1px solid #e8e8e8">'+t.event+'</td><td style="padding:4px 6px;border:1px solid #e8e8e8">'+(t.roles||[]).join(', ')+'</td></tr>';
      });
      html+='</table>';
    }
    if(layer.prdRef){html+='<p style="color:#999;margin-top:8px">'+layer.prdRef+'</p>';}
  }
  // kv 对类型（l0, l1 等）
  else if(layer.content&&layer.content.length>0&&layer.content[0].key){
    html+='<table style="width:100%;border-collapse:collapse">';
    html+='<tr style="background:#f5f5f5"><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u9879\\u76EE</th><th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">\\u5185\\u5BB9</th></tr>';
    layer.content.forEach(function(row){
      var val=row.value||'';
      if(row.prdRef){val+=' <span style="color:#999">'+row.prdRef+'</span>';}
      html+='<tr><td style="padding:4px 6px;border:1px solid #e8e8e8;font-weight:500">'+row.key+'</td><td style="padding:4px 6px;border:1px solid #e8e8e8">'+val+'</td></tr>';
    });
    html+='</table>';
  }
  // 规则/字段类型
  else if(layer.content&&layer.content.length>0){
    var keys=Object.keys(layer.content[0]);
    html+='<table style="width:100%;border-collapse:collapse">';
    html+='<tr style="background:#f5f5f5">'+keys.map(function(k){return '<th style="padding:4px 6px;border:1px solid #e8e8e8;text-align:left">'+k+'</th>';}).join('')+'</tr>';
    layer.content.forEach(function(row){
      html+='<tr>'+keys.map(function(k){
        var v=row[k];
        if(v===undefined||v===null)v='-';
        if(Array.isArray(v))v=v.join(', ');
        if(k==='prdRef'&&v){v='<span style="color:#999">'+v+'</span>';}
        return '<td style="padding:4px 6px;border:1px solid #e8e8e8;vertical-align:top">'+v+'</td>';
      }).join('')+'</tr>';
    });
    html+='</table>';
  }
  html+='</div>';
  body.innerHTML=html;
}

// 标签切换
drawer.querySelectorAll('.ann-tab').forEach(function(tab){
  tab.onclick=function(){
    drawer.querySelectorAll('.ann-tab').forEach(function(t){t.classList.remove('active');t.style.cssText='padding:6px 10px;cursor:pointer;font-size:12px;color:#666;border-bottom:2px solid transparent;white-space:nowrap;user-select:none';});
    tab.classList.add('active');
    tab.style.cssText='padding:6px 10px;cursor:pointer;font-size:12px;color:#1890ff;border-bottom:2px solid #1890ff;white-space:nowrap;user-select:none;font-weight:500';
    currentTab=tab.getAttribute('data-tab');
    renderPanel(currentTab);
  };
});

// 切换抽屉
function toggleDrawer(){
  var open=drawer.classList.toggle('open');
  if(open){
    drawer.style.transform='translateX(0)';
    btn.textContent='\\u2716 \\u5173\\u95ED\\u6697\\u95E8';
    btn.style.background='#ff4d4f';
  }else{
    drawer.style.transform='translateX(100%)';
    btn.textContent='\\u{1F4CD} \\u6697\\u95E8';
    btn.style.background='#1890ff';
  }
}

// 抽屉 CSS class toggle 用 style 替代
drawer.classList.toggle=function(cls){
  if(cls==='open'){
    this._open=!this._open;
    return this._open;
  }
  return false;
};
drawer.classList.contains=function(cls){
  return cls==='open'?!!this._open:false;
};

// 按钮事件
btn.onclick=toggleDrawer;
D.getElementById('kf-ann-close').onclick=toggleDrawer;

// 键盘快捷键
D.addEventListener('keydown',function(e){
  if(e.ctrlKey&&e.key==='m'){e.preventDefault();toggleDrawer();}
  if(e.key==='Escape'&&drawer._open){toggleDrawer();}
});

// 拖拽调整宽度
var rx=drawer.querySelector('.ann-resize');
if(rx){
  rx.onmousedown=function(e){
    e.preventDefault();
    var sx=e.clientX,sw=drawer.offsetWidth;
    function mm(ev){var w=sw-(ev.clientX-sx);if(w<280)w=280;if(w>800)w=800;drawer.style.width=w+'px';}
    function mu(){D.removeEventListener('mousemove',mm);D.removeEventListener('mouseup',mu);}
    D.addEventListener('mousemove',mm);D.addEventListener('mouseup',mu);
  };
}

// 初始加载第一个标签
if(tabs.length>0){renderPanel(tabs[0].key);}
})();
</script>
<!-- ═══ kf-annotate: 页面注释区块（结束） ═══ -->`;

  // 在 </body> 前插入
  if (html.includes('</body>')) {
    html = html.replace('</body>', annotationBlock + '\n</body>');
  } else if (html.includes('</html>')) {
    html = html.replace('</html>', annotationBlock + '\n</html>');
  } else {
    html += '\n' + annotationBlock;
  }

  return html;
}

// ─── 主流程 ────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();

  if (!opts.page) {
    console.error('[x] 缺少 --page 参数');
    process.exit(1);
  }

  console.log('=== annotate-generator.mjs ===\n');

  // 1. 读取输入文件
  console.log(`[i] 读取页面: ${opts.page}`);
  const pageHtml = safeRead(opts.page, '页面');
  if (!pageHtml) {
    console.error('[x] 无法读取页面文件');
    process.exit(1);
  }

  const prdContent = opts.prd ? safeRead(opts.prd, 'PRD') : '';
  const specContent = opts.spec ? safeRead(opts.spec, 'Spec') : '';

  // 2. 分析页面结构
  const pageInfo = analyzePage(pageHtml);
  console.log(`[i] 页面标题: ${pageInfo.title || '(未检测到)'}`);
  console.log(`[i] 检测到 ${pageInfo.fields.length} 个字段, ${pageInfo.buttons.length} 个按钮, ${pageInfo.tables.length} 个表格列`);

  // 3. 提取 PRD/Spec 章节
  const prdSections = prdContent ? extractPrdSections(prdContent) : {};
  const specEntities = specContent ? extractSpecEntities(specContent) : {};
  console.log(`[i] PRD 章节: ${Object.keys(prdSections).length} 个`);
  console.log(`[i] Spec 实体: ${Object.keys(specEntities).length} 个`);

  // 4. 生成注释 JSON
  const pageId = basename(opts.page).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const annotationData = generateAnnotationData(pageInfo, pageId, prdSections, specEntities);
  const layerCount = Object.keys(annotationData.layers).length;
  console.log(`[i] 生成注释层级: ${layerCount} 层`);

  // 5. 输出
  if (opts.mode === 'generate') {
    // 仅输出 JSON
    const outPath = resolvePath(opts.output || 'annotations.json');
    writeFileSync(outPath, JSON.stringify(annotationData, null, 2), 'utf-8');
    console.log(`[v] JSON 注释数据已写入: ${outPath}`);
  } else {
    // inject 模式：注入到 HTML
    const resultHtml = injectAnnotationData(pageHtml, annotationData, opts.page);
    const outPath = resolvePath(opts.output || opts.page);
    writeFileSync(outPath, resultHtml, 'utf-8');
    console.log(`[v] 注释已注入页面: ${outPath}`);
  }

  console.log('\n=== 生成完成 ===');
  process.exit(0);
}

main();
