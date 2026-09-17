import app from "../artifacts/api-server/src/app";
import { ensureAuthBootstrap } from "../artifacts/api-server/src/lib/auth";
import { logger } from "../artifacts/api-server/src/lib/logger";

type AppRequest = Parameters<typeof app>[0];
type AppResponse = Parameters<typeof app>[1];

let bootstrapPromise: Promise<void> | null = null;

export default async function handler(
  req: AppRequest,
  res: AppResponse,
): Promise<void> {
  try {
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    app(req, res);
  } catch (error) {
    bootstrapPromise = null;
    logger.error({ err: error }, "Falha ao inicializar o banco no Vercel");
    if (!res.headersSent) {
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }
}
