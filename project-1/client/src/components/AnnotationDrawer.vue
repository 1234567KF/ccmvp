<template>
  <a-drawer
    :open="drawerOpen"
    title="📋 暗门注释面板"
    placement="right"
    width="460"
    @close="closeDrawer"
  >
    <template #extra>
      <a-tag color="blue">Ctrl+M</a-tag>
    </template>

    <!-- No annotations -->
    <div v-if="!currentAnnotation" style="color: #999; text-align: center; padding: 40px 0;">
      当前页面暂无注释
    </div>

    <template v-else>
      <!-- Tabs -->
      <a-tabs v-model:activeKey="activeTab" type="card" size="small">
        <a-tab-pane key="biz" tab="业务说明" />
        <a-tab-pane key="fields" tab="数据字段" :disabled="!currentAnnotation.fields" />
        <a-tab-pane key="state" tab="状态流转" :disabled="!currentAnnotation.state" />
        <a-tab-pane key="errors" tab="异常处理" :disabled="!currentAnnotation.errors" />
        <a-tab-pane key="apis" tab="API 契约" :disabled="!currentAnnotation.apis" />
      </a-tabs>

      <!-- Tab: 业务说明 -->
      <div v-if="activeTab === 'biz'" class="tab-content">
        <h3>{{ currentAnnotation.biz.title }}</h3>
        <p class="desc-text">{{ currentAnnotation.biz.description }}</p>

        <div v-if="currentAnnotation.biz.flowDescription" class="flow-section">
          <h4>业务流向</h4>
          <div class="flow-diagram">
            <svg width="100%" height="40" viewBox="0 0 400 40">
              <template v-for="(step, i) in flowSteps" :key="i">
                <rect :x="step.x" y="10" width="80" height="20" rx="10" fill="#e6f4ff" stroke="#1677ff" stroke-width="1" />
                <text :x="step.x + 40" y="23" text-anchor="middle" font-size="10" fill="#1677ff">{{ step.label }}</text>
                <line v-if="i < flowSteps.length - 1" :x1="step.x + 80" y1="20" :x2="step.x + 110" y2="20" stroke="#bbb" stroke-width="1.5" marker-end="url(#arrow)" />
              </template>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#bbb" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>

        <div v-if="currentAnnotation.biz.actions?.length" class="actions-section">
          <h4>操作按钮</h4>
          <div v-for="act in currentAnnotation.biz.actions" :key="act.name" class="action-item">
            <span class="action-btn-badge">{{ act.label }}</span>
            <span class="action-cond" v-if="act.condition">条件: {{ act.condition }}</span>
            <p class="action-desc">{{ act.description }}</p>
          </div>
        </div>
      </div>

      <!-- Tab: 数据字段 -->
      <div v-if="activeTab === 'fields'" class="tab-content">
        <template v-if="currentAnnotation.fields?.query?.length">
          <h4>查询字段</h4>
          <table class="field-table">
            <thead><tr><th>字段</th><th>类型</th><th>来源</th><th>校验</th></tr></thead>
            <tbody>
              <tr v-for="f in currentAnnotation.fields.query" :key="f.name">
                <td><code>{{ f.name }}</code></td>
                <td>{{ f.type }}</td>
                <td>{{ f.source }}</td>
                <td>{{ f.validation || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-if="currentAnnotation.fields?.list?.length">
          <h4 style="margin-top:16px">列表字段</h4>
          <table class="field-table">
            <thead><tr><th>字段</th><th>类型</th><th>来源</th></tr></thead>
            <tbody>
              <tr v-for="f in currentAnnotation.fields.list" :key="f.name">
                <td><code>{{ f.name }}</code></td>
                <td>{{ f.type }}</td>
                <td>{{ f.source }}</td>
              </tr>
            </tbody>
          </table>
        </template>

        <template v-if="currentAnnotation.fields?.form?.length">
          <h4 style="margin-top:16px">表单字段</h4>
          <table class="field-table">
            <thead><tr><th>字段</th><th>类型</th><th>必填</th><th>校验规则</th></tr></thead>
            <tbody>
              <tr v-for="f in currentAnnotation.fields.form" :key="f.name">
                <td><code>{{ f.name }}</code></td>
                <td>{{ f.type }}</td>
                <td>{{ f.required ? '✅' : '-' }}</td>
                <td>{{ f.validation || '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="currentAnnotation.fields.formNotes" class="note-text">{{ currentAnnotation.fields.formNotes }}</p>
        </template>
      </div>

      <!-- Tab: 状态流转 -->
      <div v-if="activeTab === 'state'" class="tab-content">
        <MermaidStateDiagram v-if="stateMachine" :machine="stateMachine" />

        <h4 style="margin:16px 0 8px">状态转移表</h4>
        <table class="field-table">
          <thead><tr><th>#</th><th>源状态</th><th>→</th><th>目标状态</th><th>触发条件</th></tr></thead>
          <tbody>
            <tr v-for="(tr, i) in stateMachine?.transitions" :key="i">
              <td><span class="step-badge">{{ i + 1 }}</span></td>
              <td><code>{{ tr.from }}</code></td><td>→</td>
              <td><code>{{ tr.to }}</code></td>
              <td>{{ tr.trigger }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab: 异常处理 -->
      <div v-if="activeTab === 'errors'" class="tab-content">
        <div v-for="err in currentAnnotation.errors" :key="err.code" class="error-card">
          <div class="error-header">
            <span class="error-code">{{ err.code }}</span>
            <strong>{{ err.scenario }}</strong>
          </div>
          <table class="error-detail">
            <tr><td class="err-label">触发条件</td><td>{{ err.trigger }}</td></tr>
            <tr><td class="err-label">处理方案</td><td>{{ err.handling }}</td></tr>
            <tr><td class="err-label">用户提示</td><td class="err-message">{{ err.userMessage }}</td></tr>
          </table>
        </div>
      </div>

      <!-- Tab: API 契约 -->
      <div v-if="activeTab === 'apis'" class="tab-content">
        <table class="field-table">
          <thead><tr><th>方法</th><th>路径</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="api in currentAnnotation.apis" :key="api.path">
              <td><a-tag :color="api.method === 'GET' ? 'green' : api.method === 'POST' ? 'blue' : 'orange'">{{ api.method }}</a-tag></td>
              <td><code>{{ api.path }}</code></td>
              <td>{{ api.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="ann-footer" v-if="currentAnnotation?.biz">
      <a-divider />
      <a-space>
        <a-button size="small" @click="showGlobalState">全局状态机</a-button>
        <a-button size="small" href="/prototypes/annotations/dashboard.html" target="_blank">宣讲看板</a-button>
      </a-space>
    </div>
  </a-drawer>

  <!-- Global state machine sub-drawer -->
  <a-drawer
    :open="showGlobalStateDrawer"
    title="📊 全局状态机"
    placement="right"
    width="460"
    @close="showGlobalStateDrawer = false"
  >
    <MermaidStateDiagram v-if="globalSM" :machine="globalSM" />

    <div>
      <h4 style="margin:16px 0 8px">状态转移表</h4>
      <table class="field-table">
        <thead><tr><th>#</th><th>源状态</th><th>→</th><th>目标状态</th><th>触发条件</th></tr></thead>
        <tbody>
          <tr v-for="(tr, i) in globalSM.transitions" :key="i">
            <td><span class="step-badge">{{ i + 1 }}</span></td>
            <td><code>{{ tr.from }}</code></td><td>→</td>
            <td><code>{{ tr.to }}</code></td>
            <td>{{ tr.trigger }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAnnotation } from '../composables/useAnnotation';
import { annotationData } from '../annotations/definitions';
import type { TabKey } from '../composables/useAnnotation';
import MermaidStateDiagram from './MermaidStateDiagram.vue';

const {
  drawerOpen, activeTab, currentAnnotation, showSharedState,
  closeDrawer, openDrawer, setTab,
} = useAnnotation();

const showGlobalStateDrawer = ref(false);
const globalSM = computed(() => annotationData._shared?.state || null);
const stateMachine = computed(() => currentAnnotation.value?.state);

// Flow steps parsing
const flowSteps = computed(() => {
  const flow = currentAnnotation.value?.biz.flowDescription;
  if (!flow) return [];
  return flow.split('→').map((s, i) => ({
    label: s.trim().slice(0, 8),
    x: i * 110 + 10,
  }));
});

function showGlobalState() {
  showGlobalStateDrawer.value = true;
}

// Re-export
defineExpose({ openDrawer, setTab });

</script>

<style scoped>
.tab-content { padding: 4px 0; }
.desc-text { color: #555; font-size: 14px; line-height: 1.7; margin-bottom: 16px; }

h3 { font-size: 18px; margin-bottom: 8px; }
h4 { font-size: 14px; color: #333; margin: 0 0 8px; }

/* Flow diagram */
.flow-section { margin-bottom: 20px; }
.flow-diagram { background: #fafafa; border-radius: 8px; padding: 12px; }

/* Actions */
.actions-section { margin-bottom: 16px; }
.action-item { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
.action-btn-badge { display: inline-block; background: #e6f4ff; color: #1677ff; padding: 2px 8px; border-radius: 4px; font-size: 13px; font-weight: 500; margin-right: 8px; }
.action-cond { font-size: 12px; color: #fa8c16; }
.action-desc { font-size: 13px; color: #666; margin-top: 4px; }

/* Field table */
.field-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.field-table th { background: #fafafa; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e8e8e8; }
.field-table td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
.field-table code { font-size: 11px; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; word-break: break-all; }
.note-text { font-size: 12px; color: #999; padding: 8px; background: #fffbe6; border-radius: 4px; }

/* Error cards */
.error-card { border: 1px solid #ffe7ba; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #fffbe6; }
.error-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.error-code { display: inline-block; padding: 1px 6px; border-radius: 3px; background: #fff1f0; color: #ff4d4f; font-size: 11px; font-weight: 600; }
.error-detail { width: 100%; font-size: 13px; }
.error-detail td { padding: 4px 0; vertical-align: top; }
.err-label { width: 80px; color: #999; font-size: 12px; white-space: nowrap; }
.err-message { color: #ff4d4f; }
.note-text { font-size: 12px; color: #999; margin-top: 8px; }

/* State machine */
.state-visual { background: #fafafa; border-radius: 8px; padding: 12px; overflow-x: auto; }

/* Footer */
.ann-footer { margin-top: 16px; }

/* Step badge in tables */
.step-badge { display: inline-block; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: #1677ff; color: #fff; font-size: 11px; }
</style>
