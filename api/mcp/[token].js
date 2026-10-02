// Función de Vercel: conector de Claude con el token en la ruta: /api/mcp/<token>
// (la misma lógica que api/mcp.js, ver server/mcp.js).
import { nodeHandler } from '../../server/handlers.js';
import { handleMcp } from '../../server/mcp.js';

export const config = { maxDuration: 60, api: { bodyParser: false } };

export default nodeHandler(handleMcp, 512 * 1024);
