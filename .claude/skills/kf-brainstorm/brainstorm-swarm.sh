#!/usr/bin/env bash
# Brainstorm Collaboration Swarm Launcher
# Usage: ./brainstorm-swarm.sh "<task_description>"

set -e

TASK="${1:-}"
SWARM_ID="brainstorm-$(date +%s)"
NAMESPACE="brainstorm"

if [ -z "$TASK" ]; then
    echo "Usage: ./brainstorm-swarm.sh '<task_description>'"
    exit 1
fi

echo "=============================================="
echo "🎯 Brainstorm Collaboration Swarm"
echo "=============================================="

# Initialize swarm
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 6 \
  --strategy brainstorm \
  --name "$SWARM_ID"

# Store task in shared memory
npx @claude-flow/cli@latest memory store \
  --key "brainstorm:task:$SWARM_ID" \
  --value "$TASK" \
  --namespace "$NAMESPACE"

# Spawn Red Team
npx @claude-flow/cli@latest agent spawn \
  --type red-team \
  --name "red-$SWARM_ID"

# Spawn Blue Team
npx @claude-flow/cli@latest agent spawn \
  --type blue-team \
  --name "blue-$SWARM_ID"

# Spawn Judge
npx @claude-flow/cli@latest agent spawn \
  --type judge-arbitrator \
  --name "judge-$SWARM_ID"

echo "✅ Brainstorm Swarm initialized: $SWARM_ID"
