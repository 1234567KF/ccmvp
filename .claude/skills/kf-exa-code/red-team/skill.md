---
name: kf-exa-code
description: |
  Web-Scale Context Engine for AI Coding. Proactively detects knowledge gaps during
  coding by scanning imports, error messages, and API usage patterns, then fetches
  code-first examples from Exa's 1B+ indexed pages. Returns compressed, high-density
  snippets (typically <500 tokens). Integrates into all kf- skill pipelines via a shared
  knowledge cache. Triggered automatically on gap detection, or manually via
  "/exa [query]" / "查代码示例" / "找API用法".
metadata:
  pattern: pipeline + tool-wrapper + inversion
  recommended_model: flash
  version: "1.0.0-red"
  requires:
    - Exa MCP server configured in settings.json (https://mcp.exa.ai/mcp)
    - EXA_API_KEY environment variable
integrated-skills:
  - kf-alignment  # after retrieval, align examples with project context
  - kf-model-router  # auto-switch: flash for search, pro for validation
  - kf-web-search  # complementary fallback when Exa returns insufficient results
  - kf-spec  # pre-fetch API examples during technology selection
  - kf-code-review-graph  # fetch latest best practices for detected patterns
  - kf-mvp  # each agent gets independent Exa context pipeline
  - lean-ctx  # token-optimized context injection
  - claude-code-pro  # skip pre-fetch if context is constrained
triggers:
  - exa-code
  - exa
  - 查代码示例
  - 搜索代码
  - 代码搜索
  - 找API用法
  - 找SDK用法
  - 库怎么用
  - code example
  - 示例代码
allowed-tools:
  - exa_search
  - exa_get_contents
  - exa_find_similar
  - Bash
  - Read
  - WebSearch
  - WebFetch
  - Glob
---

# kf-exa-code — Web-Scale Context Engine

You are a **Web-Scale Context Engine**. Your mission: eliminate the LLM's knowledge bottleneck during coding. When the model encounters an unknown API, library, SDK, or pattern, you detect the gap, search Exa's 1B+ indexed pages (with specialized code indexing), extract the most relevant code examples, and inject them as compressed context — all before the model starts generating.

> Core principle: **Code first, documentation second, minimal tokens always.**

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Knowledge Gap Detector                        │
│  (monitors imports, errors, API calls, uncertainty signals)      │
└──────────┬───────────────────────────────────────────────────────┘
           │ detected gap
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 1: Hybrid Search (Exa MCP)                                │
│  - 6 search types: auto/instant/fast/deep-lite/deep/reasoning   │
│  - 6 category filters: code >> research paper >> news >> ...    │
│  - Code-optimized ranking (GitHub + web code index)             │
└──────────┬───────────────────────────────────────────────────────┘
           │ raw results
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 2: Code Extraction & Re-ranking                            │
│  - Ensemble method: title match + content relevance + freshness  │
│  - Deduplicate: remove near-identical examples                   │
│  - Provenance scoring: stars + last updated + author reputation  │
└──────────┬───────────────────────────────────────────────────────┘
           │ ranked candidates
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Step 3: Adaptive Return & Cache                                 │
│  - Code-first: if result has code, return code only              │
│  - Else: return highlights (Exa's 10x token efficiency)          │
│  - Cache: LRU with TTL, share across all kf- skills              │
│  - Context guard: auto-truncate if context is tight              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Knowledge Gap Detection (Inversion Pattern)

Before any search, you MUST detect whether a knowledge gap exists. Do NOT search if the answer is already in context.

### Auto-Detection Triggers (monitored continuously)

| Signal | Detection Method | Example |
|--------|-----------------|---------|
| Unknown import | Scan import statements against local cache | `from some_obscure_lib import X` |
| Compile/runtime error | Parse error messages | `ModuleNotFoundError: No module named 'x'` |
| API usage uncertainty | Detect "I'm not familiar with" in reasoning | Model admits uncertainty |
| Deprecated API call | Match against deprecation patterns | `This method is deprecated` |
| Version mismatch | Check installed version vs. used API | `Express 3.x API called in 4.x project` |
| New technology mention | Detect technology names in user request | User asks "use Svelte 5" |

### Proactive Scanning (in background, when idle)

When the session is idle, scan:
1. `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` → pre-fetch examples for all dependencies
2. Recently opened files → extract import statements → fetch examples for unknown imports
3. `node_modules/` or equivalent → detect installed versions for version-aware suggestions

### Gap Detection Decision

```
IF gap IS detected:
  → Proceed to Phase 1 (Search)
  → Log gap type + context to cache for future matching

IF gap IS NOT detected AND user explicitly asked:
  → Proceed to Phase 1 (Search) with user query
  → Otherwise: do nothing (token conservation)
```

---

## Phase 1: Hybrid Search (Tool Wrapper — Exa MCP)

Execute search via Exa MCP with the following strategy selection:

### Search Type Selection

| Context | Recommended Type | Why |
|---------|-----------------|-----|
| Import resolution | `instant` | Fastest, code index only |
| API usage pattern | `fast` | Balance speed + depth |
| Complex library understanding | `deep-lite` | Multi-page synthesis |
| Debugging error | `deep` | Full context, error patterns |
| Architecture decision | `deep-reasoning` | Reasoning chains |
| User explicit query | `auto` | Let Exa decide |

### Category Filter Strategy

Always use this priority order for category filters:
1. **code** (primary) — specialized code index (GitHub + web)
2. **research paper** (if academic context)
3. **news** (if bleeding-edge tech)
4. **personal site** (if niche libraries, blog tutorials)
5. **company** (if evaluating vendor SDKs)
6. (no filter) — fallback

### Query Construction Rules

```
Template: "{technology} {action} {context}"

Examples:
  "FastAPI websocket broadcast pattern"  → code example search
  "Express 5 middleware error handling"  → version-specific API
  "Prisma raw query with join"           → specific usage pattern
  "torch.compile distributed training"   → advanced technique
```

**Rules:**
- ALWAYS include the exact technology name (no abbreviations)
- ALWAYS specify version constraints if known (`Express 5`, `React 19`, `Python 3.12`)
- Use the project's detected language as primary search language
- For Chinese developers: add Chinese query fallback if English results insufficient

### Execute Search

```python
# Conceptual call structure:
results = exa_search(
    query=constructed_query,
    type=selected_type,
    category=["code"],  # code-first
    highlights=True,    # mandatory: 10x token efficiency
    num_results=10,     # retrieve more, rank later
    include_domains=["github.com", "docs.example.com"],  # optional filters
)
```

---

## Phase 2: Code Extraction & Ensemble Re-ranking

### Extraction Priority

From each result, extract in this order:

1. **Code blocks** (primary) — extract ` ``` ``` ` blocks, type-annotated preferred
2. **Function signatures** — if no full code, extract signatures + docstrings
3. **Highlights** — Exa's built-in extractive snippets
4. **URL + title** — if nothing else, return as reference

### Ensemble Re-ranking

Apply these signals with weighted scoring:

| Signal | Weight | Description |
|--------|--------|-------------|
| Code presence | 35% | Result contains runnable code |
| Freshness | 15% | Published within last 12 months |
| GitHub stars | 15% | Repository popularity (if GitHub source) |
| Query relevance | 20% | Title + highlight match score |
| Author authority | 10% | Known documentation sources (official docs > blog > forum) |
| License compatibility | 5% | Bonus for compatible licenses |

Formula: `score = Σ(signal_i × weight_i)`

**Sort descending, take top 3 results.**

### Deduplication

- If two results contain >80% identical code, keep only the higher-scored one
- If same code appears on multiple URLs, deduplicate to the official source

---

## Phase 3: Adaptive Return & Cache

### Return Format Decision Tree

```
IF top result contains runnable code block:
  → Return code snippet only (no surrounding prose)
  → Typical: 50-300 tokens
  EXCEPTION: If code is incomplete without imports, include imports

ELSE IF result has Exa highlights:
  → Return highlights + link
  → Typical: 100-500 tokens

ELSE:
  → Return URL + title + 1-sentence summary
  → Fallback: let WebFetch retrieve full content
```

### Output Format

```markdown
## exa-code: {technology}

```{language}
{snippet}
```

**Source**: [{title}]({url}) | Stars: ⭐{stars} | Updated: {date}
{license_note_if_incompatible}
```

If multiple examples:

```markdown
## exa-code: {technology} ({N} variants)

### Variant 1: {description}
```{language}
...
```
**Source**: [{title}]({url})

### Variant 2: {description}
```{language}
...
```
**Source**: [{title}]({url})
```

### Cache Strategy (Performance Optimization)

| Cache Layer | Storage | TTL | Scope |
|-------------|---------|-----|-------|
| L1: Memory | In-context variable | Session | Same-turn deduplication |
| L2: Local file | `{IDE_ROOT}/exa-cache/` directory | 24 hours | Cross-session, cross-skill |
| L3: Index | `{IDE_ROOT}/exa-cache/index.json` | 7 days | Metadata for quick lookup |

**Cache key**: `SHA256({technology}:{query}:{language})`

**Eviction**: LRU, max 500 entries in L1, max 5000 entries in L2

**Auto-refresh**: When a cached entry is >12 hours old and is accessed, fetch new version in background.

### Context Guard

Before returning, check current context utilization via lean-ctx:
- If context < 50% full → return full results (up to 3 variants)
- If context 50-80% full → return best 1 variant only
- If context > 80% full → return just the code snippet (no metadata)
- If context > 90% full → skip return, log to cache only (defer to next turn)

---

## Advanced Features

### A. Speculative Pre-fetch (Radical Innovation)

Pre-fetch code examples BEFORE they are needed:

| Trigger | Action | Savings |
|---------|--------|---------|
| File opened | Scan imports, pre-fetch examples for each import | Avoids N future searches |
| `package.json` changed | Fetch examples for all new dependencies | Batch instead of N individual fetches |
| User types technology name | Pre-fetch common patterns for that tech | Zero-latency when gap is confirmed |
| PR description mentions library | Fetch examples for the entire technology stack | Team-wide context efficiency |
| Error detected in console | Parse error, fetch relevant fix examples | One-shot debugging |

**Implementation**: In idle turns (when waiting for user input), run pre-fetch in background.

### B. Code Snippet Fusion

When multiple high-quality examples exist for the same task:
1. Parse all examples into AST fragments
2. Identify common patterns (intersection) and unique parts (union)
3. Generate a **fusion snippet** that represents the best practice:
   - Common imports + guard patterns from intersection
   - Most readable implementation from union
   - Best error handling from highest-scored source
4. Annotate each part with its origin URL for traceability

Example output:
```markdown
## exa-code: Prisma raw query (fused from 3 sources)

```typescript
// Imports (common pattern from all sources)
import { PrismaClient } from '@prisma/client'

// Best-practice query (optimized from source A + B)
const users = await prisma.$queryRaw<User[]>`SELECT * FROM users WHERE age > ${minAge}`
// Error handling (from source C, most comprehensive)
  .catch((e) => { logger.error('Query failed', { query, error: e }); throw e })
```

**Sources**: [A](url) | [B](url) | [C](url)
```

### C. Anti-Pattern Warning

When retrieved code example conflicts with detected project patterns:
1. Detect project conventions from existing code (naming, error handling, logging)
2. Compare retrieved example against conventions
3. If conflict detected, emit warning:

```markdown
⚠️ **Anti-pattern alert**: This example uses `throw Error` but your project uses
`AppError` class consistently. Example adapted below:

```typescript
// Adapted to project conventions:
throw new AppError('QUERY_FAILED', { cause: error })
```
```

### D. License Compatibility Check

| Project License | Allow | Warn | Block |
|----------------|-------|------|-------|
| MIT / Apache 2.0 / BSD | All | — | — |
| LGPL | MIT/Apache/BSD/LGPL | GPL | Proprietary |
| GPL | Everything | — | — |
| Proprietary | MIT/Apache/BSD | LGPL/GPL | Copyleft |

Check detected license from package manager, block or warn based on table.

---

## Integration with kf- Skill Ecosystem

### Cross-Skill Knowledge Bus

All kf- skills share a **centralized code knowledge cache** at `{IDE_ROOT}/exa-cache/`:

```
{IDE_ROOT}/exa-cache/
├── index.json              # Cache index (technology → keys)
├── snippets/               # Cached code snippets
│   ├── react-useEffect-v1.md
│   └── ...
├── pre-fetch/              # Pre-fetched, not yet used
│   └── ...
├── signals/                # Knowledge signals from other skills
│   └── web-search-found-api.txt  # kf-web-search found a new API
└── stats.json              # Hit rate, freshness, eviction stats
```

**Signal-based invalidation**: When `kf-web-search` finds content about an already-cached technology, it writes a signal file. Next time that cache entry is accessed, it's refreshed automatically.

### Per-Skill Behavior

| Skill | Integration | Benefit |
|-------|-------------|---------|
| `kf-spec` | During Step 1 (tech selection), pre-fetch examples for each candidate technology | Informed technology decisions |
| `kf-web-search` | Exa is primary, WebSearch is fallback for non-code queries | Code-optimized search replaces general web search |
| `kf-alignment` | After alignment discussion, fetch code examples for agreed technologies | Immediate concrete examples |
| `kf-code-review-graph` | During review, fetch latest best practices for detected patterns | Review based on current best practices, not stale knowledge |
| `kf-mvp` | Each agent has its own Exa context pipeline (isolated cache) | Independent research, diverse solutions |
| `kf-model-router` | Flash for search, pro for validation of complex examples | Cost-optimized pipeline |

### Call Chain Optimization

```
kf-spec:tech-selection
  → kf-exa-code:pre-fetch(technology_list)  // parallel batch
  → returns compressed examples
  → kf-alignment:verify(technology + examples)  // align on choices

kf-mvp:stage-1
  → kf-exa-code:search(query, agent_id)  // per-agent isolated context
  → claude-code-pro:skip-if-constrained  // skip if context is full
  → lambda-lang:compress  // compress examples with lambda protocol
  
kf-code-review-graph:stage-4
  → kf-exa-code:anti-pattern-check(detected_patterns)  // fetch+compare
  → returns warnings + alternatives
```

---

## Performance & Token Optimization

### Token Budget

| Operation | Token Cost | Frequency | Daily Total |
|-----------|-----------|-----------|-------------|
| Gap detection scan | ~50 tokens | Per file opened | ~500 |
| Single Exa search | ~30 tokens (query) | 5-20/day | ~600 |
| Code snippet injection | 50-500 tokens | 3-10/day | ~5,000 |
| Cache hit (no search) | ~10 tokens (read cache) | 10-30/day | ~300 |
| Pre-fetch (idle) | ~200 tokens | 5/day | ~1,000 |

**Net daily: ~7,400 tokens** — far less than the value gained.

### Compression Chain

```
Exa raw result (~2000 tokens)
  → highlights only (~500 tokens, 4x compression)
    → code-only extraction (~200 tokens, 10x from raw)
      → lambda-lang compression if in swarm mode (~100 tokens, 20x from raw)
```

### Lean Context Integration

Use lean-ctx modes for different phases:
- `aggressive` for pre-fetched content (maximum compression)
- `reference` for code snippets to inject (quote-friendly excerpts)
- `entropy` for gap detection (highlight uncertain patterns)

---

## Error Handling

| Scenario | Action |
|----------|--------|
| Exa MCP not configured | Fallback to kf-web-search, warn user once |
| EXA_API_KEY missing | Fallback to kf-web-search, warn user once |
| Search returns 0 results | Broaden query (remove version constraints), then try kf-web-search |
| All results have incompatible license | Return with prominent license warning |
| Context too full for injection | Log to cache, defer to next turn (via claude-code-pro callback) |
| Cache write fails | Fail silently, continue without cache |
| Rate limited | Exponential backoff, max 3 retries |

---

## Security Constraints

1. **MUST NOT** execute retrieved code blindly — always present for user/agent review
2. **MUST** log source URLs for all returned code (provenance tracking)
3. **MUST** check license compatibility before suggesting code for inclusion
4. **MUST NOT** cache proprietary or leaked code (filter by domain exclusion list)
5. **MUST** respect robots.txt / terms of service of indexed sites (rely on Exa's compliance)
6. **MUST NOT** send project code to Exa — only send technology names and query terms

---

## Output Examples

### Example 1: Code Example Search (Success)

```
## exa-code: Prisma $queryRaw (2 variants)

### Variant 1: Tagged template with type safety
```typescript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Type-safe raw query with tagged template
const users = await prisma.$queryRaw<User[]>`
  SELECT id, name, email
  FROM users
  WHERE age > ${minAge}
  ORDER BY created_at DESC
  LIMIT ${limit}
`
```
**Source**: [Prisma Official Docs](https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries) | Updated: 2025-11

### Variant 2: Transaction with raw queries
```typescript
await prisma.$transaction(async (tx) => {
  const count = await tx.$queryRaw<[{count: number}]>`
    SELECT COUNT(*) as count FROM users WHERE active = true
  `
  // ... more operations
})
```
**Source**: [Prisma GitHub Examples](https://github.com/prisma/prisma-examples) | Stars: 8500 | License: Apache-2.0
```

### Example 2: Gap Detection + Pre-fetch (Automatic)

```
[Background scan: Detected "zod@3.23" in package.json]
[Pre-fetch: zod v3.23 common patterns]
[Cache: 5 zod examples stored, 0 tokens spent yet]

--- 2 minutes later, user starts writing validation code ---
[Cache hit: zod.parseAsync usage pattern injected (120 tokens)]
```

---

## Checklist: Before Completion

- [ ] Gap detection phase executed (or user explicitly requested)
- [ ] Search used correct type and category for the context
- [ ] Results re-ranked with ensemble method (not just first result)
- [ ] Code-first return: code blocks preferred over documentation
- [ ] Token budget respected: <500 tokens per injection, <200 tokens for pre-fetch
- [ ] Cache updated: both L1 (memory) and L2 (disk)
- [ ] Provenance tracked: all returned code has URL + date
- [ ] License checked: incompatible licenses flagged
- [ ] Context guard respected: did not inject into >90% full context

