import app from "../artifacts/api-server/src/app";
import { ensureAuthBootstrap } from "../artifacts/api-server/src/lib/auth";
import { logger } from "../artifacts/api-server/src/lib/logger";

type AppRequest = unknown;
type AppResponse = {
  headersSent: boolean;
  status: (code: number) => AppResponse;
  json: (body: unknown) => void;
};
type ExpressHandler = (req: AppRequest, res: AppResponse) => void;

const expressHandler = app as unknown as ExpressHandler;

let bootstrapPromise: Promise<void> | null = null;

export default async function handler(
  req: AppRequest,
  res: AppResponse,
): Promise<void> {
  try {
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    expressHandler(req, res);
  } catch (error) {
    bootstrapPromise = null;
    logger.error({ err: error }, "Falha ao inicializar o banco no Vercel");
    if (!res.headersSent) {
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }
}
