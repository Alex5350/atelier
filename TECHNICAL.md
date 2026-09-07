# Atelier: technical notes

Companion to the [README](README.md). This is where the engineering detail lives: how the model registry works, what implementing the AI SDK provider interfaces by hand taught us, how the budget gate and cost ledger stay honest, and the traps that cost real time. Line references are to files in this repo.

## Architecture at a glance

```
Next.js App Router (Bun runtime)
├── src/app/api/*          route handlers: chat, files, passes, assets, video, usage, models
├── src/lib/models         registry core (pure), demo providers, server resolution
├── src/lib/files          extract → chunk → embed → hybrid search
├── src/lib/studio         pass creation/run, image tools (sharp), lineage queries
├── src/lib/video          VideoProvider port: demo (ffmpeg) + Sora/Veo adapters
├── src/lib/usage          budgetDecision (pure), ledger queries
├── src/lib/storage        Storage port, LocalDiskStorage (content-addressed)
└── src/db + drizzle/      Drizzle schema, SQL migrations incl. one hand-written trigger
        │
        ▼
PostgreSQL 17 + pgvector (docker, port 5433)
```

Two ports isolate the outside world: `Storage` (put/get bytes; one implementation, local content-addressed blobs under `.data/`) and `VideoProvider` (submit/poll; three implementations). The AI SDK plays the same role for text, images, and embeddings.

## The model registry

Models are rows, not config files. `src/db/schema.ts` defines `models` (id like `anthropic/claude-sonnet-4-6`, provider, modality, modelName, contextWindow, capabilities, enabled, isMock) and `model_prices` (per-unit input/output price, `effectiveFrom`, unique index on model+effectiveFrom). Prices are append-only: the admin form inserts a new row with a later `effectiveFrom`, and `priceEffectiveAt` in `src/lib/models/registry.ts` picks the latest row at or before the call time. A price correction never rewrites what yesterday's usage events already recorded, because `writeUsageEvent` (`src/lib/usage/queries.ts`) copies the price onto the event.

`registry.ts` is pure and unit-tested with no database: `providerStatuses(env)` maps provider names to which API key would light them up, `availability()` turns that into per-model states (available / needs-key / disabled), and the choice builders order the picker so demo models lead only when their modality has no live alternative. The server half (`src/lib/models/server.ts`) resolves rows into AI SDK objects and throws a typed `RegistryError` with a code (`needs-key`, `unknown-model`, `wrong-modality`) that routes map to specific status codes, so the UI can say "add an OpenAI key" instead of surfacing a 500.

## Demo providers: implementing the provider interfaces

Zero-key operation is not a mock at the route layer; the demo models are real provider implementations of the AI SDK's interfaces, which is what makes the whole surface (streaming, generation, pricing, the admin page) exercise identical code paths.

- `src/lib/models/mock-model.ts` implements the chat `LanguageModelV4` interface: `supportedUrls`, `doStream` returning a `ReadableStream` of typed parts (`stream-start`, `text-start`/`text-delta`/`text-end`, `finish`, `raw`). Reply content is a deterministic function of the prompt hash and turn parity, so an e2e assertion can pin exact strings. Traps honored the hard way: `finishReason` must be an object `{ unified: "stop", raw: ... }`, `usage` is a nested object, and `specificationVersion` is `"v4"`.
- `src/lib/models/mock-image.ts` implements `ImageModelV4` (`doGenerate` returning `image.uint8Array`, response `{ timestamp, modelId, headers }`). The image is an SVG composition (hash-derived palette, shapes, seed label, DEMO watermark) rasterized by sharp. `mock-image.test.ts` pins PNG magic bytes, requested dimensions (parsed from the PNG IHDR, since the result carries no width/height), and byte-identical output per seed.

## Chat route internals

`src/app/api/chat/route.ts` does the full turn in one handler:

1. Auth via better-auth session, model row fetch, registry resolution (typed errors → 400/409).
2. Conversation adoption: the client sends `conversationId: "pending"` for a new chat; the created id rides back in every message's `messageMetadata`, so the page swaps in the shareable URL without a reload.
3. Idempotent persistence: the incoming user turn is saved by message id, so a regenerate that resends history is a no-op for already-stored turns; a first user turn also titles the conversation.
4. Attachments: `{ id, mode }[]`, owner-scoped. Context mode builds a labeled block from extracted text (unpdf for PDFs; long documents truncate head+tail). Retrieval mode runs hybrid search and injects a citations block; both flow through streamText's `system` option, because v7 rejects `system` entries inside `messages`.
5. Budget gate (below), then `streamText` → `toUIMessageStreamResponse` with an `onFinish` that persists exactly what streamed (on abort, the partial) and writes the usage event with real token counts.

## Files and hybrid retrieval

`src/lib/files/` is a small pipeline. `chunk.ts` splits extracted text into ~1800-character chunks with 15% overlap; indexing embeds all chunks in one `embedMany` call into `file_chunks.vector(1536)`. Search (`retrieval.ts`) runs pgvector cosine similarity and Postgres full-text search in parallel and fuses them with reciprocal rank fusion (k=60), which is why a query matching a rare literal string finds its chunk even when the embedding disagrees. Citations render as `filename#c3` so replies point back at the uploaded file.

## Studio: passes, review gating, lineage

The data model (`src/db/schema.ts`) is append-only where it matters:

- A **pass** is a row (kind: generate/inpaint/outpaint/upscale, settings JSONB, status). Running a pass produces **assets**; regenerating flips `isActive` on superseded assets rather than deleting them.
- **Review gating** is enforced three layers deep: the pass-creation API requires tool passes to cite an approved base; the run route re-checks; and `drizzle/0007_bitter_sleepwalker.sql` installs a `BEFORE INSERT` trigger on `asset_references` that rejects any reference to a non-approved asset at the database level. The trigger's message surfaces verbatim as the API error, so the UI explains itself.
- **Lineage** (`lineageEdges` in `src/lib/studio/queries.ts`) walks asset_references into DAG edges; the graph component renders solid edges for base references and dashed for style references.

Tool passes run through a compositing seam rather than provider-native image editing, because this AI SDK version's `generateImage` takes no reference images or mask: `src/lib/studio/tools.ts` computes padding metrics (clamped 10-100%), extends the canvas with sharp, and builds an SVG mask whose white region marks what to fill; `run-tools.ts` generates at target size and composites only where the mask is opaque. Upscale is lanczos3 through sharp.

One trap worth remembering: `listProjects` needs table-qualified column names in its subselects. Drizzle's `sql` template rendered unqualified `id` inside correlated subqueries, and Postgres threw `42702 ambiguous column`; the fix is literal SQL strings like `(select count(*) from passes where passes.project_id = projects.id)::int`. Another: base-nova's `render={<Link/>}` already makes the component the link, so wrapping the children in a second `<Link>` produces nested anchors, which the browser splits apart mid-DOM; the sidebar shipped that way briefly (a double-height nav row, a clipped tagline, a highlight escaping the rail) until a real-browser pass caught it. Children go directly inside the rendered element.

## Video: a port with three implementations

`src/lib/video/port.ts` defines `VideoProvider.submit(input) → { jobId }` and `poll(jobId) → status | done(bytes)`. The demo provider renders a real mp4 with ffmpeg-static (2.5s window, drawtext title card, palette derived from the prompt hash). The Sora and Veo adapters are thin, typed fetch clients (poll shape differences absorbed per adapter). The submit route is budget-gated per second and requires an approved first frame if one is supplied; the poll route stores the clip, writes the ledger row, and logs activity only once, on the transition to done.

ffmpeg traps: it rejects `hsl(...)` color strings, so the renderer converts to `0xRRGGBB` (`hslHex`); and the bundler rewrites the binary's path at build time, fixed with `serverExternalPackages: ["ffmpeg-static", "sharp"]` in `next.config.ts` plus a defensive resolver (env override → cwd node_modules → system paths → package export).

## The budget gate and ledger

`src/lib/usage/core.ts` holds the pure decision: `budgetDecision(spent, cap, estimate)` refuses when `spent + estimate` exceeds the cap (inclusive at the boundary) and always allows free models. Estimates are per-modality: `approxTokens` (chars/4) priced per million for text, per-image for batches, per-second for video. Refusals return 402 with the arithmetic in the payload (`$2.00 spent of the $2.00 cap, this call estimates $0.01`), and the usage page exposes the same numbers per model, per conversation, and over 30 days.

The gate is intentionally conservative: it runs before the call, on today's ledger total, without locking; concurrent requests can both pass and overshoot by one call. That is documented behavior for a single-user studio, not an accident.

## Auth

better-auth with the drizzle adapter: email/password, sessions, rate limiting on sign-in (this is why the e2e suite signs in once in a setup project and reuses storageState; repeated UI sign-ins trip the limiter and flake the suite). The schema needed the `verification` table and an `issuer` column that hand-writing the tables from docs had missed; migration 0005 carries them.

## Testing

- **Unit (bun test)**: registry availability and ordering, budget decision table, rate limiter windows and key isolation, mock generators (magic bytes, dimensions, determinism), file chunking and RRF, image tool metrics, fetch timeout behavior, URL inlining for both string and URL-instance file data.
- **E2E (Playwright)**: a setup project signs in once via the API and saves `e2e/.auth/state.json`; `gate.spec.ts` runs cookie-less for the anonymous redirect test; the app project covers chat streaming + reload persistence, file attachments in both modes with citation chips, the studio loop (generate, gate, approve, tool pass, export, regenerate), the video render, and a guardrails spec (typed 400/409/404, per-user 429 under a throwaway account, security headers). `scripts/e2e.sh` builds and boots the production server first, so the suite tests the shipped artifact. The runner is `npx playwright test`; bun's runner failed to build the spec graph.
- The suite has caught four real defects that local clicking had not: the AI SDK's message conversion rejects relative file URLs (attachment turns 500'd), it wraps validated URLs in `URL` instances that a string-only type guard missed (so the inliner never ran and the SDK tried to download from localhost), the upload API omitted the attachment `mode` field (stranding the retrieval toggle on "context"), and the mask editor exported after the first stroke only. Each is pinned by a regression assertion or unit test now.
- `e2e/shots.mjs` (node) captures the screenshots in `docs/screenshots/` at device pixel ratio 2.
- **CI**: the verify job (typecheck, lint, unit tests, build, migrate, seed, schema smoke) and the e2e job run on every push, joined by a Security workflow (gitleaks over full history, CodeQL over the TypeScript sources, weekly schedule). Bun is pinned to 1.4.1 so runs are reproducible.

## Hardening layer

The API boundary treats abuse as a feature requirement, not an afterthought:

- **Rate limiting** (`src/lib/rate-limit.ts`): fixed-window, per user, in front of every cost-bearing endpoint (chat 30/min, pass runs 10/min, video submits 5/min, uploads 20/min). Refusals are typed 429s with a `retry-after`. Single-node by design, matching the app's honest-scope posture; the budget gate caps dollars, this caps request rate.
- **Security headers** (`next.config.ts`): nosniff, strict referrer policy, DENY framing, a locked-down permissions policy, and a conservative CSP (`default-src 'self'`, no plugin content, `frame-ancestors 'none'`). Scripts and styles keep `'unsafe-inline'` because Next's hydration bootstrap is inline; nonces are the documented next step.
- **Body hardening** (`src/lib/api.ts`): every JSON POST parses through one guard, so malformed payloads are a typed 400 (this is also the edge a cross-site form hits) rather than a 500.
- **Bounded provider calls** (`src/lib/video/fetch-with-timeout.ts`): every adapter fetch carries a 30s `AbortSignal.timeout`, and a hung provider fails with a message that names the timeout. Unit-tested against a local server that never responds.
- **Export gating**: the export route enforces the same approval rule as the reference trigger (what has not been reviewed is not shippable), and the studio timeline exposes the export button only on approved assets.

## Decisions worth stealing

- **Demo models as provider implementations** rather than route-level ifs kept every feature honest: pricing, gating, and the admin page cannot tell the difference, so they cannot drift for real providers.
- **Append-only pricing + usage events that pin prices** makes the ledger an audit log instead of a report that changes when prices do.
- **The trigger as the last line of gating.** API-level checks are convenient but bypassable by construction; a `BEFORE INSERT` trigger is not.
- **`test-results/` is gitignored; `.data/` (blobs, auth state) is gitignored; `.env.example` is committed with safe placeholders only.** No secret material has ever been committed; provider keys are optional by design.
