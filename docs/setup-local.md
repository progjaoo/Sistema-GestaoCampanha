# Setup local

## Pré-requisitos

- Node.js 20 ou superior; o projeto foi desenvolvido/testado no Node 24.
- pnpm compatível com o lockfile.
- PostgreSQL acessível para executar a API completa.
- Opcional: Google Cloud service account com acesso de leitura à planilha.

## Instalação

Na raiz do repositório:

```bash
pnpm install
```

No Windows, se o shell não tiver `sh`, o `preinstall` pode falhar. Para instalar somente no ambiente local, use `pnpm install --ignore-scripts`; não remova o lockfile.

Copie `.env.example` para `.env` e preencha os valores locais. Nunca commite `.env`.

## Comandos principais

```bash
pnpm typecheck
pnpm --filter @workspace/campanha-ea-2026 run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed:campaign
pnpm --filter @workspace/scripts run test:sheets
pnpm --filter @workspace/scripts run test:api
```

Para iniciar o backend local conforme o fluxo original:

```bash
pnpm --filter @workspace/api-server run dev
```

Para desenvolvimento do frontend, use o script do pacote frontend. A API deve estar acessível no mesmo ambiente ou por proxy configurado pelo fluxo local.

## Ordem sugerida

1. Instale dependências.
2. Configure `DATABASE_URL` e `SESSION_SECRET`.
3. Aplique o schema e rode o seed.
4. Configure o Google Sheets se precisar abrir a tela Planilha.
5. Rode typecheck, testes e builds.
