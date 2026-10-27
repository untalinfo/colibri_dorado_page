import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, higgsfield } from '@higgsfield/client/v2';
import dotenv from 'dotenv';

// Load .env.local without exposing credentials
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const credentials = process.env.HF_CREDENTIALS;

if (!credentials) {
  console.error(
    'Error: HF_CREDENTIALS is not defined in .env.local.\n' +
      'Please add HF_CREDENTIALS="key-id:key-secret" to .env.local.',
  );
  process.exit(1);
}

config({
  credentials,
  maxPollTime: 900000,
  pollInterval: 5000,
});

async function runSeedanceGeneration() {
  const model = 'bytedance/seedance-2.5/text-to-video';
  const input = {
    prompt:
      'Ultra slow motion cinematic shot of an Andean cloud forest in morning mist, locked-off tripod camera with almost imperceptible ambient breathing, soft warm golden sunbeams piercing through ancient mossy trees. Tiny luminous specks of golden pollen and botanical dust gently drifting and floating weightlessly in the misty air. A couple of tiny honeybees softly hovering in slow motion between mountain dew drops and lush green flora. Serene, meditative tempo, delicate organic lighting, seamless continuous loop style, rich 4k botanical documentary texture. Constraints: no camera shake, no abrupt cuts or jump cuts, no fast motion, no morphing or warping artifacts, no cartoon or 3D CGI rendering, no text or watermark overlays',
    duration: 10,
    resolution: '720p',
    aspect_ratio: '16:9',
  };

  console.log(`Submitting generation request to model: ${model}...`);
  console.log('Parameters:', JSON.stringify(input, null, 2));

  try {
    // Submit with withPolling: false to immediately capture request_id
    const submission = await higgsfield.subscribe(model, {
      input,
      withPolling: false,
    });

    const requestId = submission.request_id;
    console.log(`Job submitted successfully! Request ID: ${requestId}`);
    console.log(`Initial Status: ${submission.status}`);

    if (!requestId) {
      console.error('No request_id returned in submission response:', submission);
      process.exit(1);
    }

    // Poll status with progress updates (up to 15 minutes)
    const [apiKey, apiSecret] = credentials.split(':');
    const startTime = Date.now();
    const maxPollTimeMs = 900000; // 15 minutes

    let completedPayload: Record<string, unknown> | null = null;

    while (Date.now() - startTime < maxPollTimeMs) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      const res = await fetch(`https://api.higgsfield.ai/requests/${requestId}/status`, {
        headers: {
          Authorization: `Key ${apiKey}:${apiSecret}`,
          'User-Agent': 'higgsfield-server-js/2.0',
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        console.warn(`[${elapsedSec}s] Warning: HTTP ${res.status} from status endpoint`);
        continue;
      }

      const data = (await res.json()) as {
        status: string;
        video?: { url: string };
        videos?: Array<{ url: string }>;
        request_id?: string;
      };

      console.log(`[${elapsedSec}s] Status: ${data.status}`);

      if (data.status === 'completed') {
        completedPayload = data as Record<string, unknown>;
        break;
      } else if (data.status === 'failed') {
        console.error(`Generation failed. Request ID: ${requestId}`);
        process.exit(1);
      } else if (data.status === 'nsfw') {
        console.error(`Generation flagged as NSFW. Request ID: ${requestId}`);
        process.exit(1);
      } else if (data.status === 'canceled') {
        console.error(`Generation canceled. Request ID: ${requestId}`);
        process.exit(1);
      }
    }

    if (!completedPayload) {
      console.error('Polling exceeded 15 minutes timeout.');
      process.exit(1);
    }

    const videoUrl =
      (completedPayload.video as { url?: string })?.url ||
      (completedPayload.videos as Array<{ url: string }>)?.[0]?.url;

    if (videoUrl) {
      console.log('SUCCESS! Generated Video URL:', videoUrl);
      return videoUrl;
    }

    console.error('Completed payload did not contain video URL:', completedPayload);
    process.exit(1);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('API Error during execution:', message);
    process.exit(1);
  }
}

runSeedanceGeneration();
