# Google Calendar — OAuth na Vercel

## Estado da integração

O backend usa a Google Calendar API diretamente; não depende de `REPL_IDENTITY`, `replit identity`, `@replit/connectors-sdk` ou de plugin do Codex. A autenticação é OAuth 2.0 de aplicação Web e usa somente o escopo aprovado:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

A conta Google institucional conectada é a fonte dos eventos. O calendário utilizado permanece `primary` por padrão, preservando a configuração atual; `GOOGLE_CALENDAR_ID` permite configurar outro identificador sem alterar o código. Com `.owned`, a conta autorizada deve ser proprietária do calendário.

O fluxo de Google Sheets é independente e não foi alterado.

## Preparar Google Cloud

1. Ative a **Google Calendar API** no projeto Google Cloud do app.
2. Em Google Auth Platform, mantenha o tipo de usuário e a audiência adequados. Durante **External / Testing**, confirme `mosaicolabs@gmail.com` como usuário de teste.
3. Na tela Data Access, mantenha somente `calendar.events.owned` para esta integração; não adicione escopos de perfil/e-mail ou acesso amplo ao calendário sem necessidade aprovada.
4. No cliente OAuth do tipo **Web application**, adicione o URI de redirecionamento autorizado exatamente como configurado na Vercel. Para o domínio canônico atual:

   ```text
   https://gestaocampanha15088.vercel.app/api/calendar/google/callback
   ```

   O domínio, protocolo, caminho e barra final (se houver) precisam coincidir exatamente. Para Preview, use uma URL estável registrada explicitamente ou faça a autorização pelo domínio canônico; não use curingas.
5. O segredo OAuth que o Console já mascarou não pode ser presumido como recuperável. Crie/rotacione um client secret pelo Console e transfira-o diretamente ao campo secreto da Vercel. Nunca o inclua no Git, frontend, issue, plano ou chat.

## Variáveis server-side

Cadastre em **Vercel → Project → Settings → Environment Variables**, com escopo por ambiente:

| Nome | Valor |
| --- | --- |
| `GOOGLE_CALENDAR_CLIENT_ID` | Client ID do OAuth Web |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Client secret criado/rotacionado no Console |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Callback HTTPS exato registrado no cliente OAuth |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | Base64 de 32 bytes aleatórios para AES-256-GCM |
| `GOOGLE_CALENDAR_ID` | `primary` (default) ou ID do calendário que a conta possui |

Gere a chave em uma estação segura e transfira-a diretamente ao Vercel como segredo; não imprima nem salve em arquivo versionado. Exemplo de geração local controlada: `node -p "require('node:crypto').randomBytes(32).toString('base64')"`. Use chaves diferentes em Preview e Production. Qualquer alteração de variáveis requer novo deploy.

## Preparar schema Neon

O Drizzle tem as tabelas no schema `lib/db/src/schema/google-calendar.ts`. A migration SQL aditiva e idempotente está em `lib/db/migrations/20260918_google_calendar_oauth.sql`.

1. Crie/seleciona uma branch Neon de teste e confirme backup/branch alvo.
2. Use a connection string direta, sem `-pooler`, em `DATABASE_URL` para migration.
3. Execute `pnpm --filter @workspace/db run migrate:google-calendar` e confira o resultado. O script rejeita host pooled.
4. Repita em Production somente após revisão do diff, testes na branch e aprovação operacional.

O runtime continua usando a URL pooled do Neon. A tabela de integração persiste somente o refresh token cifrado; a tabela de estados mantém temporariamente o verifier PKCE cifrado e o hash do state. O callback consome o state uma única vez.

## Conectar a conta pelo sistema

1. Publique o build depois de cadastrar as variáveis e aplicar a migration.
2. Entre como administrador global e abra **Acessos**.
3. Em **Google Calendar**, confirme a configuração e clique em **Conectar conta Google**.
4. Selecione a conta institucional correta e aceite o escopo de eventos próprios.
5. O callback retorna à tela Acessos. O status informa conectado e a data, nunca retorna tokens ou segredo.
6. Abra Agenda e teste a sincronização. Para testar escrita, use evento descartável e remova-o após validar.

Somente a permissão global `rbac:manage` pode iniciar ou consultar conexão. Permissões operacionais como `calendar:manage` continuam controlando eventos e não concedem gerenciamento da credencial global.

## Segurança e ciclo de vida

- O servidor usa Authorization Code com `access_type=offline`, PKCE S256, state aleatório, cookie `HttpOnly`/`SameSite=Lax` de dez minutos e consumo único no Neon.
- Refresh token no Neon usa AES-256-GCM. A chave existe apenas no ambiente server-side da Vercel; access token fica apenas no cache de memória da Function.
- Nunca registre `code`, `state`, cookie de correlação, headers `Authorization`, tokens ou corpos de token endpoint.
- Se `invalid_grant` indicar refresh token inválido/revogado, o status passa para `Reconexão necessária`; um administrador deve reconectar.
- A chave de criptografia é essencial para ler a credencial cifrada. Uma rotação exige um processo de recriptografia com as chaves antiga e nova; se a chave antiga for perdida, será necessário conectar a conta novamente.
- Eventos sincronizados usam o ID do calendário de origem, `eaCityId`/`eaSource`, deduplicação existente e escopo territorial. A sincronização pagina até 10 páginas por chamada; se o limite for atingido, a resposta indica sincronização parcial para permitir reexecução.

## External / Testing e produção contínua

Com escopo Calendar, refresh tokens emitidos enquanto o app estiver em **External / Testing** expiram após sete dias. O status “Conectado” confirma que uma autorização foi salva; não garante que continuará válida depois dessa janela. Durante piloto, reconecte quando necessário.

Antes de uso operacional contínuo, mova o app para **In production**, complete verificação/branding exigidos para o escopo sensível e faça uma nova autorização. Essa mudança precisa ser feita e validada no Google Cloud pelo responsável do app; código e configuração Vercel não removem a expiração do modo Testing.

## Diagnóstico rápido

| Sintoma | Verificação |
| --- | --- |
| Botão desabilitado / status indica configuração incompleta | Confira os nomes de variáveis exibidos na tela Acessos; não copie valores secretos para logs. |
| Redirect URI mismatch | Compare o `GOOGLE_CALENDAR_REDIRECT_URI` com a URI autorizada do cliente, caractere por caractere. |
| State inválido ou expirado | Inicie a autorização novamente no mesmo navegador; o fluxo dura dez minutos e usa cookie Lax. |
| Reconexão necessária | A conta revogou o acesso ou o refresh token expirou; reconecte. Em Testing, sete dias é esperado. |
| Calendário sem acesso / escopo | Confirme a conta Google selecionada e que ela possui o calendário configurado. Mantenha o escopo aprovado; não amplie escopo como tentativa genérica. |
| Migration falha com conexão | Use branch alvo confirmada e URL direta do Neon, sem `-pooler`; mantenha a URL pooled para o runtime. |

## Referências

- [Google Calendar API — autorização e escopos](https://developers.google.com/workspace/calendar/api/auth)
- [Google OAuth 2.0 — tokens e expiração](https://developers.google.com/identity/protocols/oauth2)
- [Google Auth Platform — audiência do app](https://support.google.com/cloud/answer/15549945?hl=en)
- [Vercel — variáveis de ambiente](https://vercel.com/docs/environment-variables)
