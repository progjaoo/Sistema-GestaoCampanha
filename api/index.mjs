import app, { ensureAuthBootstrap } from "../artifacts/api-server/dist/vercel.mjs";

let bootstrapPromise = null;

export default async function handler(req, res) {
  const debug = new URL(req.url ?? "", "https://vercel.local").searchParams.get("debug") === "1";
  try {
    bootstrapPromise ??= ensureAuthBootstrap();
    await bootstrapPromise;
    app(req, res);
  } catch (error) {
    bootstrapPromise = null;
    console.error("Falha ao inicializar o banco no Vercel", error);
    if (!res.headersSent) {
      const detail = error instanceof Error ? error.message : String(error);
      const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
      const causeDetail = cause && typeof cause === "object" && "message" in cause
        ? String(cause.message)
        : cause
          ? String(cause)
          : undefined;
      res.status(503).json({
        error: "Serviço temporariamente indisponível.",
        ...(debug
          ? {
              detail: detail.slice(0, 500),
              cause: causeDetail?.slice(0, 500),
              code: cause && typeof cause === "object" && "code" in cause
                ? String(cause.code)
                : undefined,
            }
          : {}),
      });
    }
  }
}
