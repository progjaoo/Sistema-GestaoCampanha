# Arquitetura

## Visão geral

O sistema é uma aplicação Web + API em monorepo. O navegador baixa o frontend estático do Vercel e chama a API pelo mesmo domínio, usando o prefixo `/api`.

```text
Navegador/PWA
   ├─ Vite → arquivos estáticos no Vercel
   └─ fetch /api/* → api/index.mjs → Express
                                  ├─ Neon/PostgreSQL via Drizzle
                                  ├─ Google Sheets API (somente leitura)
                                  └─ Google Calendar API via OAuth server-side
```

## Camadas

### Frontend

`artifacts/campanha-ea-2026/src` contém rotas de tela, componentes, hooks, snapshots offline e cliente autenticado. A tela `src/pages/sheets.tsx` consome `GET /api/sheets/campaign` e não oferece comandos de escrita.

### API

`artifacts/api-server/src/app.ts` configura middleware e monta as rotas sob `/api`. `src/index.ts` continua sendo o processo local que chama `listen`; `api/index.mjs` é o entrypoint serverless que importa a instância Express compilada.

### Persistência

`lib/db/src/schema` define as tabelas normalizadas. A conexão é criada a partir de `DATABASE_URL`. No Neon, use a URL pooled e mantenha migrations/schema e seed como operações explícitas.

### Integrações Google

Google Sheets é somente leitura e usa a credencial de serviço descrita em `docs/google-sheets.md`. Google Calendar usa OAuth próprio, callback Vercel e refresh token cifrado no Neon; a integração e operação estão em `docs/google-calendar.md`.

### Contratos

`lib/api-spec/openapi.yaml` é a fonte do contrato documentado. Os clientes em `lib/api-client-react` e schemas em `lib/api-zod` são gerados/compartilhados; alterações de API devem atualizar o contrato quando a rota fizer parte do consumo tipado.

## Fluxo da tela Planilha

1. Usuário autenticado abre a tela e precisa da permissão `sheets:view`.
2. Frontend chama `/api/sheets/campaign` ou informa `?tab=NomeDaAba`.
3. API resolve `GOOGLE_SHEETS_SPREADSHEET_URL`/`GOOGLE_SHEETS_SPREADSHEET_ID`.
4. Provedor obtém token OAuth de escopo somente leitura e consulta metadados e valores.
5. API normaliza células em cabeçalhos/linhas e cruza `sourceSheet`/`sourceRow` com lideranças do Neon.
6. Frontend exibe dados e correspondências; não existe mutação na planilha.

## Decisões de deploy

- Um projeto Vercel reduz CORS e mantém o contrato relativo `/api`.
- O build Vercel é direcionado ao frontend, sem publicar o sandbox.
- O Express é executado como uma Function em `api/index.mjs`; nenhum `app.listen()` deve ser usado pelo entrypoint Vercel.
- O fallback SPA ocorre depois da regra `/api`.
