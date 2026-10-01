// Función de Vercel: POST /api/digest { which, today, extra } (lógica en server/handlers.js)
// Genera con Claude las propuestas de una semana del AI Digest sin esperar a la rutina.
import { handleDigest, nodeHandler } from '../server/handlers.js';

export const config = { maxDuration: 300, api: { bodyParser: false } };

export default nodeHandler(handleDigest, 64 * 1024);
