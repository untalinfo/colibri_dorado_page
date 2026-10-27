---
name: higgsfield-safe-pipeline
description: >
  Generates images and videos via Higgsfield API safely without double-billing or timeout retries.
  Validates requirements, suggests or refines prompts, compares model costs/quality trade-offs,
  asks user confirmation before dispatch, and executes with detached polling and job ledger tracking.
---

# Higgsfield Safe Pipeline (Anti-Double-Billing & Model Optimizer)

Generates images and videos through Higgsfield safely, avoiding accidental credit burns, duplicate requests from timeout retries, and mismatched model choices.

---

## The Core Problem: Why Double-Billing Happens

In the `@higgsfield/client` SDK, `subscribe()` wraps `client.post()` in a retry mechanism (`retryWithBackoff`) that checks for network and timeout errors:
```typescript
if (error instanceof axios.AxiosError) {
  const isRetryable = error.code === 'ECONNRESET' ||
                      error.code === 'ETIMEDOUT' ||
                      (error.response && error.response.status >= 500);
  if (!isRetryable) throw error;
}
```

### The Failure Cascade:
1. When generating high-resolution video or during peak API loads, the initial HTTP POST connection can take longer than the client's axios timeout.
2. Axios triggers `ETIMEDOUT` / `ECONNABORTED`.
3. The SDK interprets this as a network drop and **automatically re-sends the POST request**.
4. Meanwhile, the Higgsfield backend **already received and queued the first job**.
5. Result: **Two concurrent jobs are created for the exact same prompt, consuming 2x credits** (or more if retries continue).
6. If `withPolling: true` is used, the single call blocks for 5–15 minutes; if aborted or restarted by the user or CI, previous jobs remain unmonitored and orphaned.

---

## The Architectural Solution: 5 Invariant Rules

1. **Decoupled Submit & Poll**: NEVER use `withPolling: true` on long jobs. Always submit with `withPolling: false` to get the `request_id` within 2–5 seconds.
2. **Zero-Retry Submission (`maxRetries: 0`)**: Ensure the HTTP POST submission never retries automatically on timeout. If submission fails, verify before retrying.
3. **Idempotent Polling via Read-Only GET**: Poll `GET https://api.higgsfield.ai/requests/{requestId}/status`. Read operations are idempotent, free, and cannot spawn duplicate generations.
4. **Local Job Ledger (`.higgsfield_jobs.json`)**: Every submitted `request_id` must be recorded locally with its prompt, model, and timestamp *before* polling begins. If the terminal closes, resume polling with `--resume <request_id>`.
5. **Pre-Execution Confirmation Gate**: Never submit a job without verifying the prompt, validating model parameters, displaying the credit/time trade-off, and getting explicit user approval.

---

## Workflow Steps

### Step 1 — Media Qualification & Requirements Intake
Determine what the user actually needs:
- **Media Type**: Image or Video?
- **Generation Mode**: Text-to-Media, Image-to-Video, or Video-to-Video?
- **Aspect Ratio**: `16:9` (landscape/cinematic), `9:16` (mobile/social), `1:1` (square), `3:2` (diorama/still)?
- **Target Resolution**: `720p`, `1080p`, or `2k`/`4k`?
- **Priority**: Cost-saving / fast iteration vs. Maximum visual fidelity?

### Step 2 — Model Evaluation & Trade-off Matrix
Consult [references/models-matrix.md](./references/models-matrix.md) to select candidates:

| Category | Model | Best For | Trade-offs & Constraints | Relative Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Video (Top)** | `bytedance/seedance-2.5/text-to-video` | Photorealistic documentary, cinematic lighting, complex fluid physics | 3–8 min render time, stricter NSFW filter | High (~25–70 credits) |
| **Video (Balanced)**| `kling3_0` / Kling 1.5 | Human motion, action, flexible safety filter | Native 720p (no upscale param), sound defaults on | Medium (~15–30 credits) |
| **Video (Draft/Fast)**| `bytedance/seedance-2.0/mini` | Fast concept test, pre-visualization | 720p only, less micro-detail | Low (~8–15 credits) |
| **Video (Camera)** | `/v1/image2video/dop` (`dop-turbo`) | Micro-camera pans/zooms over a still image | Short duration (3–5s), requires source image | Low-Medium |
| **Image (Top)** | `flux-pro/kontext/max/text-to-image` | Hyper-detailed textures, perfect typography/labels | Slower, higher cost | Medium-High |
| **Image (Fast)** | `gpt_image_2` / Flux Schnell | Rapid ideation, clean diorama cutout backgrounds | Less typographic precision | Low |

### Step 3 — Prompt Engineering & Suggestion
Inspect the user's prompt using [references/prompt-engineering.md](./references/prompt-engineering.md):
- **If the user provides a prompt**:
  - Check for camera movement, lighting, subject specificity, and negative constraints.
  - Refine it to avoid typical AI artifacts (morphing, unwanted text, jitter).
- **If the user does NOT have a prompt**:
  - Ask 1–2 clarifying questions about subject and mood, OR
  - Present **3 distinct, optimized options** (e.g. Option A: Cinematic Documentary, Option B: Editorial Commercial, Option C: Minimalist Organic).

### Step 4 — User Confirmation Gate (Mandatory Stop)
STOP and present the proposal clearly before any API call:
1. **Selected/Refined Prompt**
2. **Recommended Model & Why**
3. **Alternative Models & Trade-offs (Cost vs. Speed vs. Fidelity)**
4. **Output Specs** (Duration, Resolution, Aspect Ratio)
5. **Confirmation Question**: Ask the user to confirm the model choice and prompt. **Wait for their reply**.

### Step 5 — Safe Execution, Asset Persistence & Web Optimization
Once confirmed, run the generation using the safe runner script. By default, it automatically:
1. Submits safely with `withPolling: false` and zero timeout retries.
2. Polls via decoupled read-only GET.
3. Downloads the master media to local disk.
4. **Optimizes for Web Delivery**:
   - **Videos**: Injects Fast-Start (`moov` atom at the beginning for instant progressive playback) and compresses bitrate.
   - **Images**: Converts to high-efficiency WebP (`quality: 82`) and strips metadata.
   - See [references/web-optimization.md](./references/web-optimization.md) for full benchmarks and frontend integration snippets.

```bash
npx tsx .agent/skills/higgsfield-safe-pipeline/scripts/safe-runner.ts \
  --model "bytedance/seedance-2.5/text-to-video" \
  --prompt "<APPROVED_PROMPT>" \
  --aspect_ratio "16:9" \
  --resolution "720p" \
  --duration 10 \
  --output-dir "public/assets" \
  --filename "hero-background"
```

To skip the optimization pass if you strictly want the raw uncompressed master:
```bash
npx tsx .agent/skills/higgsfield-safe-pipeline/scripts/safe-runner.ts \
  --prompt "<APPROVED_PROMPT>" \
  --no-optimize
```

### Step 6 — Local Verification & Link Integration
- Check the optimization report output (file sizes, bandwidth savings, and poster paths).
- Use the optimized web path (e.g. `/assets/hero-background-web.mp4` or `/assets/scene.webp`) in your HTML/React code.
- Both original and web-optimized paths are preserved in `.higgsfield_jobs.json`.


