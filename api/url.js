// Función de Vercel: POST /api/url { url } (lógica en server/handlers.js)
// Lee una página web sin IA para proponer diseños en Diseños → Generar diseños.
import { handleUrl, nodeHandler } from '../server/handlers.js';

export const config = { maxDuration: 30, api: { bodyParser: false } };

export default nodeHandler(handleUrl, 8 * 1024);
