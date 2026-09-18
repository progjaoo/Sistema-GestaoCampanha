# Testes e verificação

## Obrigatórios antes de publicar

```bash
pnpm typecheck
pnpm --filter @workspace/campanha-ea-2026 run build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/scripts run test:sheets
pnpm --filter @workspace/scripts run test:calendar-oauth
pnpm --filter @workspace/scripts run test:api
```

## Cobertura desta alteração

O teste `artifacts/api-server/test/google-sheets.test.ts` cobre:

- extração do ID a partir da URL oficial;
- prioridade da URL sobre o ID isolado;
- rejeição de configuração ausente em produção;
- criação de token OAuth JWT com a conta de serviço;
- uso de `GET` para a API Sheets.

O teste de API existente cobre autenticação, RBAC, agenda, avisos, tarefas e escopo operacional. Ele exige um banco preparado e dados seed.

`test:calendar-oauth` valida cifra AES-256-GCM, detecção de adulteração, chave de 32 bytes, state e parâmetros do fluxo PKCE/escopo. O teste de API confirma que a conexão OAuth exige `rbac:manage` e que a sincronização percorre páginas. Os testes não chamam nem alteram uma agenda Google real.

## Falhas de ambiente

Se o teste `tsx` no Windows falhar antes de executar com `uv_os_get_passwd returned ENOMEM`, isso é limitação do runtime/sistema e não uma asserção do projeto. Registre a falha, valide typecheck/build e execute os testes em ambiente Linux/CI quando necessário.

## Validação manual

- Atualize diretamente uma rota SPA para confirmar rewrite.
- Confirme que usuário sem `sheets:view` recebe 403.
- Confirme que o endpoint retorna 502 sem credencial válida.
- Confirme que a planilha não é modificada após várias leituras.
