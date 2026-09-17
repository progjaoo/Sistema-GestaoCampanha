# Diagnóstico e status

## Estado encontrado

O repositório é um workspace pnpm com nove pacotes. O produto principal é dividido em:

- `artifacts/campanha-ea-2026`: frontend React/Vite e PWA.
- `artifacts/api-server`: API Express e regras de autenticação/negócio.
- `lib/db`: schema Drizzle, conexão PostgreSQL e dados CSV para seed.
- `lib/api-spec`, `lib/api-client-react` e `lib/api-zod`: contrato e clientes gerados.
- `artifacts/mockup-sandbox`: sandbox auxiliar, não é o alvo do deploy.

O typecheck original passou antes da alteração. A dependência local foi instalada com `--ignore-scripts` porque o script `preinstall` usa `sh`, ausente no shell Windows; no Vercel, o ambiente Linux executa esse script normalmente.

## Diagnóstico de publicação

O projeto veio com modelo de execução Replit: o backend exigia `PORT`, o Vite exigia `PORT` e `BASE_PATH`, e a integração Sheets usava `@replit/connectors-sdk`. Isso não é suficiente para um deploy portátil no Vercel.

As alterações desta branch:

- criam `api/index.ts` para exportar o Express como Function;
- criam `vercel.json` para build do frontend, saída estática, roteamento `/api` e fallback SPA;
- usam defaults de build Vite compatíveis com Vercel e desenvolvimento local;
- substituem a dependência de Replit em produção por Google Sheets API nativa com escopo `spreadsheets.readonly`;
- restringem CORS em produção ao `APP_ORIGIN` configurado;
- adicionam tratamento genérico de erro na API;
- criam testes unitários da configuração e autenticação Sheets;
- documentam Neon, Google, GitHub e Vercel.

## Serviços confirmados

- GitHub: [progjaoo/Sistema-GestaoCampanha](https://github.com/progjaoo/Sistema-GestaoCampanha).
- Neon: projeto `sistema-campanha`, região `aws-us-east-2`, branch `production`, banco `neondb`.
- Vercel: time `mosaicolabs-4518's projects`; o domínio planejado é `gestaocampanha15088.vercel.app`.
- Planilha oficial: [Google Sheets da campanha](https://docs.google.com/spreadsheets/d/1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI).

O banco Neon foi inspecionado sem alteração e estava sem tabelas de aplicação no diagnóstico. A criação do schema e o seed são etapas posteriores, executadas somente com a connection string correta e seguindo [Banco no Neon](database-neon.md).

## Pendências externas

- Criar/configurar uma conta de serviço no Google Cloud e compartilhar a planilha com o e-mail dela como Visualizador.
- Inserir os segredos nas variáveis do Vercel.
- Conectar o projeto Vercel ao repositório GitHub e reservar o domínio desejado, se disponível.
- Aplicar o schema e executar o seed no Neon.
- Criar o primeiro administrador com senha forte.
