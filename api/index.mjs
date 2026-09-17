import app, { ensureAuthBootstrap } from "../artifacts/api-server/dist/vercel.mjs";

let bootstrapPromise = null;

export default async function handler(req, res) {
  try {
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    app(req, res);
  } catch {
    bootstrapPromise = null;
    if (!res.headersSent) {
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }
}
