# Gestão da Campanha EA 2026

Painel mobile-first para consultar a cobertura territorial e a base de lideranças da campanha, mantendo a origem dos dados e pendências de revisão.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/campaign.ts` — tabelas relacionais da campanha e fila de revisão.
- `lib/db/seed-data/` — CSVs de origem versionados para a carga inicial.
- `scripts/src/seed-campaign.ts` — seed idempotente com validação das contagens de origem.
- `artifacts/api-server/src/routes/campaign.ts` — endpoints de cobertura, lideranças e revisão.
- `lib/api-spec/openapi.yaml` — contrato único da API; execute codegen após alterações.
- `artifacts/campanha-ea-2026/src/` — painel web e páginas mobile-first.

## Architecture decisions

- A carga usa as chaves naturais dos catálogos e `Aba_Origem + Linha_Origem` para deduplicar lideranças sem perder rastreabilidade.
- As linhas incompletas da fonte são preservadas; nomes ausentes aparecem como “Sem identificação” apenas nas respostas de leitura.
- `needsReview` é marcado para vínculos `REVISAR`, sem tentar inferir o deputado federal.
- A visão macro é agregada dinamicamente a partir das tabelas, sem persistir os totais gravados nos CSVs.

## Product

O painel apresenta totais de regiões, cidades e lideranças, distribuição por região e deputado, busca e filtros paginados de lideranças, detalhe com trilha de origem e uma fila de revisão para os registros ambíguos.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
