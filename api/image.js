// Función de Vercel: POST /api/image { prompt, size, quality } (lógica en server/handlers.js y server/image.js)
// Genera una imagen con la API de OpenAI usando la clave de la persona (cabecera x-openai-key).
import { handleImage, nodeHandler } from '../server/handlers.js';

export const config = { maxDuration: 120, api: { bodyParser: false } };

export default nodeHandler(handleImage, 16 * 1024);
