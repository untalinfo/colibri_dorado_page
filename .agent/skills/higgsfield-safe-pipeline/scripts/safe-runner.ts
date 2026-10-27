import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, higgsfield } from '@higgsfield/client/v2';
import dotenv from 'dotenv';
import { optimizeImage, optimizeVideo } from './optimize-media';

// 1. Resolve paths & load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');
const envPath = path.resolve(rootDir, '.env.local');
const ledgerPath = path.resolve(rootDir, '.higgsfield_jobs.json');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const credentials = process.env.HF_CREDENTIALS;

interface JobRecord {
  requestId: string;
  model: string;
  prompt: string;
  status: 'pending' | 'completed' | 'failed' | 'nsfw' | 'canceled';
  createdAt: string;
  updatedAt: string;
  parameters: Record<string, unknown>;
  outputUrl?: string;
  localPath?: string;
  optimizedPath?: string;
  posterPath?: string;
  error?: string;
}

// 2. Ledger Helpers (Persistent Job History & Idempotency)
function readLedger(): Record<string, JobRecord> {
  try {
    if (fs.existsSync(ledgerPath)) {
      return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    }
  } catch {
    // Ignore corrupted ledger read
  }
  return {};
}

function updateLedger(record: JobRecord) {
  const ledger = readLedger();
  ledger[record.requestId] = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf8');
}

// 3. Asset Downloader (Guarantees local persistence against S3 URL expiration)
async function downloadAsset(
  url: string,
  model: string,
  requestId: string,
  options: { outputDir?: string; customFilename?: string; skipDownload?: boolean },
): Promise<string | undefined> {
  if (options.skipDownload) {
    console.log('[Asset Manager] Skipping local download (--skip-download specified).');
    return undefined;
  }

  // Determine media extension
  let ext = '.mp4';
  if (url.includes('.png')) ext = '.png';
  else if (url.includes('.webp')) ext = '.webp';
  else if (url.includes('.jpg') || url.includes('.jpeg')) ext = '.jpg';
  else if (model.includes('image')) ext = '.png';

  // Determine destination directory
  const defaultDir = fs.existsSync(path.resolve(rootDir, 'public'))
    ? path.resolve(rootDir, 'public/generated')
    : path.resolve(rootDir, 'output');
  const targetDir = options.outputDir ? path.resolve(rootDir, options.outputDir) : defaultDir;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Determine destination filename
  const cleanModel = model.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = options.customFilename
    ? (options.customFilename.endsWith(ext) ? options.customFilename : `${options.customFilename}${ext}`)
    : `${timestamp}_${cleanModel}_${requestId.slice(0, 8)}${ext}`;

  const destinationPath = path.resolve(targetDir, filename);

  console.log(`\n[Asset Manager] Downloading media to prevent S3 URL expiration...`);
  console.log(`Source CDN:   ${url}`);
  console.log(`Destination:  ${destinationPath}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));

    const sizeMb = (fs.statSync(destinationPath).size / (1024 * 1024)).toFixed(2);
    console.log(`[Asset Manager] Download complete! Size: ${sizeMb} MB`);
    return destinationPath;
  } catch (err: unknown) {
    console.error(`[Asset Manager] Warning: Failed to download asset: ${(err as Error).message}`);
    console.error(`The S3 URL is still valid temporarily: ${url}`);
    return undefined;
  }
}

// 4. Asset Optimizer Handler
async function handleOptimization(
  localPath: string,
  skipOptimization: boolean,
): Promise<{ optimizedPath?: string; posterPath?: string }> {
  if (skipOptimization) {
    console.log('[Optimizer] Skipping web optimization pass (--no-optimize specified).');
    return {};
  }

  try {
    console.log('\n[Optimizer] Running automated web performance pass...');
    const isVideo = localPath.endsWith('.mp4') || localPath.endsWith('.mov') || localPath.endsWith('.m4v');
    const optRes = isVideo ? await optimizeVideo(localPath) : await optimizeImage(localPath);

    const origMb = (optRes.originalSizeBytes / (1024 * 1024)).toFixed(2);
    const optMb = (optRes.optimizedSizeBytes / (1024 * 1024)).toFixed(2);
    console.log(`[Optimizer] Complete! ${origMb} MB -> ${optMb} MB (${optRes.savingsPercent}% bandwidth savings)`);
    console.log(`[Optimizer] Web Delivery File: ${optRes.optimizedPath}`);
    if (optRes.posterPath) {
      console.log(`[Optimizer] LCP Poster Image:  ${optRes.posterPath}`);
    }
    return {
      optimizedPath: optRes.optimizedPath,
      posterPath: optRes.posterPath,
    };
  } catch (err) {
    console.warn('[Optimizer] Warning: Web optimization pass failed:', (err as Error).message);
    return {};
  }
}

// 5. Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[i + 1];
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

// 6. Decoupled Polling Implementation (Pure GET, Safe, Idempotent)
async function pollJobStatus(
  requestId: string,
  apiKey: string,
  apiSecret: string,
  maxMinutes = 15,
): Promise<{ status: string; url?: string }> {
  const startTime = Date.now();
  const maxTimeMs = maxMinutes * 60 * 1000;
  console.log(`\n[Polling] Tracking request ${requestId} via read-only GET (max ${maxMinutes}m)...`);

  while (Date.now() - startTime < maxTimeMs) {
    await new Promise((r) => setTimeout(r, 6000));
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);

    try {
      const res = await fetch(`https://api.higgsfield.ai/requests/${requestId}/status`, {
        headers: {
          Authorization: `Key ${apiKey}:${apiSecret}`,
          'User-Agent': 'higgsfield-safe-pipeline/1.0',
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        console.warn(`[${elapsedSec}s] HTTP ${res.status} from status endpoint. Retrying status check...`);
        continue;
      }

      const data = (await res.json()) as {
        status: string;
        video?: { url: string };
        videos?: Array<{ url: string }>;
        image?: { url: string };
        images?: Array<{ url: string }>;
        detail?: string;
      };

      console.log(`[${elapsedSec}s] Current Status: ${data.status}`);

      if (data.status === 'completed') {
        const url =
          data.video?.url ||
          data.videos?.[0]?.url ||
          data.image?.url ||
          data.images?.[0]?.url;
        return { status: 'completed', url };
      }

      if (data.status === 'failed' || data.status === 'nsfw' || data.status === 'canceled') {
        return { status: data.status, url: undefined };
      }
    } catch (err) {
      console.warn(`[${elapsedSec}s] Transient network error while polling status:`, (err as Error).message);
    }
  }

  throw new Error(`Polling timed out after ${maxMinutes} minutes. Job is still processing on Higgsfield.`);
}

// 7. Main Execution Flow
async function main() {
  const flags = parseArgs();

  if (flags['help'] || flags['h']) {
    console.log(`
Higgsfield Safe Runner - Anti-Double-Billing Execution, Asset Persistence & Web Optimizer
Usage:
  npx tsx scripts/safe-runner.ts [options]

Core Options:
  --model <name>          Model endpoint (e.g. bytedance/seedance-2.5/text-to-video)
  --prompt <string>       Generation prompt
  --aspect_ratio <ratio>  16:9, 9:16, 1:1, 3:2 (default: 16:9)
  --resolution <res>      720p, 1080p (default: 720p)
  --duration <seconds>    5, 10 (default: 10)

Asset & Optimization Options:
  --output-dir <path>     Directory to download asset (default: public/generated or output/)
  --filename <name>       Custom filename for downloaded asset
  --skip-download         Do not download locally, return remote S3 URL only
  --no-optimize           Skip WebP conversion and Fast-Start video streaming compression

Recovery & Validation:
  --dry-run               Validate params & connection without firing job
  --resume <request_id>   Resume monitoring, downloading and optimizing an existing job
`);
    process.exit(0);
  }

  if (!credentials) {
    console.error('Error: HF_CREDENTIALS environment variable missing in .env.local.');
    console.error('Format required: HF_CREDENTIALS="key-id:key-secret"');
    process.exit(1);
  }

  const [apiKey, apiSecret] = credentials.split(':');
  if (!apiKey || !apiSecret) {
    console.error('Error: HF_CREDENTIALS malformed. Expected "key-id:key-secret"');
    process.exit(1);
  }

  // Resume mode
  if (flags['resume']) {
    const resumeId = String(flags['resume']);
    console.log(`Resuming monitoring for request_id: ${resumeId}`);
    const ledger = readLedger();
    const existing = ledger[resumeId];

    const result = await pollJobStatus(resumeId, apiKey, apiSecret);
    if (result.status === 'completed' && result.url) {
      console.log('\n[SUCCESS] Media ready on CDN:', result.url);

      const localPath = await downloadAsset(result.url, existing?.model || 'unknown', resumeId, {
        outputDir: flags['output-dir'] ? String(flags['output-dir']) : undefined,
        customFilename: flags['filename'] ? String(flags['filename']) : undefined,
        skipDownload: Boolean(flags['skip-download']),
      });

      let optData = {};
      if (localPath) {
        optData = await handleOptimization(localPath, Boolean(flags['no-optimize']));
      }

      if (existing) {
        updateLedger({
          ...existing,
          status: 'completed',
          outputUrl: result.url,
          localPath,
          ...optData,
        });
      }
      process.exit(0);
    } else {
      console.error(`\n[FAILED] Job finished with status: ${result.status}`);
      if (existing) {
        updateLedger({
          ...existing,
          status: result.status as JobRecord['status'],
        });
      }
      process.exit(1);
    }
  }

  // Submission mode
  const model = String(flags['model'] || 'bytedance/seedance-2.5/text-to-video');
  const prompt = String(flags['prompt'] || '');

  if (!prompt) {
    console.error('Error: --prompt is required when starting a new generation.');
    process.exit(1);
  }

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: flags['aspect_ratio'] || '16:9',
  };

  // Add video specific params if model is video
  if (model.includes('video')) {
    input['duration'] = Number(flags['duration'] || 10);
    if (!model.includes('kling')) {
      input['resolution'] = flags['resolution'] || '720p';
    }
  }

  console.log('--- HIGGSFIELD SAFE RUNNER PRE-FLIGHT ---');
  console.log(`Model:        ${model}`);
  console.log(`Parameters:   ${JSON.stringify(input, null, 2)}`);
  console.log('Safety:       maxRetries=0 (Zero timeout retry duplication)');
  console.log('Mode:         withPolling=false (Immediate request_id capture)');
  console.log('Asset Policy: Automatic download & Web Optimization enabled');
  console.log('----------------------------------------');

  if (flags['dry-run']) {
    console.log('[DRY-RUN] Pre-flight validation passed. No request dispatched.');
    process.exit(0);
  }

  // Configure client with maxRetries: 0 to prevent Axios from re-sending POST on timeout!
  config({
    credentials,
    maxRetries: 0,
    timeout: 30000, // 30s timeout for job submission ACK
  });

  console.log('\n[Dispatch] Submitting generation job to Higgsfield...');

  let submission: { request_id?: string; status?: string };
  try {
    submission = (await higgsfield.subscribe(model, {
      input,
      withPolling: false, // Invariant rule: Never block on the POST request
    })) as { request_id?: string; status?: string };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || String(err);
    console.error('\n[FATAL] Job submission failed:', errorMsg);
    console.error('Zero automatic retries executed. Your credits were protected from double-billing.');
    process.exit(1);
  }

  const requestId = submission?.request_id;
  if (!requestId) {
    console.error('Error: No request_id returned by API:', submission);
    process.exit(1);
  }

  console.log(`[ACK] Job submitted successfully!`);
  console.log(`Request ID: ${requestId}`);
  console.log(`Initial Status: ${submission.status}`);

  // Save to Job Ledger immediately before polling
  const jobRecord: JobRecord = {
    requestId,
    model,
    prompt,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parameters: input,
  };
  updateLedger(jobRecord);
  console.log(`[Ledger] Saved job to ${ledgerPath}`);

  // Begin safe polling
  const result = await pollJobStatus(requestId, apiKey, apiSecret);

  if (result.status === 'completed' && result.url) {
    console.log('\n========================================');
    console.log('✨ GENERATION SUCCESSFUL!');
    console.log(`CDN URL: ${result.url}`);

    // 1. Download asset locally to prevent S3 link expiry
    const localPath = await downloadAsset(result.url, model, requestId, {
      outputDir: flags['output-dir'] ? String(flags['output-dir']) : undefined,
      customFilename: flags['filename'] ? String(flags['filename']) : undefined,
      skipDownload: Boolean(flags['skip-download']),
    });

    // 2. Perform Web Optimization pass (Fast-Start video / WebP conversion)
    let optData: { optimizedPath?: string; posterPath?: string } = {};
    if (localPath) {
      optData = await handleOptimization(localPath, Boolean(flags['no-optimize']));
    }

    console.log('========================================');

    updateLedger({
      ...jobRecord,
      status: 'completed',
      outputUrl: result.url,
      localPath,
      ...optData,
    });
    process.exit(0);
  } else {
    console.error(`\n❌ Job ended with non-success status: ${result.status}`);
    updateLedger({
      ...jobRecord,
      status: result.status as JobRecord['status'],
      error: `Job finished with status ${result.status}`,
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled script error:', err);
  process.exit(1);
});
