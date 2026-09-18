# Banco de dados — Neon

## Recurso destinado ao projeto

- Projeto: `sistema-campanha`
- Região: `aws-us-east-2`
- Branch: `production`
- Banco: `neondb`
- Owner observado: `neondb_owner`

O projeto existente deve ser reaproveitado. Não delete, resete ou recrie a branch para instalar o sistema.

## Configuração

1. No Neon, copie a connection string pooled da branch `production` para o runtime Vercel.
2. Cadastre-a como `DATABASE_URL` no Vercel em `Preview` e `Production` conforme o ambiente.
3. Para desenvolvimento local, use uma cópia segura em `.env`.
4. Aplique o schema:

```bash
pnpm --filter @workspace/db run push
```

5. Carregue os dados normalizados de campanha:

```bash
pnpm --filter @workspace/scripts run seed:campaign
```

Para migrations, use a connection string direta (sem `-pooler`), de preferência em uma branch Neon de teste. A migration aditiva do OAuth Calendar fica em `lib/db/migrations/20260918_google_calendar_oauth.sql` e pode ser aplicada com `pnpm --filter @workspace/db run migrate:google-calendar` após definir `DATABASE_URL` para a branch correta. Não execute em Production antes de revisar a migration e confirmar backup/branch; não use a URL pooled para migrations.

O seed é idempotente e valida as contagens esperadas antes de inserir. Faça uma cópia/branch de teste antes de alterar a produção.

## Modelo

As entidades principais são regiões, cidades, deputados federais, articuladores, coordenadores, lideranças e pendências de revisão. Há também tabelas de autenticação, tarefas, quadros, agenda, notificações e materiais.

O carregamento usa chaves naturais e origem da linha para rastrear a planilha. Linhas incompletas são preservadas e marcadas para revisão.

## Vercel

O backend abre a conexão por `DATABASE_URL` em cada instância serverless. Use a string pooled fornecida pelo Neon e evite criar pools grandes. Variáveis de banco nunca devem ser expostas ao frontend com prefixo `VITE_`.

## Operação segura

- Não use `push-force` em produção sem revisão e backup.
- Não execute SQL destrutivo para “limpar” o banco sem confirmação do alvo.
- Inspecione schema e contagens após aplicar o seed.
- Mantenha a branch `production` protegida quando a operação estiver estabilizada.
