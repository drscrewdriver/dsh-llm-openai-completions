# 短路控制规约（Takeover Control Spec）

> **面向对象**：希望接入「自定义 OpenAI 兼容网关短路」机制的 DSH 插件作者——典型如 dsh-thinking-effort / dsh-thinking-levels 这类**控制层**插件（负责档位展示、effort 注入、能力宣告）。本规约描述短路机制的完整契约：**谁接管、怎么判定、如何注入、如何序列化**。实现本规约的任意插件组合都能互操作，且不互相依赖。

## 0. 概念：两层分工

短路机制是**两层架构**，两个角色各司其职：

| 层 | 角色 | 职责 | 实现者（参考） |
|---|---|---|---|
| **传输层**（transport） | 接管方 | 对名单内 provider 的 `llm/stream` 请求**短路**，用自己的序列化/解析逻辑直接与网关对话 | dsh-llm-openai-completions |
| **控制层**（control） | 注入方 | 展示/编辑档位、把档位决策注入 `agent/request` 的 `reasoningEffort`、向模型选择器宣告能力 | dsh-thinking-levels（本规约的目标读者：dsh-thinking-effort 等） |

**关键约定**：控制层插件**不直接发请求**，它只做两件事——读短路名单决定「哪些 provider 被接管」，以及向 `agent/request` 注入 `reasoningEffort`。wire 层长什么样由传输层负责。控制层插件**可以**替换（dsh-thinking-effort ↔ dsh-thinking-levels 互换），传输层插件**也可以**替换（只要遵守本规约的 wire 契约），互不感知。

---

## 1. 控制面（settings 命名空间）

### 1.1 短路名单：`llm-openai-completions`

传输层插件注册的命名空间，**总开关 + 名单**：

```yaml
llm-openai-completions:
  enabled: true        # boolean, 默认 false。false = 不接管任何路由
  providers:
    - local-35b        # string[]，对应 llm-pi-ai.providers 下的键
```

Schema（composition 与 settings 共用同一套）：

```ts
const Config = z.object({
  enabled: z.boolean().default(false),
  providers: z.array(z.string()).default([]),
})
```

**短路判定（唯一权威规则）**：

```
takeover(provider) = llm-openai-completions.enabled === true
                     && llm-openai-completions.providers.includes(provider)
```

- 名单内 provider → 传输层接管流式调用，pi-ai **不参与**。
- 名单外 / 未启用 / 传输层插件未安装 → 回落 pi-ai 原生行为，接管随时可撤销。
- 名单的最终控制权在用户手写的 `providers` 数组；控制层插件可以**软耦合**地自动维护它（见 §6），但绝不覆盖用户意图。

### 1.2 数据面：`llm-pi-ai` providers（两个插件共享，不复制）

provider 的 `baseURL` / `models` / `reasoningEfforts` / `compat` / `input` **永远配置在 `llm-pi-ai`**，传输层只读其 wire 语义，控制层只读其能力语义。**任何插件都不得复制这份配置**——它是数据面的唯一事实源。

```yaml
llm-pi-ai:
  providers:
    local-35b:
      api: openai-completions
      baseURL: http://192.168.100.242:8200/v1
      models:
        - id: Qwen3.6-35B-A3B
          reasoningEfforts: { off: null, high: 'high' }   # 能力宣告，见 §3
          compat:
            thinkingFormat: qwen                          # wire 语义，见 §4
            supportsReasoningEffort: false                # 显式声明才为 true，见 §3
```

### 1.3 控制层自有的命名空间

控制层插件（如 dsh-thinking-levels）可以有自己的命名空间存档位/调度偏好（`thinking-levels: { level, allowUpgrade, ... }`），与本规约正交。

---

## 2. 接管机制（传输层行为，控制层需要理解）

- 传输层在 `llm/stream` waterfall 上注册 **`prepend` 监听器**（最外层、后执行、最终值生效）：

```
on('llm/stream', async function* (options, next) {
  if (takeover(options.provider)) {
    yield* adapter.stream(options)   // 短路：不调用 next()
    return
  }
  yield* next()                       // 回落 pi-ai
}, { prepend: true })
```

- **不修改 `llm.adapters` 注册表**：不包装、不重注册任何 adapter 对象 → 没有 registration identity 冲突，模型发现/元数据仍走 pi-ai。
- 接管是**每请求判定**（懒读 settings），运行时改名单即时生效，无需重启。

---

## 3. 能力宣告契约（控制层插件必须对齐）

控制层插件从 `llm-pi-ai` 的模型条目读出三件事，判定逻辑必须与下面对齐：

```
efforts       = entry.reasoningEfforts
compat        = entry.compat
thinkingOn    = efforts 是对象（非 null / 非数组）
supportsEffort = compat.supportsReasoningEffort === true   // 只认显式 true
toggled       = takeover(provider)                          // 短路名单内
```

| 组合 | 判定 | 模型选择器展示 | 注入语义 |
|---|---|---|---|
| `thinkingOn && supportsEffort` | **effort 模型** | 完整档位（effort 表 + 可选 auto/low mask） | 档位按表映射 wire |
| `thinkingOn && !supportsEffort && toggled` | **toggle 模型（接管内）** | 折叠为 `[Off, On]`（On 的 id 是 `high`） | Off→off（关思考）；On→high（开思考，wire 为 enable_thinking，**不发 effort**） |
| `thinkingOn && !supportsEffort && !toggled` | toggle 但 pi-ai 服务 | **不折叠**，保持 pi-ai 原生档位（off/high 可见） | 走 pi-ai 原生校验 |
| `!thinkingOn` | 非思考模型 | 无思考档位 | 一律剥离 reasoningEffort |

**铁律**：
1. `supportsReasoningEffort` **只认显式 `true`**——裸 `reasoningEfforts` 表（如 `{ off: null, high: 'high' }`）是 toggle-only 模型，**绝不**当 effort-capable。否则会把 toggle 模型当成 effort 模型发 `reasoning_effort`，网关报错。
2. `on` 是**虚拟档位**，永远不是 wire 档位：对 toggle 模型它解析为 `high`（传输层把它序列化为 enable_thinking，不带 effort）；对 effort 模型它被剥离。
3. toggle 折叠**只在短路名单内**生效（第 3 行组合）——名单外 provider 由 pi-ai 服务，控制层不得折叠其原生档位。
4. 模型无 effort 支持时，控制层必须**剥离**继承来的 `reasoningEffort`（否则 dsh 按请求抛 `UNSUPPORTED_REASONING_EFFORT`）。

### 3.1 分层门控（用户可见的编辑流程）

设置卡片按以下分层逐级门控，控制层 UI 必须遵守：

```
provider 行: [短路接管开关]            ← 决定下面所有层是否属于本规约管辖
  └─ 模型行: [思考模型开关]           ← thinkingOn
       └─ [支持 think effort 开关]     ← supportsEffort
            └─ effort 编辑网格          ← 仅 thinkingOn && supportsEffort 时显示
```

未接管的 provider 显示「未接管」提示，不出现 effort 编辑入口。

---

## 4. Wire 序列化契约（传输层行为，控制层需要理解其语义）

接管后，传输层把 `reasoningEffort` 序列化进请求体：

- **system 永远 `role: "system"`**——自定义网关绝不收到 `developer`（pi-ai 对非标准 URL 默认 `supportsDeveloperRole: true` 会 400）。
- **思考开关判定**：`thinkingOn = effort !== 'off'`——toggle 模型**无 effort 也默认开思考**；显式 `off` 才关闭。
- **toggle 模型（`supportsReasoningEffort: false`）**：**固定发 `chat_template_kwargs: { enable_thinking, preserve_thinking: true }`**，与 `thinkingFormat` 配置无关——这是 vLLM Qwen3 系列唯一生效的思考开关（顶层 `enable_thinking` 被忽略；llm-pi-ai schema 又 withheld `qwen-chat-template`）。
- **effort 模型（`supportsReasoningEffort: true`）**：按 `thinkingFormat` 走——
  - `qwen` → 顶层 `enable_thinking`（+ 可选的 `thinking_budget`）
  - `qwen-chat-template` → `chat_template_kwargs`
  - 其它（openai / deepseek / openrouter / together / zai / string-thinking / ant-ling）→ `reasoning_effort: <effort>`
- **`</think>` 分离**：接收侧把 Qwen3 风格思考内容（vLLM 渲染进 `content`）切分到 reasoning 块，不混入正文。
- 不做 `thinking_budget`（刻意，防截断）；图片块抛 `UNSUPPORTED_CONTENT`（文本优先）。

---

## 5. 注入契约（控制层插件的全部义务）

控制层插件在 `agent/request` waterfall 上注册 **`prepend` 监听器**（最外层，后执行——因为宿主还会在 `next()` 后用会话选择覆盖 `reasoningEffort`，prepend 保证本插件的决策最后生效）：

```
on('agent/request', async (payload, next) => {
  seed = await next()
  if (!cfg.enabled) return seed
  capability = resolve(seed.provider, seed.model)     // §3 判定
  decision = resolveEffortInjection({                 // 档位决策
    supportsReasoning, seedEffort, selected, recentCalls,
    allowDowngrade, allowUpgrade, efforts, toggleOnly,
  })
  if (!decision.inject) return strip(seed)            // 剥离，见铁律 4
  return { ...seed, reasoningEffort: decision.level }
}, { prepend: true })
```

**控制层只做这一件事**：把 `reasoningEffort` 设为决策档位（off / on / minimal / low / medium / high / xhigh / max——`on` 与 `auto` 在发出前必须解析为具体档位，见 §3 铁律 2）。wire 变换由传输层完成。

### 5.1 能力宣告（模型选择器）

控制层插件可选地包装 adapter 的 `resolveModel`，向模型目录广告额外档位（如 `auto` 调度 mask、`low` 扩展），但**不得改动 toggle 模型的折叠结果**（§3 表格第 2 行是硬性展示）。

---

## 6. 软耦合与自动联动

- 控制层插件**自动维护**短路名单（软耦合）：扫描 `llm-pi-ai.providers`，识别「自定义 openai-completions 网关（`api: openai-completions` 或非官方 baseURL）且任一模型声明 `reasoningEfforts`」的 provider，并入 `providers` 并置 `enabled: true`。命名空间未注册（传输层插件未装）时**跳过写入**。
- 触发时机：`llm/adapters-updated` 与 `settings/document-updated`（pi-ai / takeover 命名空间）。
- 用户手写的 `providers` 保留、去重——自动联动只增不减。

---

## 7. 错误语义

| 场景 | 结果 |
|---|---|
| 被接管 provider 在 llm-pi-ai 不存在 / 无 baseURL | `LlmError` `NO_ADAPTER`：`provider "<name>" is not configured for the openai-completions adapter` |
| 模型不接受该 effort | dsh 按请求拒绝：`UNSUPPORTED_REASONING_EFFORT`（控制层应提前剥离，§3 铁律 4） |
| HTTP 401/403 | `AUTH` |
| HTTP 429 | `RATE_LIMIT` |
| HTTP ≥500 | `SERVER` |
| HTTP 400 | `INVALID_REQUEST` |
| 其它 | `TRANSPORT` |

---

## 8. 第三方插件接入 Checklist（dsh-thinking-effort 作者视角）

1. **读名单**：`settings.get('llm-openai-completions')` → `{enabled, providers}`；`takeover(provider) = enabled && providers.includes(provider)`。命名空间返回 `undefined` = 传输层未装 → 本插件退化为纯 pi-ai 控制（不折叠、只按 pi-ai 原生档位注入）。
2. **能力判定**：实现 §3 的 `piAiPosture` 等价逻辑（读 `llm-pi-ai` 的 `reasoningEfforts` + `compat.supportsReasoningEffort`，折叠只看名单内）。逐字对齐四条铁律。
3. **注入**：`agent/request` **prepend** 监听器，§5。`on` 解析为 `high`（toggle）/剥离（effort）；`auto` 解析为具体档位后发出。
4. **宣告**：包装 `resolveModel` 广告档位（auto/low mask），**不改** toggle 折叠。
5. **软耦合**：自动维护名单只增不减、命名空间未注册时跳过。
6. **不碰的东西**：不修改 `llm.adapters`；不复制 `llm-pi-ai` 配置；不直接发 HTTP。

**互操作验证**：同一 profile 下「dsh-thinking-effort（控制层）+ 任意遵守本规约的传输层插件」与「dsh-thinking-levels + dsh-llm-openai-completions」对同一 provider 的 wire 输出必须逐字节一致（§4 契约是等价判定）。

---

## 9. 参考实现

- 传输层（短路 + wire + `</think>` 分离）：`src/index.ts`、`src/adapter/*.ts`
- 控制层（能力判定 + 注入 + 折叠）：dsh-thinking-levels `src/index.ts`（`piAiPosture` / `takeoverOf` / `resolveEffortInjection`）、`src/thinking-level.ts`
- 联动：dsh-thinking-levels `src/takeover-sync.ts`
- 本插件设置规约：`docs/settings-spec.md`（§4 wire 细节的权威版本）
