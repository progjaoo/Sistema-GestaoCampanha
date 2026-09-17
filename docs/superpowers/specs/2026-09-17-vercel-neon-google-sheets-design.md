# Especificação: publicação no Vercel, Neon e Google Sheets

## Objetivo

Preparar o monorepo Gestão da Campanha EA 2026 para publicação como uma aplicação web/API em um único projeto Vercel, usando o projeto Neon existente `sistema-campanha` e exibindo a planilha oficial em modo somente leitura na tela “Planilha”.

## Decisões aprovadas

- **Tipo do produto:** aplicação Web com API, responsiva e instalável como PWA.
- **Deploy:** um projeto Vercel para o frontend Vite e a API Express, com `/api` no mesmo domínio.
- **Domínio desejado:** `gestaocampanha15088.vercel.app`, sujeito à disponibilidade no time Vercel.
- **Banco:** projeto Neon existente `sistema-campanha`, branch `production`, banco `neondb`; a implantação não apaga nem recria o projeto.
- **Planilha:** `https://docs.google.com/spreadsheets/d/1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI`, somente leitura.
- **Autenticação da planilha:** Google Sheets API nativa com conta de serviço do Google, concedida como Visualizador na planilha. O conector Replit fica apenas como fallback de desenvolvimento quando disponível.
- **Configuração:** identificador ou URL da planilha e credenciais são variáveis de ambiente; nenhum segredo entra no Git.

## Arquitetura

O frontend continua em `artifacts/campanha-ea-2026` e produz `dist/public`. O entrypoint `api/index.ts` exporta a instância Express de `artifacts/api-server`, permitindo que o Vercel execute a API como Function. O `vercel.json` direciona `/api/*` para a Function e o restante para o shell SPA.

O backend mantém a rota protegida `GET /api/sheets/campaign`. Ela consulta metadados, seleciona a aba solicitada (ou a primeira aba), lê valores e cruza linhas com lideranças do Neon. Não haverá rotas de escrita na planilha.

## Configuração de produção

Variáveis obrigatórias:

- `DATABASE_URL`: connection string pooled do Neon.
- `SESSION_SECRET`: segredo forte para tokens da aplicação.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON da conta de serviço, armazenado como segredo Vercel.
- `GOOGLE_SHEETS_SPREADSHEET_URL`: URL oficial da planilha.
- `ADMIN_GENERAL_PASSWORD` e, quando usado, `ADMIN_SECONDARY_PASSWORD`.

Variáveis recomendadas:

- `APP_ORIGIN`: domínio público para CORS.
- `GOOGLE_SHEETS_READ_RANGE`: limite opcional de leitura, para controlar volume.

## Compatibilidade e segurança

- O provedor Google deve rejeitar configuração incompleta com erro operacional claro e sem imprimir a chave privada.
- A chave privada nunca será enviada ao cliente nem incluída nas respostas da API.
- CORS deixa de aceitar qualquer origem com credenciais em produção.
- A API recebe o banco de forma compatível com execução serverless e não abre um servidor com `app.listen()` no Vercel.
- A inicialização de schema/seed do Neon será uma etapa operacional explícita, idempotente e documentada.

## Verificação de aceite

1. `pnpm typecheck` passa.
2. Build direcionado do frontend produz `artifacts/campanha-ea-2026/dist/public`.
3. Testes unitários cobrem parsing da URL/ID, credencial inválida, token OAuth e resposta somente leitura do provedor.
4. A rota da planilha mantém o contrato consumido pela tela atual.
5. Documentação em `docs/README.md` permite configurar local, Neon, Google Sheets, GitHub e Vercel sem conhecimento prévio do repositório.
