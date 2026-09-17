# API

## Base e autenticação

Em produção, a API usa o mesmo domínio do frontend e o prefixo `/api`. Exemplo: `https://gestaocampanha15088.vercel.app/api/healthz`.

Rotas protegidas exigem `Authorization: Bearer <token>`. O login retorna token e usuário; o frontend usa `authFetch` para anexá-lo.

## Recursos principais

| Grupo        | Rotas representativas                                                                            | Regra                           |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| Saúde        | `GET /api/healthz`                                                                               | Verificação do processo         |
| Autenticação | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`                              | Sessão e identidade             |
| Campanha     | `GET /api/campaign/overview`, `/api/regions`, `/api/cities`, `/api/deputies`, `/api/leaderships` | Escopo territorial e permissões |
| Revisão      | `GET /api/review/issues`                                                                         | Conferência de inconsistências  |
| Operações    | tarefas, quadros, agenda e compartilhamentos em `/api/*`                                         | RBAC e escopo                   |
| Materiais    | catálogo e retiradas em `/api/*`                                                                 | RBAC e escopo                   |
| Planilha     | `GET /api/sheets/campaign?tab=<nome>`                                                            | `sheets:view`, somente leitura  |

O arquivo `lib/api-spec/openapi.yaml` é a referência formal existente para os endpoints documentados. A rota Sheets existente deve ser mantida compatível com a tela atual; quando o contrato for formalizado no OpenAPI, regenere os clientes.

## Resposta da planilha

`GET /api/sheets/campaign` retorna título, URL, lista de abas, aba selecionada, cabeçalhos, linhas, total de linhas e `matches` com as linhas cruzadas no banco. Falha de credencial, acesso ou leitura retorna erro 502 genérico.

## Permissões

A permissão `sheets:view` está definida para os papéis que podem consultar a integração. A rota deve continuar usando `requirePermission("sheets:view")`; não remova esse guard para facilitar testes manuais.
