# Museware

**Describe it. Approve the plan. Watch it build.**

Museware is a visual development studio with an autonomous AI agent running inside it. You describe an application, Muse proposes an architectural blueprint, you review or adjust it, and on approval it writes real operations directly into the same component tree you drag and hand-edit — verified by a deterministic lint and review pass before presentation. Nothing on the canvas is a static screenshot or mockup: the tree executes interactively in run mode, handles state and navigation, and exports cleanly as a production React + Vite application, a folder ZIP, or a single-file portable HTML app (with optional PWA offline installation).

```bash
npm install
cp .env.example .env      # optional: add MUSE_API_KEY for live models
npm run dev               # http://localhost:5173
```

No key? The **local engine** runs the entire pipeline offline — identical cards, operations, component tree, and verify gates — using verified reference templates so you can evaluate the product immediately. Add a key in Settings (or `.env`), and the pinned Meta Muse models take over.

---

## The Core Laws It Is Built On

1. **Seven tools, not typed UI.** The model gets exactly seven function tools — `read_canvas`, `set_design_tokens`, `propose_blueprint`, `ask_choice`, `edit_canvas`, `illustrate_images`, and `finish` — and never emits raw UI as chat text. Chat prose stays conversational prose; canvas edits travel through validated tool calls.
2. **Every change is an op.** Yours and the agent's share the identical op vocabulary: `add`, `move`, `remove`, `setProps`, `setStyles`, `setText`, `rename`, `addScreen`, `removeScreen`, `renameScreen`, `setEntry`, `setTokens`, `saveComponent`, `placeComponent`, `setMockData`. One unified op log, one undo stack, 50 snapshots deep.
3. **Batched and all-or-nothing.** `edit_canvas` takes ordered batches of up to 40 ops (recommended in chunks of ≤12 ops). If a single op fails schema validation or bounds checking, none of them land.
4. **Blueprint before pixels.** The lead architect plans screen structures, ids, LOOK numbers, state namespaces, and navigation wiring; the approval card presents the plan for review and allows up to 3 adjustment rounds before building.
5. **Verify before show.** A deterministic reviewer gate inspects compact (390px) and expanded (≥1024px) layouts for contrast, missing data, and structural hierarchy before presenting results.
6. **A constrained vocabulary: 40 components, 51 icon names, 12 colour keys.** The agent cannot invent arbitrary widgets, unsupported design tokens, or invalid icons. Every node maps to a concrete, typed spec in `src/types/library.ts`.
7. **One pinned model per role.** Builder (`muse-spark-1.3`), architect (`muse-wonder-1.0`), chat (`muse-spark-1.3`), contributor (`muse-spark-1.3-contributor`), and image (`muse-image-1.0`). Pinned roles, transparent pricing, no hidden fallbacks.
8. **Stop is always visible.** Topbar pill, rail header, progress presenter card, and status bar — while the agent is running, you can stop execution at any second.
9. **Persist on create.** IndexedDB storage after every operation; seamless JSON import/export and recovery mechanisms.
10. **Cards leave on answer.** Decision cards collapse cleanly to receipts once tapped, preventing visual clutter in the chat rail.
11. **Receipts, not claims.** Every model turn is recorded with model ID, latency, input/output tokens, and cost.
12. **No JSON in chat.** If a model inadvertently leaks JSON into conversation, the turn loop intercepts and corrects it.
13. **Bounded prompts and paced turns.** Compact token sheets, 24 tool calls per turn cap, ≥4000ms pacing floor, and capped chat history.
14. **No code from the user, ever.** Interactivity and events are configured as declarative WHEN/THEN action chips (navigate, toggle, toast, setState, openUrl), not arbitrary executable scripts.
15. **Media stays portable.** Pure HTTPS video and HTTPS or base64 image sources. Local video is shipped as relative assets in folder exports, never unmaintainable bloat.
16. **Clean room compliance.** Built from the written specification alone. The reference repository was read for conceptual ideas only; no code, comments, strings, class names, or assets were copied, and the codebase contains no trace of it.
17. **Native Motion with Reduced-Motion Safety.** Declarative motion entrance presets (`rise`, `fade`, `slide`, `scale`, `none`) and CSS transitions authored directly into the component tree and validated by deterministic lint rules.

---

## Tools vs. Components: Architectural Distinction

A common question is whether the agent's **tools** are the same as **components**:

| Aspect | Agent Tools (7 Total) | UI Components (40 Total) |
| :--- | :--- | :--- |
| **What they are** | Function-calling capabilities invoked by the LLM | Visual and structural nodes on the canvas tree |
| **Execution** | Handled by `src/muse/loop.ts` during an agent turn | Rendered by `src/canvas/Canvas.tsx` & exported code |
| **Authority** | Defined in `TOOL_DESCRIPTIONS` & wire schemas | Defined in `COMPONENT_SPECS` (`src/types/library.ts`) |
| **List** | 1. `read_canvas`<br>2. `set_design_tokens`<br>3. `propose_blueprint`<br>4. `ask_choice`<br>5. `edit_canvas`<br>6. `illustrate_images`<br>7. `finish` | **Layout**: `screen`, `row`, `col`, `grid`, `card`, `hero`, `section`<br>**Content**: `heading`, `text`, `label`, `badge`, `divider`, `icon`, `image`, `avatar`<br>**Interactive**: `button`, `iconbutton`, `link`, `fab`, `accordion`, `tabs`<br>**Forms**: `form`, `input`, `textarea`, `select`, `checkbox`, `switch`, `slider`, `datepicker`<br>**Data & Media**: `table`, `list`, `stat`, `chart`, `marquee`, `scene3d`, `video`<br>**Navigation & Feedback**: `navbar`, `bottomnav`, `progress`, `spinner` |

The agent uses its **7 tools** to inspect, build, style, and wire the **40 components** on the canvas.

---

## Motion & Animation System

Does the agent have access to motion? **Yes, natively.**

- **Declarative Presets**: Sections and containers support entrance animations configured via `node.props.motion`:
  - `'rise'`: Smooth upward translation with opacity fade-in.
  - `'fade'`: Gentle opacity entrance.
  - `'slide'`: Lateral directional slide entrance.
  - `'scale'`: Subtle expansion into view.
  - `'none'`: Complete stillness.
- **Architectural Priming (`MOTION_PRIMER`)**: The model prompt includes motion hierarchy rules:
  > *"Motion is hierarchy in time: entrance order follows importance, hero first. Story- and image-led pages earn choreography; precision tools earn stillness. Use one ambient per page and one direction language. Scroll presets belong only on sections, never navigation or footer. Respect reduced motion; preserve the user's motion choices."*
- **Deterministic Quality Lint (`lintMotion`)**: The automated quality gate checks that sticky navigation bars and footers do not receive distracting entrance motion (preventing scroll jitter), while strictly protecting user-selected motion choices during repair turns.
- **Accessibility (`prefers-reduced-motion`)**: Every generated CSS style and export respects the user's OS-level reduced motion preferences, disabling transitions when requested.

---

## Environment Variables (All 11 Variables)

Configure these in your local `.env` or in your Vercel Project Settings under **Settings → Environment Variables**:

| Variable | Default Value | Required? | Description & Scope |
| :--- | :--- | :---: | :--- |
| `MUSE_API_KEY` | *(None)* | **Yes** (for live models) | Server-side house API key for Meta AI. Never exposed to the browser. If omitted, visitors are prompted to provide their own temporary key in Settings, or can use the offline demo engine. |
| `MUSE_BASE_URL` | `https://api.meta.ai` | Optional | Upstream Meta AI API root. Normalizes both bare URLs and `/v1` endpoints automatically. |
| `MUSE_CODE_MODEL` | `muse-spark-1.3` | Optional | Pinned model for canvas building, component generation, and multi-step op application. |
| `MUSE_CHAT_MODEL` | `muse-spark-1.3` | Optional | Pinned model for conversational responses, design advice, and clarification turns. |
| `MUSE_ARCHITECT_MODEL`| `muse-wonder-1.0` | Optional | Deep-reasoning architect model invoked during Wonder mode for structural planning. |
| `MUSE_CONTRIBUTOR_MODEL`| `muse-spark-1.3-contributor`| Optional | Testing and development tier model for experimental ops (active in `DEV` mode only). |
| `MUSE_IMAGE_MODEL` | `muse-image-1.0` | Optional | Generative image model invoked for hero artwork and card illustrations. |
| `MUSE_BUILD_IMAGES` | `6` | Optional | Maximum number of images automatically illustrated per build turn (range 1–30). |
| `MUSE_REASONING` | `0` | Optional | Set to `1` to transmit Responses-API reasoning effort parameters on the chat surface. |
| `MUSE_DAILY_CAP` | `5` | Optional | House key circuit breaker (USD per UTC day). At 80% spend it issues a soft warning; at 100% it halts with `BUDGET_EXHAUSTED` to protect your wallet. Visitors' own keys are never capped. |
| `MUSE_LIVE` | `1` | Optional | Set to `1` on live production instances (Vercel) so `/api/muse/status` reports `live: true`. Automated CI tests leave this unset. |

---

## What is in the Box

| Path | Purpose |
| :--- | :--- |
| `src/types/` | The core document tree, OpenUI token schema, 40-component library specs, and Zod schemas |
| `src/ops/` | Tree traversal, op hydration, validation, and all-or-nothing transactional batch applier |
| `src/design/` | Three-tier token architecture (`mw.css`), preset themes, and CSS materialization |
| `src/canvas/` | Artboard viewport, responsive CSS generation, drag-and-drop mechanics, and 40-type renderer |
| `src/inspector/` | Schema-driven property editors, token pickers, responsive breakpoint overrides, and action wiring |
| `src/rail/` | The agent chat rail: message feed, 6 interactive card kinds, composer, and progress presenter |
| `src/muse/` | Prompt engineering, context builders, streaming HTTP client, tool execution loop, and local engine |
| `src/export/` | Export engines: Single-File HTML, Static Site ZIP, and full React + TypeScript + Vite project ZIP |
| `src/persist/` | IndexedDB persistent storage, project schema migration, and JSON import/export |
| `src/preview/` | Interactive run mode: navigation, state transitions, toast alerts, and WHEN/THEN action engine |
| `server/museProxy.ts` | The secure server proxy gate (Vite dev middleware & Vercel serverless foundation) |
| `api/muse/[...path].js` | Production serverless bundle with zero runtime external dependencies (built by `npm run build-api`) |

---

## Test Suite & Quality Verification

Museware is thoroughly tested with an automated suite covering unit, integration, token compliance, and end-to-end export compilation:

- **Vitest Suite**: **117 test files**, **719 tests** (100% passing).
- **Zero Raw Hex Policy**: `npm run check:tokens` enforces that no raw hex or hardcoded color exists outside `src/design/mw.css`, and validates WCAG AA contrast across all light and dark token pairs.
- **API Artifact Integrity**: `npm run check:api:fresh` and `npm run check:api` boot the production serverless bundle in an isolated Node process and verify `/health`, `/status`, and `/keytest` before deployment.
- **Real Compilation Export Test**: `npm run check:export` generates a full React application from the canvas, unpacks it into a temporary environment, and executes `tsc --noEmit` and `vite build` to guarantee exported code compiles cleanly without errors.

```bash
npm run typecheck    # tsc --noEmit
npm test             # run the full Vitest suite
npm run check:tokens # verify design token consistency and WCAG AA contrast
npm run build-api    # bundle server/ into api/muse/[...path].js
npm run check:api    # verify the serverless bundle boots and answers
npm run check:dist   # verify production build contains no leaked keys or maps
npm run check:export # compile and build an exported app through Vite
```

---

## Deploying to Vercel

```bash
vercel            # deploy preview
vercel --prod     # deploy production
```

1. In your **Vercel Project Dashboard**, navigate to **Settings → Environment Variables**.
2. Add `MUSE_API_KEY` (and optionally `MUSE_DAILY_CAP=5` and `MUSE_LIVE=1`). Ensure the environment scope includes **Production** and **Preview**.
3. Redeploy the project. Vercel automatically runs `npm run build` and serves the static frontend alongside the serverless `/api/muse/*` proxy handler.
