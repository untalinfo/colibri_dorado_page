import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface OptimizationResult {
  originalPath: string;
  optimizedPath: string;
  posterPath?: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savingsPercent: number;
}

function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Optimizes an image (PNG/JPEG) to high-efficiency WebP.
 * Uses cwebp if installed, with automated fallback to Python Pillow.
 */
export async function optimizeImage(
  inputPath: string,
  options: { quality?: number; targetPath?: string } = {},
): Promise<OptimizationResult> {
  const quality = options.quality ?? 82;
  const originalSize = getFileSize(inputPath);
  const ext = path.extname(inputPath);
  const outputPath =
    options.targetPath ?? inputPath.replace(new RegExp(`${ext}$`), '.webp');

  const cwebpPath = hasCommand('cwebp')
    ? 'cwebp'
    : fs.existsSync('/opt/homebrew/bin/cwebp')
      ? '/opt/homebrew/bin/cwebp'
      : undefined;

  if (cwebpPath) {
    execSync(`"${cwebpPath}" -q ${quality} -m 6 -metadata none "${inputPath}" -o "${outputPath}"`, {
      stdio: 'pipe',
    });
  } else {
    // Fallback to Python PIL
    const pyScript = `
from PIL import Image
img = Image.open("${inputPath}")
if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
    img = img.convert("RGBA")
else:
    img = img.convert("RGB")
img.save("${outputPath}", "WEBP", quality=${quality}, method=6)
`;
    execSync(`python3 -c '${pyScript.replace(/\n/g, ' ')}'`, { stdio: 'pipe' });
  }

  const optSize = getFileSize(outputPath);
  const savings = originalSize > 0 ? ((originalSize - optSize) / originalSize) * 100 : 0;

  return {
    originalPath: inputPath,
    optimizedPath: outputPath,
    originalSizeBytes: originalSize,
    optimizedSizeBytes: optSize,
    savingsPercent: Math.max(0, Number(savings.toFixed(1))),
  };
}

/**
 * Optimizes video for web streaming:
 * - Injects Fast-Start (moov atom at start of file for instant progressive playback)
 * - Applies balanced web compression
 * - Extracts poster frame if ffmpeg is available
 */
export async function optimizeVideo(
  inputPath: string,
  options: { resolution?: string; muteAudio?: boolean; targetPath?: string } = {},
): Promise<OptimizationResult> {
  const originalSize = getFileSize(inputPath);
  const dir = path.dirname(inputPath);
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outputPath = options.targetPath ?? path.resolve(dir, `${basename}-web.mp4`);
  let posterPath: string | undefined;

  const hasFfmpeg = hasCommand('ffmpeg');
  const hasAvconvert = hasCommand('avconvert') || fs.existsSync('/usr/bin/avconvert');

  if (hasFfmpeg) {
    // 1. Full ffmpeg optimization with fast-start & web CRF
    const crf = '23';
    const audioFlag = options.muteAudio ? '-an' : '-c:a aac -b:a 128k';
    const scaleFlag = options.resolution === '720p' ? '-vf "scale=-2:720"' : '';

    execSync(
      `ffmpeg -y -i "${inputPath}" -c:v libx264 -crf ${crf} -preset slow -pix_fmt yuv420p -movflags +faststart ${scaleFlag} ${audioFlag} "${outputPath}"`,
      { stdio: 'pipe' },
    );

    // 2. Extract frame 0 for poster image
    const tempPoster = path.resolve(dir, `${basename}-poster.jpg`);
    posterPath = path.resolve(dir, `${basename}-poster.webp`);
    try {
      execSync(`ffmpeg -y -ss 00:00:00.500 -i "${inputPath}" -vframes 1 -q:v 2 "${tempPoster}"`, {
        stdio: 'pipe',
      });
      await optimizeImage(tempPoster, { targetPath: posterPath, quality: 80 });
      if (fs.existsSync(tempPoster)) fs.unlinkSync(tempPoster);
    } catch {
      posterPath = undefined;
    }
  } else if (hasAvconvert) {
    // macOS native avconvert with built-in Fast-Start
    const avconvertPath = fs.existsSync('/usr/bin/avconvert') ? '/usr/bin/avconvert' : 'avconvert';
    const preset = options.resolution === '1080p' ? 'Preset1920x1080' : 'Preset1280x720';

    execSync(`"${avconvertPath}" --source "${inputPath}" --preset ${preset} --output "${outputPath}" --replace`, {
      stdio: 'pipe',
    });
  } else {
    throw new Error('Neither ffmpeg nor avconvert is available on this system for video optimization.');
  }

  const optSize = getFileSize(outputPath);
  const savings = originalSize > 0 ? ((originalSize - optSize) / originalSize) * 100 : 0;

  return {
    originalPath: inputPath,
    optimizedPath: outputPath,
    posterPath,
    originalSizeBytes: originalSize,
    optimizedSizeBytes: optSize,
    savingsPercent: Math.max(0, Number(savings.toFixed(1))),
  };
}

// CLI Direct Execution Support
if (process.argv[1] && process.argv[1].endsWith('optimize-media.ts')) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log('Usage: npx tsx scripts/optimize-media.ts <path-to-media-file>');
    process.exit(1);
  }

  const isVideo = filePath.endsWith('.mp4') || filePath.endsWith('.mov') || filePath.endsWith('.m4v');

  console.log(`[Optimizer] Processing ${filePath}...`);
  const promise = isVideo ? optimizeVideo(filePath) : optimizeImage(filePath);

  promise
    .then((res) => {
      const origMb = (res.originalSizeBytes / (1024 * 1024)).toFixed(2);
      const optMb = (res.optimizedSizeBytes / (1024 * 1024)).toFixed(2);
      console.log('\n--- WEB OPTIMIZATION REPORT ---');
      console.log(`Original:   ${res.originalPath} (${origMb} MB)`);
      console.log(`Optimized:  ${res.optimizedPath} (${optMb} MB)`);
      if (res.posterPath) {
        console.log(`Poster:     ${res.posterPath} (LCP Ready)`);
      }
      console.log(`Bandwidth Savings: ${res.savingsPercent}%`);
      console.log('------------------------------');
    })
    .catch((err) => {
      console.error('[Optimizer Error]:', (err as Error).message);
      process.exit(1);
    });
}
