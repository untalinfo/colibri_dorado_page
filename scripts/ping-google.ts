import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(rootDir, '.env.local') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ Error: GEMINI_API_KEY no encontrada en .env.local');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function ping() {
  console.log('📡 Haciendo ping a Google AI Studio (Health check sin costo de video)...');
  const targetModel = 'models/veo-3.1-generate-preview';

  try {
    const startTime = Date.now();
    // Consultar metadatos del modelo: valida autenticación, permisos y conectividad sin consumir créditos de video
    const model = await ai.models.get({ model: targetModel });
    const latency = Date.now() - startTime;

    console.log('\n===========================================');
    console.log('✅ PING EXITOSO');
    console.log('===========================================');
    console.log(`⏱️  Latencia:        ${latency} ms`);
    console.log(`🔑  Autenticación:   Válida y activa`);
    console.log(`🎬  Modelo Veo:      ${model.name}`);
    console.log(`🏷️  Nombre:          ${model.displayName}`);
    console.log('💰  Costo:           $0.00 (0 créditos consumidos)');
    console.log('===========================================\n');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Falló el ping a la API:', message);
    process.exit(1);
  }
}

ping();
