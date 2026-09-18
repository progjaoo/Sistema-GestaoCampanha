# Segurança

## Segredos

- Não versione `.env`, `DATABASE_URL`, `SESSION_SECRET` ou `GOOGLE_SERVICE_ACCOUNT_JSON`.
- Use variáveis secretas do Vercel e limite o acesso ao time.
- Rotacione chaves de service account e senhas bootstrap após a publicação.

## Google Sheets

O acesso é limitado ao escopo `spreadsheets.readonly` e à permissão Viewer na planilha. O frontend não recebe o JSON da conta de serviço e não chama diretamente a API Google.

## Google Calendar

- A autorização OAuth é iniciada por administrador com `rbac:manage`; o callback usa state aleatório de uso único, PKCE e cookie `HttpOnly`, `SameSite=Lax` e curto prazo.
- A aplicação solicita somente `calendar.events.owned`. Client secret e chave AES ficam nas variáveis server-side da Vercel.
- O refresh token e o verifier OAuth pendente são guardados cifrados com AES-256-GCM no Neon. O access token existe apenas em cache de memória da Function.
- Nunca registre códigos OAuth, state, authorization headers, refresh/access tokens, segredos ou corpos sensíveis do token endpoint.
- A chave de criptografia deve ter cópia operacional segura e processo de rotação; perdê-la exige nova autorização. Não reaproveite a mesma chave entre ambientes.
- Em OAuth External / Testing, refresh tokens Calendar expiram após sete dias; isso não atende operação contínua sem reconexão.

## API e sessão

- Use sempre HTTPS em produção.
- `SESSION_SECRET` deve ser imprevisível e diferente por ambiente.
- Permissões são aplicadas no backend; ocultar uma tela no frontend não é controle de acesso.
- O token atual é mantido pelo cliente conforme a implementação existente; não inclua tokens em logs, URLs ou mensagens de erro.

## CORS e erros

Em produção, CORS aceita apenas `APP_ORIGIN` quando configurado; sem ele, a aplicação funciona por same-origin e não libera origens externas. Erros de API retornam mensagem genérica e os detalhes ficam somente no logger.

## Banco

- Use conexão pooled do Neon.
- Separe Preview/Production quando possível.
- Faça branch/backup antes de schema push ou seed.
- Nunca use dados de produção em testes automatizados destrutivos.
