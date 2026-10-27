import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Cargar variables de entorno desde .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey.trim() === '' || apiKey.includes('TU_API_KEY_AQUI')) {
  console.error('\n❌ ERROR: GEMINI_API_KEY no está configurada en .env.local.');
  console.error('👉 Obtené tu clave en: https://aistudio.google.com/app/apikey');
  console.error('Luego agregá en .env.local:');
  console.error('GEMINI_API_KEY="AIzaSy..."\n');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

interface VideoGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: number;
  outputFileName?: string;
}

export async function generateGoogleVideo(options: VideoGenerationOptions) {
  const {
    prompt,
    negativePrompt,
    model = 'veo-3.1-generate-preview',
    aspectRatio = '16:9',
    outputFileName = 'historia-abeja-veo.mp4',
  } = options;

  console.log('🚀 Iniciando solicitud de generación de video con Google Veo...');
  console.log(`• Modelo: ${model}`);
  console.log(`• Aspect Ratio: ${aspectRatio}`);
  console.log(`• Prompt: "${prompt}"`);
  if (negativePrompt) {
    console.log(`• Negative Prompt: "${negativePrompt}"`);
  }
  console.log('');

  try {
    const startTime = Date.now();

    // 1. Iniciar la operación asíncrona
    const config: Record<string, unknown> = {
      aspectRatio,
      numberOfVideos: 1,
    };
    if (negativePrompt) {
      config.negativePrompt = negativePrompt;
    }

    let operation = await ai.models.generateVideos({
      model,
      prompt,
      config,
    });

    console.log(` Operación iniciada: ${operation.name}`);
    console.log(' Esperando renderizado (esto toma típicamente entre 1 y 3 minutos)...');

    // 2. Polling desacoplado hasta que termine la operación
    while (!operation.done) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`⏳ [${elapsedSec}s] Renderizando en los servidores de Google...\r`);

      operation = await ai.operations.getVideosOperation({
        operation,
      });
    }

    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n\n✅ Generación completada en ${totalSeconds} segundos!`);

    // 3. Validar y descargar resultado
    const generatedVideo = operation.response?.generatedVideos?.[0];
    if (!generatedVideo || !generatedVideo.video) {
      console.error('❌ La operación finalizó pero no devolvió ningún video:', operation.response);
      process.exit(1);
    }

    const outputDir = path.resolve(rootDir, 'public', 'videos');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.resolve(outputDir, outputFileName);
    console.log(`📥 Descargando video a: ${outputPath}`);

    await ai.files.download({
      file: generatedVideo.video,
      downloadPath: outputPath,
    });

    console.log(`🎉 ¡Video guardado exitosamente en: ${outputPath}!\n`);
    return outputPath;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error al comunicarse con la API de Google:', message);
    process.exit(1);
  }
}

// Prompt y Antiprompt aprobados para el plano secuencia con Google Veo 3.1
const approvedPrompt =
  'Cinematic 4k botanical documentary, shot on 100mm macro probe lens, natural lighting. Extreme close-up of a golden Andean honeybee harvesting nectar from pristine white coffee blossoms covered in morning dew. The camera seamlessly and slowly dollies backwards and tilts up in a single continuous graceful tracking shot as the bee takes flight, golden pollen dust glittering in the soft morning sunlight. The bee flies gently across the misty Andean mountain landscape, arriving at an artisanal weathered cedar beehive nestled among wild ferns and moss in Santa Elena, Piendamó, Colombia. Soft volumetric cloud forest fog, warm golden hour sunbeams, rich organic textures, tranquil continuous camera movement, photorealistic.';

const approvedNegativePrompt =
  'morphing, sudden cuts, jerky camera movements, fast speed, cartoon, 3D CGI render, synthetic textures, deformed bee anatomy, extra wings, plastic surfaces, blurry, flickering, text, watermark, logo, oversaturated colors, harsh artificial lighting.';

generateGoogleVideo({
  prompt: approvedPrompt,
  negativePrompt: approvedNegativePrompt,
  outputFileName: 'historia-abeja-veo.mp4',
});
