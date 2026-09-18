# Deploy no Vercel

## Configuração esperada

O projeto usa `vercel.json` na raiz:

- instalação com pnpm e lockfile;
- build da API Express e de `@workspace/campanha-ea-2026`;
- saída `artifacts/campanha-ea-2026/dist/public`;
- `/api/*` direcionado para `api/index.mjs`;
- demais caminhos direcionados a `/index.html` para deep links do SPA;
- Function Express com duração máxima configurada.

## Conectar ao GitHub

1. Abra o time Vercel `mosaicolabs-4518's projects`.
2. Crie um novo projeto a partir de `progjaoo/Sistema-GestaoCampanha`.
3. Use a raiz do repositório; não aponte para `artifacts/campanha-ea-2026`, pois o `vercel.json` fica na raiz.
4. Confirme que o framework/build detectado respeita o `vercel.json`.
5. Habilite deploy automático da branch principal depois da primeira validação.

## Variáveis

Cadastre pelo painel ou CLI, nos ambientes corretos:

```text
DATABASE_URL
SESSION_SECRET
GOOGLE_SHEETS_SPREADSHEET_URL
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
GOOGLE_CALENDAR_REDIRECT_URI
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
GOOGLE_CALENDAR_ID (opcional; default primary)
APP_ORIGIN
ADMIN_GENERAL_EMAIL
ADMIN_GENERAL_PASSWORD
ADMIN_SECONDARY_PASSWORD (opcional)
```

Para Production, `APP_ORIGIN` deve ser `https://gestaocampanha15088.vercel.app` depois que o domínio estiver atribuído. Em Preview, use a origem da URL de preview apenas se houver chamadas cross-origin; com frontend e API no mesmo deploy, normalmente o navegador não precisa de CORS.

## Domínio

Adicione `gestaocampanha15088.vercel.app` em Settings → Domains. O nome precisa estar disponível dentro do time; se já estiver ocupado, o Vercel exigirá outro subdomínio.

## Validação pós-deploy

1. Abra `/` e atualize uma rota interna, como `/planilha`, para validar o fallback SPA.
2. Acesse `/api/healthz`.
3. Faça login com o administrador bootstrap.
4. Abra a tela Planilha e valide abas/linhas.
5. Verifique logs sem dados sensíveis.
6. Confirme que o domínio e PWA usam HTTPS.
7. Configure e autorize o Google Calendar conforme [Google Calendar](google-calendar.md); não declare operação contínua enquanto o app OAuth permanecer em External / Testing.

Referências oficiais: [Express no Vercel](https://vercel.com/docs/frameworks/backend/express) e [Vite no Vercel](https://vercel.com/docs/frameworks/frontend/vite).
