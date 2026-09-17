type AppRequest = unknown;
type AppResponse = {
  headersSent: boolean;
  status: (code: number) => AppResponse;
  json: (body: unknown) => void;
};
type ExpressHandler = (req: AppRequest, res: AppResponse) => void;

type ServerModule = {
  default: ExpressHandler;
  ensureAuthBootstrap: () => Promise<void>;
};

const serverModuleUrl = new URL(
  "../artifacts/api-server/dist/vercel.mjs",
  import.meta.url,
).href;

let serverModulePromise: Promise<ServerModule> | null = null;

let bootstrapPromise: Promise<void> | null = null;

export default async function handler(
  req: AppRequest,
  res: AppResponse,
): Promise<void> {
  try {
    serverModulePromise ??= import(serverModuleUrl) as Promise<ServerModule>;
    const { default: expressHandler, ensureAuthBootstrap } =
      await serverModulePromise;
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    expressHandler(req, res);
  } catch (error) {
    bootstrapPromise = null;
    console.error("Falha ao inicializar o banco no Vercel", error);
    if (!res.headersSent) {
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }
}
