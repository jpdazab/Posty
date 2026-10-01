import { defineConfig } from 'vite';

// En desarrollo, sirve /api/generate con la misma lógica que la función de Vercel.
function devApi() {
  return {
    name: 'posty-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/generate', async (req, res) => {
        const { generatePost, checkAccess, GenerateError } = await server.ssrLoadModule('/server/generate.js');
        const send = (status, data) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        if (req.method !== 'POST') return send(405, { error: 'Método no permitido' });
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try {
          checkAccess(req.headers['x-posty-code']);
          send(200, await generatePost(JSON.parse(raw || '{}')));
        } catch (err) {
          if (err instanceof GenerateError) return send(err.status, { error: err.message });
          console.error(err);
          send(500, { error: 'Error inesperado al generar el post.' });
        }
      });
    },
  };
}

// Rutas relativas: el sitio funciona igual en Vercel, Netlify o GitHub Pages.
export default defineConfig({ base: './', plugins: [devApi()] });
