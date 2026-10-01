// Función de Vercel: POST /api/proposals?week=AAAA-Www[&file=nombre] (lógica en server/handlers.js)
// La usan las rutinas semanales para enviar el Markdown y las imágenes de cada semana.
import { handleProposals, nodeHandler, MAX_FILE } from '../server/handlers.js';

export const config = { maxDuration: 60, api: { bodyParser: false } };

export default nodeHandler(handleProposals, MAX_FILE + 1024);
