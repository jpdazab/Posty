// Función de Vercel: conector de Claude (servidor MCP remoto). Lógica en server/mcp.js.
// Dirección para Claude: https://<posty>/api/mcp?token=<token personal de Cuenta>
import { nodeHandler } from '../server/handlers.js';
import { handleMcp } from '../server/mcp.js';

export const config = { maxDuration: 60, api: { bodyParser: false } };

export default nodeHandler(handleMcp, 512 * 1024);
