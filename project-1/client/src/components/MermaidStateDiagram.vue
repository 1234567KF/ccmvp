<template>
  <div class="mermaid-wrap">
    <div v-if="loading" class="mmd-status">⏳ 渲染状态图中...</div>
    <div v-else-if="error" class="mmd-status mmd-error">⚠️ 渲染失败：{{ error }}</div>
    <div v-else v-html="svg" class="mmd-svg"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

interface SM {
  states: string[];
  transitions: Array<{ from: string; to: string; trigger: string }>;
  initial: string;
}

const props = defineProps<{
  machine: SM | null;
}>();

const loading = ref(false);
const error = ref('');
const svg = ref('');
let mmdInstance: any = null;
let renderId = 0;

function escapeName(s: string): string {
  // Mermaid quoted state names handle Unicode/Chinese safely
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildDefinition(sm: SM): string {
  const lines: string[] = [];
  // Mermaid uses stateDiagram-v2 syntax (note: v2, not v1)
  // But actually, the correct identifier is "stateDiagram-v2"
  // Wait - let me check. In some mermaid versions, it's "stateDiagram"
  // Let me use the version that works with our mermaid@11
  lines.push('---');
  lines.push('title: 状态流转');
  lines.push('---');
  lines.push('stateDiagram-v2');

  // States - no need to declare explicitly, transitions suffice
  // But we need to handle initial state with [*]
  lines.push('');
  lines.push('    %% 初始状态');
  lines.push(`    [*] --> ${escapeName(sm.initial)}`);
  lines.push('');

  // Transitions with step numbers
  lines.push('    %% 状态转移');
  sm.transitions.forEach((tr, i) => {
    const label = `${i + 1}. ${tr.trigger}`;
    // Handle self-loops and regular transitions
    if (tr.from === tr.to) {
      lines.push(`    ${escapeName(tr.from)} --> ${escapeName(tr.to)} : ${label}`);
    } else {
      lines.push(`    ${escapeName(tr.from)} --> ${escapeName(tr.to)} : ${label}`);
    }
  });

  return lines.join('\n');
}

async function renderMermaid() {
  svg.value = '';
  error.value = '';

  if (!props.machine || !props.machine.states.length) {
    return;
  }

  loading.value = true;
  renderId++;
  const currentId = renderId;

  try {
    // Dynamic import: mermaid is only loaded when needed
    if (!mmdInstance) {
      const mod = await import('mermaid');
      mmdInstance = mod.default;
      mmdInstance.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
          primaryColor: '#e6f4ff',
          primaryBorderColor: '#1677ff',
          primaryTextColor: '#333',
          lineColor: '#bbb',
          secondaryColor: '#f6ffed',
          tertiaryColor: '#fff',
          fontSize: '12px',
        },
      });
    }

    const definition = buildDefinition(props.machine);
    console.debug('[Mermaid] definition:', definition);

    const id = `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const result = await mmdInstance.render(id, definition);
    if (currentId !== renderId) return; // Stale, component was re-rendered

    // mermaid returns SVG string — inject safely
    // Post-process: add viewBox if missing, ensure responsive width
    let svgContent = result.svg;
    if (!svgContent.includes('viewBox=')) {
      // Extract width/height from SVG attributes
      const w = svgContent.match(/width="([^"]+)"/)?.[1] || '100%';
      const h = svgContent.match(/height="([^"]+)"/)?.[1] || 'auto';
      svgContent = svgContent.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
    }
    svgContent = svgContent.replace('<svg ', '<svg width="100%" ');

    svg.value = svgContent;
  } catch (e: any) {
    if (currentId === renderId) {
      error.value = e?.message || String(e);
      console.error('[Mermaid] render error:', e);
    }
  } finally {
    if (currentId === renderId) {
      loading.value = false;
    }
  }
}

watch(() => props.machine, renderMermaid, { deep: true, immediate: true });

onUnmounted(() => {
  renderId++; // Cancel any pending render
});
</script>

<style scoped>
.mermaid-wrap {
  background: #fafafa;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  min-height: 60px;
}

.mermaid-wrap :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-wrap :deep(.stateGroup) rect {
  rx: 16;
  ry: 16;
}

.mmd-status {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.mmd-error {
  color: #ff4d4f;
}
</style>
