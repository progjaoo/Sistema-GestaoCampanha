# Plano de implementação: Vercel, Neon e Google Sheets

> Branch: `codex/vercel-neon-google-sheets`

## 1. Criar o contrato de configuração e o provedor Google

- Adicionar parsing seguro de URL/ID da planilha.
- Implementar OAuth JWT da conta de serviço usando APIs nativas do Node.
- Adicionar cache curto do access token e injeção de request para testes.
- Manter fallback Replit somente fora de produção quando a conta de serviço não estiver configurada.
- Escrever testes primeiro para configuração, autenticação e chamadas GET.

## 2. Adaptar o backend para Vercel

- Criar `api/index.ts` como entrypoint serverless.
- Tornar CORS configurável e seguro para produção.
- Adicionar handler de erro sem vazamento de detalhes.
- Garantir que o entrypoint de servidor local continue separado do handler Vercel.
- Atualizar a rota Sheets para usar a referência configurada e preservar o contrato da UI.

## 3. Adaptar o frontend e o build

- Remover exigências de `PORT` e `BASE_PATH` do build Vite, mantendo defaults úteis para Replit/local.
- Criar `vercel.json` com build apenas do frontend, saída estática, Function `/api` e fallback SPA.
- Validar build direcionado e assets PWA.

## 4. Documentar o projeto

- Criar `docs/README.md` como índice principal.
- Criar documentos de arquitetura, setup local, variáveis, guidelines, API, testes, segurança, Google Sheets, Neon, Vercel/GitHub, dados e troubleshooting.
- Registrar que o plugin Sheets está indisponível no ambiente atual e que o runtime publicado usa API nativa.

## 5. Validar e preparar entrega

- Rodar typecheck, build, testes direcionados e inspeção do diff.
- Verificar ausência de segredos e arquivos gerados no Git.
- Tentar confirmar remote GitHub e estado da branch sem alterar o repositório remoto automaticamente.
- Reportar o que ficou pronto e os passos externos que exigem credenciais/ação no Vercel, Neon ou Google Cloud.
