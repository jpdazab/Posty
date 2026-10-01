// Función de Vercel: POST /api/generate { prompt, format } (lógica en server/handlers.js)
import { handleGenerate, nodeHandler } from '../server/handlers.js';

export const config = { maxDuration: 120, api: { bodyParser: false } };

export default nodeHandler(handleGenerate, 64 * 1024);
