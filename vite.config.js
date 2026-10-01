import { defineConfig } from 'vite';

// En desarrollo, /api/* usa la misma lógica que las funciones de Vercel (server/handlers.js).
function devApi() {
  return {
    name: 'posty-dev-api',
    configureServer(server) {
      const routes = { '/api/generate': ['handleGenerate', 64 * 1024], '/api/proposals': ['handleProposals', 5 * 1024 * 1024] };
      for (const [path, [name, limit]] of Object.entries(routes)) {
        server.middlewares.use(path, async (req, res) => {
          const mod = await server.ssrLoadModule('/server/handlers.js');
          req.url = path + (req.url === '/' ? '' : req.url);
          return mod.nodeHandler(mod[name], limit)(req, res);
        });
      }
    },
  };
}

// Rutas relativas: el sitio funciona igual en Vercel o en cualquier hosting estático.
export default defineConfig({ base: './', plugins: [devApi()] });
