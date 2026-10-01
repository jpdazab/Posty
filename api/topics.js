// Función de Vercel: GET /api/topics (lógica en server/handlers.js)
// La usan las rutinas semanales para leer los temas que eligió cada persona en Posty.
import { handleTopics, nodeHandler } from '../server/handlers.js';

export const config = { maxDuration: 30, api: { bodyParser: false } };

export default nodeHandler(handleTopics, 1024);
