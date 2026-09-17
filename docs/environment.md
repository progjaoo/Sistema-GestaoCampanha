# Variáveis de ambiente

O arquivo `.env.example` contém nomes e exemplos sem segredos. Variáveis usadas pelo runtime:

| Variável                        | Obrigatória  | Uso                                                       |
| ------------------------------- | ------------ | --------------------------------------------------------- |
| `DATABASE_URL`                  | Sim          | Conexão PostgreSQL/Neon                                   |
| `SESSION_SECRET`                | Sim          | Assinatura dos tokens de sessão                           |
| `GOOGLE_SHEETS_SPREADSHEET_URL` | Produção     | URL oficial da planilha; preferida ao ID isolado          |
| `GOOGLE_SHEETS_SPREADSHEET_ID`  | Alternativa  | ID da planilha, caso a URL não seja usada                 |
| `GOOGLE_SERVICE_ACCOUNT_JSON`   | Produção     | JSON secreto da conta de serviço somente leitura          |
| `APP_ORIGIN`                    | Recomendável | Origem permitida para CORS quando houver origem diferente |
| `ADMIN_GENERAL_EMAIL`           | Recomendável | E-mail do administrador bootstrap                         |
| `ADMIN_GENERAL_PASSWORD`        | Produção     | Senha inicial do administrador                            |
| `ADMIN_SECONDARY_PASSWORD`      | Opcional     | Senha para o administrador secundário legado              |
| `PORT`                          | Local        | Porta do processo local; default do Vite: 5173            |
| `BASE_PATH`                     | Opcional     | Base do Vite; default `/`                                 |

## Regras

- Produção deve usar `DATABASE_URL` do branch correto do Neon.
- Use `GOOGLE_SHEETS_SPREADSHEET_URL` com a URL oficial fornecida para evitar apontar acidentalmente para outra planilha.
- O JSON da conta de serviço pode ter `private_key` com `\\n` ou quebras de linha reais; a aplicação normaliza os escapes.
- Os segredos devem ser cadastrados no Vercel por ambiente (`Preview` e `Production`) e não no GitHub.
- Após mudar qualquer variável, faça novo deploy para garantir que a Function receba a configuração.
