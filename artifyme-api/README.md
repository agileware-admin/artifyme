# ArtifyMe Backend

Backend API para a aplicação ArtifyMe - Transformação artística de imagens com IA.

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │────▶│   Nginx LB      │────▶│   API Server    │
│   (React)       │     │                 │     │   (Express)     │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │              ┌────────▼────────┐
                                 │              │                 │
                                 ▼              │   PostgreSQL    │
                        ┌─────────────────┐     │                 │
                        │                 │     └─────────────────┘
                        │   WebSocket     │              │
                        │   Server        │     ┌────────▼────────┐
                        │                 │     │                 │
                        └────────┬────────┘     │   Redis         │
                                 │              │   (Cache/Pub)   │
                                 └──────────────┘                 │
                                                └─────────────────┘
```

## 🚀 Quick Start

### Pré-requisitos

- Docker & Docker Compose
- Node.js 20+ (para desenvolvimento local)

### Desenvolvimento Local

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Editar .env com suas configurações

# 3. Iniciar serviços
docker-compose up -d

# 4. Executar migrações
npm run db:migrate

# 5. (Opcional) Seed inicial
npm run db:seed
```

### Produção

```bash
# Build e deploy
docker-compose -f docker-compose.yml up -d --build
```

## 📁 Estrutura do Projeto

```
backend/
├── src/
│   ├── server.ts            # Entry point API
│   ├── websocket-server.ts  # Entry point WebSocket
│   ├── routes/              # Rotas da API
│   │   ├── auth.routes.ts
│   │   ├── transform.routes.ts
│   │   ├── payment.routes.ts
│   │   ├── user.routes.ts
│   │   ├── admin.routes.ts
│   │   └── webhook.routes.ts
│   ├── middleware/          # Middlewares
│   │   ├── keycloak.ts
│   │   └── errorHandler.ts
│   ├── services/            # Serviços externos
│   │   ├── redis.service.ts
│   │   ├── n8n.service.ts
│   │   ├── stripe.service.ts
│   │   └── asaas.service.ts
│   └── database/
│       └── connection.ts
├── prisma/
│   └── schema.prisma        # Schema do banco
├── nginx/
│   └── nginx.conf           # Config Nginx
├── keycloak/
│   └── realm-export.json    # Config Keycloak
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## 🔌 Integrações

### Keycloak (Autenticação)

- URL: `http://localhost:8080`
- Admin: `admin` / (definido em KEYCLOAK_ADMIN_PASSWORD)
- Realm: `artifyme`

### N8N (Processamento de Imagens)

O N8N recebe webhooks com:
```json
{
  "jobId": "uuid",
  "image": "base64_encoded_image",
  "style": "cartoon|graffiti|...",
  "callbackUrl": "https://api.domain.com/api/webhooks/n8n/transformation-complete"
}
```

E retorna:
```json
{
  "jobId": "uuid",
  "status": "success|error",
  "outputUrl": "https://storage.domain.com/transformed/image.jpg",
  "error": "optional error message"
}
```

### Asaas (Pagamentos Brasil)

- Sandbox: `https://sandbox.asaas.com`
- Produção: `https://api.asaas.com`
- Webhook events: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `SUBSCRIPTION_*`

### Stripe (Pagamentos Portugal)

- Webhook events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.*`

## 🔒 Segurança

- Autenticação via Keycloak (OAuth2/OIDC)
- Rate limiting por IP
- Helmet para headers de segurança
- Validação de input com Zod
- CORS configurável

## 📊 Endpoints Principais

### Autenticação
- `GET /api/auth/config` - Configuração Keycloak
- `POST /api/auth/token` - Troca código por tokens
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### Transformações
- `POST /api/transform/start` - Iniciar transformação
- `GET /api/transform/status/:jobId` - Status da transformação
- `GET /api/transform/history` - Histórico do usuário
- `GET /api/transform/styles` - Estilos disponíveis

### Pagamentos
- `POST /api/payments/credits/purchase` - Comprar créditos
- `POST /api/payments/subscribe` - Assinar plano
- `GET /api/payments/subscription` - Status da assinatura
- `GET /api/payments/plans` - Planos disponíveis

### Admin
- `GET /api/admin/dashboard` - Métricas gerais
- `GET /api/admin/users` - Listar usuários
- `GET /api/admin/orders` - Listar pedidos

## 🐳 Docker Services

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| nginx | 80/443 | Load Balancer |
| frontend | - | React App |
| api | 3000 | Express API |
| websocket | 3001 | WebSocket Server |
| postgres | 5432 | Database |
| redis | 6379 | Cache/Pub-Sub |
| keycloak | 8080 | Auth Server |

## 📝 Scripts

```bash
npm run dev         # Desenvolvimento
npm run build       # Build
npm run start       # Produção
npm run db:migrate  # Migrações
npm run db:seed     # Seed
npm run lint        # Linting
npm run test        # Testes
```

## 🔧 Configuração

Variáveis de ambiente importantes:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL PostgreSQL |
| `REDIS_URL` | URL Redis |
| `KEYCLOAK_*` | Configurações Keycloak |
| `N8N_WEBHOOK_URL` | Webhook N8N |
| `ASAAS_API_KEY` | API Key Asaas |
| `STRIPE_SECRET_KEY` | Secret Key Stripe |

## 📄 Licença

Proprietário - ArtifyMe © 2024
