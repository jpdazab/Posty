// Función serverless de Vercel: POST /api/generate { prompt, format }
import { generatePost, checkAccess, GenerateError } from '../server/generate.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }
  try {
    checkAccess(req.headers['x-posty-code']);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const post = await generatePost(body);
    return res.status(200).json(post);
  } catch (err) {
    if (err instanceof GenerateError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Error inesperado al generar el post.' });
  }
}
