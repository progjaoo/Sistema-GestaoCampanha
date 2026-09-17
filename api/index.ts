type AppRequest = unknown;
declare const process: { cwd: () => string };

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

const serverModulePath = `${process.cwd()}/artifacts/api-server/dist/vercel.mjs`;

let serverModulePromise: Promise<ServerModule> | null = null;

let bootstrapPromise: Promise<void> | null = null;

export default async function handler(
  req: AppRequest,
  res: AppResponse,
): Promise<void> {
  try {
    serverModulePromise ??= import(serverModulePath) as Promise<ServerModule>;
    const { default: expressHandler, ensureAuthBootstrap } =
      await serverModulePromise;
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    expressHandler(req, res);
  } catch (error) {
    bootstrapPromise = null;
    if (!res.headersSent) {
      res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
  }
}
