# Documentação — Gestão da Campanha EA 2026

Este é o índice principal do projeto. A documentação descreve o estado atual, os padrões de desenvolvimento e o caminho de publicação.

## Visão rápida

| Item              | Definição                                                                             |
| ----------------- | ------------------------------------------------------------------------------------- |
| Tipo              | Web + API, responsivo e instalável como PWA                                           |
| Frontend          | React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI, TanStack Query, Wouter        |
| Backend           | Node.js, Express 5, TypeScript, Zod                                                   |
| Dados             | PostgreSQL no Neon, Drizzle ORM                                                       |
| Integrações       | Google Sheets somente leitura e Google Calendar                                       |
| Deploy            | Vercel, projeto único com frontend estático + Function Express                        |
| Repositório       | [progjaoo/Sistema-GestaoCampanha](https://github.com/progjaoo/Sistema-GestaoCampanha) |
| Domínio planejado | `gestaocampanha15088.vercel.app`                                                      |

## Documentos

- [Diagnóstico e status](diagnostico.md) — estrutura encontrada, decisões e pendências externas.
- [Arquitetura](architecture.md) — camadas, fluxo de dados e limites entre frontend, API e serviços.
- [Setup local](setup-local.md) — instalação e comandos para começar.
- [Variáveis de ambiente](environment.md) — configuração local e de produção sem expor segredos.
- [Guidelines e padrões](development-guidelines.md) — convenções de código, dados, API e UI.
- [API](api.md) — prefixos, autenticação, permissões e principais recursos.
- [Testes](testing.md) — estratégia, comandos e interpretação dos resultados.
- [Google Sheets](google-sheets.md) — planilha oficial, acesso somente leitura e configuração da conta de serviço.
- [Google Calendar](google-calendar.md) — conexão OAuth server-side, credenciais protegidas e operação na Vercel.
- [Banco no Neon](database-neon.md) — projeto, branch, schema, seed e operação segura.
- [Deploy no Vercel](deploy-vercel.md) — conexão GitHub, variáveis, domínio e validação.
- [Segurança](security.md) — segredos, autenticação, CORS e riscos conhecidos.
- [Dados de origem](source-data.md) — planilhas, CSVs, entidades normalizadas e regras de importação.
- [Troubleshooting](troubleshooting.md) — problemas frequentes e diagnóstico.

## Ordem recomendada

1. Leia [Diagnóstico e status](diagnostico.md).
2. Configure o ambiente seguindo [Setup local](setup-local.md) e [Variáveis de ambiente](environment.md).
3. Prepare o banco conforme [Banco no Neon](database-neon.md).
4. Configure o acesso da planilha conforme [Google Sheets](google-sheets.md).
5. Rode as verificações de [Testes](testing.md).
6. Publique com [Deploy no Vercel](deploy-vercel.md).
