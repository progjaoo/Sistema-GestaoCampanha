# Plano: Google Calendar na Vercel via OAuth

**Status:** implementação de código concluída; aplicar migration/configurar Google Cloud e Vercel antes do uso
**Data:** 2026-09-18
**Escopo:** substituir a dependência de identidade/conector do Replit no Google Calendar e manter a agenda funcional no deploy Vercel.

## Estado após implementação

Implementado no código: cliente OAuth server-side com PKCE/state de uso único, refresh token cifrado AES-256-GCM no Neon, rotas administrativas protegidas por `rbac:manage`, interface de conexão em Acessos, uso do ID de calendário configurável (default `primary`), paginação de sincronização, OpenAPI, migration, testes e documentação.

Ainda pendente antes da conexão real: aplicar a migration no branch Neon confirmado, cadastrar as variáveis secretas por ambiente na Vercel, autorizar o callback no cliente OAuth e concluir o consentimento pela tela Acessos. O app continua em External / Testing, portanto o refresh token pode expirar após sete dias; para operação contínua, a publicação/verificação Google continua sendo gate de produção.

## 1. Objetivo

Permitir que o backend publicado na Vercel leia, crie, atualize/remova e sincronize eventos do Google Calendar autorizado, mantendo a interface atual, o Neon como persistência operacional e as permissões existentes do sistema.

A integração deve autenticar uma única conta Google institucional escolhida pela equipe (atualmente `mosaicolabs@gmail.com`). Os usuários do sistema continuam usando as contas e permissões internas atuais; não será implementado OAuth individual para cada usuário nesta entrega.

## 2. Estado confirmado

- O projeto é um monorepo Web + API: React/Vite no frontend, Express/TypeScript em uma Vercel Function e PostgreSQL/Neon com Drizzle.
- O entrypoint Vercel real neste worktree é `api/index.mjs`, que importa a API compilada. O `vercel.json` direciona `/api/*` para essa Function e aplica fallback SPA.
- O helper `artifacts/api-server/src/lib/google-calendar.ts` instancia `ReplitConnectors` e encaminha chamadas por `connectors.proxy("google-calendar", ...)`. Essa dependência de identidade Replit explica o erro `REPL_IDENTITY` fora do Replit.
- As rotas de agenda já fazem operações Google e gravam/sincronizam eventos no Neon. Hoje usam o calendário `primary`; a tabela `campaign_calendar_events` já guarda `googleCalendarId` e `googleEventId` com índice único composto.
- Criar evento, sincronizar, cancelar e remover preserva fluxos existentes de escopo por cidade, compartilhamento semanal, notificações e permissões como `calendar:view` e `calendar:manage`.
- O cliente OAuth Web “Sistema-Campanha” existe, mas ainda não tem URI de callback autorizada. O segredo existente está mascarado no Console e não deve ser presumido como recuperável.
- O app está em **External / Testing**, `mosaicolabs@gmail.com` foi cadastrado como usuário de teste e o único escopo adicionado foi `https://www.googleapis.com/auth/calendar.events.owned`; o Console confirmou que as alterações foram salvas.
- A API key do Google Calendar não substitui OAuth: ela não representa o consentimento da conta Google para operar nos eventos privados dela.

## 3. Decisões propostas

### 3.1 Fluxo OAuth e identidade

Usar OAuth 2.0 de aplicação Web no backend, com autorização explícita da conta Google central. Solicitar apenas `https://www.googleapis.com/auth/calendar.events.owned`, usando autorização offline para obter refresh token. O servidor troca códigos, renova access tokens e chama a Calendar API; o navegador nunca recebe client secret, refresh token ou access token.

As chamadas podem usar `fetch` nativo do Node contra `https://www.googleapis.com/calendar/v3`; não há necessidade obrigatória de adicionar `googleapis`. Caso a biblioteca oficial seja adotada, ela deve ser dependência de runtime explícita e coberta pelo build Vercel.

O escopo `.owned` limita a integração a eventos em calendários dos quais a conta autorizada é proprietária. Confirmar essa condição para o calendário utilizado antes do rollout.

### 3.2 Persistência protegida das credenciais

Proposta para produção: guardar um único refresh token de integração no Neon, criptografado com AES-256-GCM no backend. A chave de criptografia fica em variável secreta server-side da Vercel (`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`), separada do banco. Persistir apenas o envelope cifrado, nonce/IV, tag e versão da chave; nunca access token em tabela, resposta HTTP, URL, log, telemetria ou frontend. Access token pode ficar apenas em cache curto de memória por instância.

Criar uma tabela/configuração singleton de integração Google Calendar e migration Drizzle. Restringir a leitura/escrita desse registro ao serviço de integração. Planejar versão do envelope e rotação da chave; perder a chave torna o refresh token armazenado irrecuperável e exige nova autorização.

Essa opção mantém o token disponível entre invocações/instâncias serverless e evita tentar alterar variáveis Vercel dinamicamente durante o callback. Antes da migration, seguir `docs/database-neon.md`: usar branch/backup e migration revisável; não usar `push --force` nem apagar dados.

### 3.3 Calendário

Manter inicialmente `primary` para não alterar silenciosamente o comportamento nem desvincular eventos já registrados. Centralizar a configuração/identificador em um só lugar e persistir o ID usado junto de cada evento, como o schema já permite. Não trocar para um calendário dedicado sem confirmar que ele foi criado, pertence à conta autorizada e que a migração dos eventos existentes foi planejada.

### 3.4 Separação de administração

Gerenciar a conexão Google é uma configuração global sensível; não conceder acesso apenas por `calendar:manage` se essa permissão também for dada a gestores operacionais. Proteger conectar, consultar status e substituir credencial com permissão de administração global adequada já existente (por exemplo, verificar o uso de `rbac:manage`) ou introduzir uma permissão específica, com alteração documentada no RBAC.

O callback pode ser publicamente alcançável pelo Google, mas deve validar state OAuth curto, imprevisível, de uso único e associado à sessão/administrador que iniciou o fluxo. `authMiddleware` global e a ordem de montagem em `artifacts/api-server/src/routes/index.ts` precisam ser considerados: o router OAuth deve ser montado antes do `requireAuth` global somente se o callback validar explicitamente o state e a vinculação à sessão iniciadora; endpoints de início/status continuam autenticados e autorizados.

## 4. Rotas e comportamento a implementar

Preservar as rotas de agenda existentes e seus formatos para não quebrar frontend, clientes ou contrato OpenAPI. Acrescentar somente endpoints de administração/conexão necessários, por exemplo:

| Operação | Acesso | Resultado esperado |
| --- | --- | --- |
| Iniciar conexão | Admin global autenticado | Cria state de uso único e redireciona/retorna URL Google com escopo mínimo e `access_type=offline` |
| Callback OAuth | Callback validado por state, sessão e expiração | Troca `code`, cifra e salva refresh token; não exibe credenciais |
| Status da conexão | Admin global autenticado | Informa conectado/desconectado, data da autorização e estado resumido; nunca tokens |

O callback deve usar URI fixa e HTTPS em produção, por exemplo `https://gestaocampanha15088.vercel.app/api/calendar/google/callback`, e essa mesma URI exata deve ser registrada no cliente OAuth e na configuração da aplicação. Preview precisa de uma URI estável própria ou deve reutilizar somente o callback de produção durante o teste; não cadastrar curingas.

O início da conexão deve validar configuração incompleta sem expor valores. O callback deve tratar `state` inválido/reutilizado, consentimento negado, ausência de refresh token em reconexão e erros de troca de código. Em reconexões, preservar a credencial válida existente se o Google não devolver novo refresh token; permitir substituição apenas após concluir com sucesso a nova autorização.

## 5. Etapas de implementação

### Fase 0 — preflight e configuração Google

1. Confirmar que Google Calendar API está habilitada no projeto Cloud e que o cliente OAuth é do tipo Web.
2. Definir callback canônico e ambientes de retorno (Production e, se necessário, Preview); cadastrá-los exatamente no cliente.
3. Obter um client secret utilizável com segurança: consultar o mecanismo de criação/rotação do Console se o valor antigo não puder ser revelado. Nunca copiar segredos para o chat, documentação, issue ou Git.
4. Confirmar que o Google selecionado no consentimento é a conta institucional desejada e que ela é proprietária do `primary` atual.
5. Confirmar a permissão administrativa global apropriada para conectar a integração.

**Saída:** valores necessários ficam disponíveis apenas para configuração segura; nenhuma credencial real entra no plano ou repositório.

### Fase 1 — base de OAuth e armazenamento

1. Criar serviço de OAuth Calendar sem `ReplitConnectors`, com injeção de transporte HTTP para testes.
2. Implementar geração/verificação de state, expiração e consumo único; vincular início, callback e identidade administrativa.
3. Criar migration Drizzle para estado pendente e registro singleton cifrado da integração (ou solução equivalente documentada após revisão de segurança).
4. Implementar cifra AES-256-GCM, validação de formato da chave e versionamento; usar `node:crypto` e falhar fechado se a chave estiver ausente/incorreta.
5. Implementar troca de authorization code e renovação de access token com cache em memória, timeout e tratamento explícito de `invalid_grant`/revogação.
6. Nunca logar query completa do callback (`code`, `state`), headers `Authorization`, tokens ou corpos OAuth sensíveis.

### Fase 2 — API Calendar compatível

1. Substituir o adaptador Replit por cliente server-side que injeta `Bearer` access token nas chamadas à Calendar API.
2. Centralizar base URL, calendar ID, escopo, serialização, timeouts e erros; validar/escapar segmentos de path e construir query com `URLSearchParams`.
3. Migrar create, delete, list/sync para o calendar ID configurado, mantendo metadata privada `eaCityId`/`eaSource`, timezone `America/Sao_Paulo`, `sendUpdates` existente e checagens territoriais.
4. Preservar gravação no Neon, notificações, compartilhamento, acknowledgement e respostas públicas atuais.
5. Paginar `/events` usando `nextPageToken` até o fim (dentro de limites operacionais), pois o fluxo atual consulta no máximo 250 eventos de uma única página.
6. Tratar códigos Google com respostas seguras e previsíveis: credencial desconectada/revogada, insuficiência de escopo, calendário sem acesso, rate limit/quota e falha transitória. Não devolver mensagens brutas do Google ao cliente.
7. Tornar operações e sincronização idempotentes: manter o índice único existente, não duplicar notificações em reexecuções e definir como tratar `404` no delete e eventos `cancelled`.

### Fase 3 — interface administrativa mínima

1. Se a equipe precisar operar reconexões sem acesso manual ao Console, acrescentar uma seção restrita de administração com status e ação Conectar/Reautorizar.
2. Não adicionar botão de conexão à tela geral da Agenda nem expor credenciais nessa interface.
3. Se a entrega inicial optar por não alterar frontend, documentar procedimento de autorização e status por endpoints protegidos; a conexão ainda deve ser concluível sem intervenção direta no banco.

### Fase 4 — testes e validação

1. Testes unitários do serviço OAuth: state válido/inválido/reutilizado/expirado; troca de código; refresh/cache; chave de cifra ausente/inválida; preservação de refresh token durante reconexão; falhas HTTP e timeout.
2. Testes da Calendar API mockada: caminhos e calendar ID; query/paginação; create/delete; `404`, `401`, `403`, `429` e `5xx`; status/eventos cancelados; nunca registrar ou retornar tokens.
3. Testes de rotas: início/status só para admin autorizado; callback com state válido e inválido; rotas atuais preservam RBAC, escopo de cidade e compatibilidade da resposta.
4. Atualizar `lib/api-spec/openapi.yaml` e tipos/schemas compartilhados para qualquer endpoint novo.
5. Executar a suíte documentada em `docs/testing.md`: `pnpm typecheck`, builds de API e frontend, `test:sheets` e `test:api`. Regressão Sheets é necessária, mas seu fluxo não deve ser alterado nesta feature.
6. Fazer teste real inicialmente em Preview com calendário/conta controlados, validando autorização, listagem, criação e remoção de evento descartável somente após confirmação do operador. Não usar teste automatizado que escreva no calendário real.

### Fase 5 — deploy e operação

1. Criar branch/backup Neon para migration e validar migration antes de Production.
2. Cadastrar em Vercel, apenas server-side e nos ambientes apropriados: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` e, se for configurable, `GOOGLE_CALENDAR_ID` (inicialmente `primary`). Nunca usar prefixo `VITE_` para segredo.
3. Aplicar migration por procedimento controlado e publicar Preview; variáveis alteradas exigem novo deploy.
4. Completar OAuth com a conta central no domínio/ambiente de teste e confirmar o estado da integração sem ler token de volta.
5. Verificar `/api/healthz`, login, permissões, leitura/sincronização, criação/remoção controladas, Neon, notificações, frontend Agenda, logs e domínio canônico.
6. Promover para Production só depois de concluir o gate OAuth descrito abaixo e confirmar que a conta e o calendário finais são os corretos.

## 6. Gate importante: External / Testing

Com escopo Calendar, um projeto OAuth **External / Testing** emite refresh tokens que expiram após sete dias. Portanto, a configuração atual é apropriada para desenvolvimento/piloto com reconexão periódica, mas **não é uma base operacional estável para produção contínua**. Usuários de teste também ficam restritos à audiência cadastrada.

Antes de declarar a agenda em produção, a equipe deve decidir entre:

1. manter Testing e aceitar explicitamente reconexões frequentes apenas durante piloto; ou
2. mover a aplicação para **In production** e concluir as exigências de verificação/branding do Google para o escopo sensível aplicável, testar uma nova autorização e confirmar a duração do refresh token emitido.

Não contornar o requisito usando API key, token de teste permanente ou credenciais de serviço como se fossem OAuth delegado. A transição de estado do app e a verificação Google são ações no Console e precisam ser validadas pelo responsável da conta antes do go-live. Ao mudar configuração/credenciais, publicar novo deploy quando necessário e reautorizar a conta conforme o resultado da migração.

## 7. Critérios de aceite

- Nenhum runtime do Calendar depende de `REPL_IDENTITY`, `replit identity` ou `connectors.proxy`.
- A autorização funciona na Vercel com a conta institucional, usando somente o escopo previamente aprovado `calendar.events.owned`.
- Refresh token é persistente e cifrado no Neon; a chave e o client secret existem somente como segredo server-side na Vercel; nenhum token chega ao navegador ou logs.
- Rotas de conexão são protegidas por administração global; callback valida state e não permite CSRF/replay.
- Criar, listar/sincronizar, cancelar e remover eventos mantém a integração Neon, território, notificações e compartilhamentos existentes sem regressão.
- Sincronização busca todas as páginas no intervalo suportado sem duplicar eventos ou notificações.
- Suite de typecheck, builds e testes documentados passa; teste de Preview comprova callback, Calendar API, Neon e UI.
- O status OAuth Testing/Production e sua consequência operacional estão registrados antes de habilitar uso contínuo.

## 8. Riscos e respostas

| Risco | Mitigação |
| --- | --- |
| Refresh token expira em sete dias no modo Testing | Tratar como gate de go-live; concluir fluxo de produção/verificação ou aceitar piloto temporário com reconexão explícita |
| Client secret atual não pode ser visualizado | Criar/rotacionar secret com controle de acesso e cadastrá-lo diretamente como segredo Vercel |
| Chave AES perdida ou alterada sem recriptografia | Versionar envelope; restringir acesso; manter processo testado de rotação e plano de nova autorização |
| Conta conectada não é dona do calendário alvo | Confirmar a conta e propriedade antes da conexão; manter `primary` até decisão explícita |
| Dois admins conectam contas diferentes | Singleton global, operação serializada, auditoria de quem iniciou e reautorização administrativa explícita |
| Rate limit/paginação parcial causa sync incompleto | Paginar com limites/timeout e tratar `nextPageToken`; registrar resultado resumido e permitir reexecução idempotente |
| Rotas atuais expõem privilégios de agenda como administração global | Gate específico de administração; não reutilizar permissões operacionais sem confirmar seu alcance |

## 9. Referências internas

- `docs/README.md` — índice e ordem de leitura.
- `docs/architecture.md` — monorepo, frontend/API, Neon e Vercel.
- `docs/api.md` — contratos e permissões.
- `docs/development-guidelines.md` e `docs/security.md` — TypeScript, validação, logs e segredos.
- `docs/database-neon.md` — branches, backups e migrations.
- `docs/environment.md` — configuração por ambiente.
- `docs/testing.md` e `docs/deploy-vercel.md` — verificações e publicação.
- Código atual: `artifacts/api-server/src/lib/google-calendar.ts`, `artifacts/api-server/src/routes/operations.ts`, `artifacts/api-server/src/routes/index.ts`, `lib/db/src/schema/operations.ts`, `api/index.mjs` e `vercel.json`.

## 10. Referências oficiais

- [Google Calendar API — OAuth scopes](https://developers.google.com/workspace/calendar/api/auth): escopos suportados e princípio de privilégio mínimo.
- [Google OAuth 2.0 — refresh tokens](https://developers.google.com/identity/protocols/oauth2): ciclo de vida e expiração de refresh tokens.
- [Google Auth Platform — público do app](https://support.google.com/cloud/answer/15549945?hl=en): usuários de teste e status de publicação.
- [Vercel — Environment Variables](https://vercel.com/docs/environment-variables): segredos server-side, escopo por ambiente e necessidade de novo deploy após alterações.
- [Vercel — Functions](https://vercel.com/docs/functions): runtime e execução serverless.
