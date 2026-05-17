---
name: swarm-brainstorm-orchestrator
type: coordinator
description: Swarm orchestrator for brainstorm collaboration pattern
topology: hierarchical-mesh
maxAgents: 6
strategy: brainstorm
memory: hybrid
hnsw: true
neural: true
---

# Brainstorm Collaboration Swarm Orchestrator

## Architecture

```
                    ┌─────────────────┐
                    │   Orchestrator  │
                    │    (Judge)      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
         │  Red   │    │  Blue   │    │ Memory  │
         │  Team  │    │  Team   │    │  Store  │
         └────────┘    └────────┘    └────────┘
```

## Execution Flow

### 1. Initialize Swarm
```bash
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 6 \
  --strategy brainstorm
```

### 2. Spawn Agents
```bash
# Spawn Red Team
mcp__claude-flow__agent_spawn red-team --name="red-${SWARM_ID}"

# Spawn Blue Team
mcp__claude-flow__agent_spawn blue-team --name="blue-${SWARM_ID}"
```

## MCP Tools Used

| Tool | Purpose |
|------|---------|
| `swarm_init` | Initialize hierarchical-mesh swarm |
| `agent_spawn` | Create red/blue team agents |
| `memory_store` | Share findings between agents |
