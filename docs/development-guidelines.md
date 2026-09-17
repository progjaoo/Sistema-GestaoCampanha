# Guidelines e padrões

## Organização

- Coloque UI em `artifacts/campanha-ea-2026`.
- Coloque HTTP, autenticação e integrações em `artifacts/api-server`.
- Coloque schema e acesso a dados em `lib/db`.
- Compartilhe contratos via `lib/api-spec`, `lib/api-client-react` e `lib/api-zod`.
- Não use `artifacts/mockup-sandbox` como destino de produção.

## TypeScript e backend

- Mantenha `strict` e o typecheck sem supressões desnecessárias.
- Valide entradas de rota com schemas Zod e converta falhas em respostas HTTP claras.
- Preserve a separação entre `app.ts` (composição Express) e `index.ts` (processo local).
- Prefira erros genéricos para o cliente e logs estruturados para diagnóstico interno.
- Não faça chamadas de escrita ao Google Sheets: o contrato da integração é somente leitura.

## Banco e dados

- Use Drizzle para consultas e alterações de schema.
- Preserve chaves naturais e a origem (`Aba_Origem` + `Linha_Origem`) usada para deduplicação e rastreio.
- Não descarte linhas incompletas; marque inconsistências para revisão.
- Use transações em seed e operações que alterem múltiplas tabelas.
- Não rode `push-force` em produção sem backup e revisão explícita.

## Frontend

- Use TanStack Query para dados remotos e os helpers de autenticação existentes.
- Mantenha acessibilidade, responsividade e estados de loading/erro/vazio.
- O token nunca deve ser enviado para `localStorage` de forma adicional nem exposto em logs.
- A tela Planilha deve continuar claramente identificada como somente leitura.

## Git e revisão

- Faça mudanças pequenas e coesas.
- Atualize a documentação quando mudar configuração, contrato ou fluxo operacional.
- Antes de abrir PR, rode typecheck, testes e build.
- Nunca commite `.env`, JSON de service account, dumps de banco ou arquivos gerados.
