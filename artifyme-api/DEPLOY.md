# 🚀 Guia Completo de Deploy - ArtifyMe Backend

Este guia contém todos os passos necessários para fazer o deploy completo do backend da aplicação ArtifyMe.

---

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Preparação do Servidor](#preparação-do-servidor)
3. [Configuração do Ambiente](#configuração-do-ambiente)
4. [Deploy com Docker Compose](#deploy-com-docker-compose)
5. [Configuração do Keycloak](#configuração-do-keycloak)
6. [Configuração de SSL/HTTPS](#configuração-de-sslhttps)
7. [Configuração de DNS](#configuração-de-dns)
8. [Integrações Externas](#integrações-externas)
9. [Monitoramento e Logs](#monitoramento-e-logs)
10. [Backup e Recuperação](#backup-e-recuperação)
11. [Troubleshooting](#troubleshooting)
12. [Checklist de Deploy](#checklist-de-deploy)

---

## 📦 Pré-requisitos

### Requisitos do Servidor

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| CPU | 2 vCPUs | 4 vCPUs |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

### Software Necessário

- Docker 24.0+
- Docker Compose 2.20+
- Git
- Certbot (para SSL)
- Domínio configurado

### Provedores Recomendados

- **VPS**: DigitalOcean, Vultr, Linode, AWS EC2, Google Cloud
- **Brasil**: Locaweb, Hostinger, Contabo

---

## 🖥️ Preparação do Servidor

### 1. Conectar ao Servidor

```bash
ssh root@seu-servidor-ip
```

### 2. Atualizar o Sistema

```bash
apt update && apt upgrade -y
```

### 3. Instalar Docker

```bash
# Instalar dependências
apt install -y apt-transport-https ca-certificates curl software-properties-common

# Adicionar chave GPG do Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Adicionar repositório
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar instalação
docker --version
docker compose version
```

### 4. Criar Usuário para Deploy (Opcional, Recomendado)

```bash
# Criar usuário
adduser deploy

# Adicionar ao grupo docker
usermod -aG docker deploy

# Dar permissões sudo
usermod -aG sudo deploy

# Trocar para o usuário
su - deploy
```

### 5. Configurar Firewall

```bash
# Habilitar UFW
ufw enable

# Permitir SSH
ufw allow 22

# Permitir HTTP e HTTPS
ufw allow 80
ufw allow 443

# Verificar status
ufw status
```

---

## ⚙️ Configuração do Ambiente

### 1. Clonar o Repositório

```bash
# Criar diretório do projeto
mkdir -p /opt/artifyme
cd /opt/artifyme

# Clonar repositório (ou copiar arquivos)
git clone https://seu-repositorio.git .

# Ou copiar via SCP
# scp -r ./backend user@servidor:/opt/artifyme/
```

### 2. Criar Arquivo de Ambiente

```bash
cd /opt/artifyme/backend
cp .env.example .env
nano .env
```

### 3. Configurar Variáveis de Ambiente

Edite o arquivo `.env` com suas configurações:

```env
# ===========================================
# Application
# ===========================================
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://seu-dominio.com
JWT_SECRET=GERE_UMA_CHAVE_SEGURA_DE_32_CARACTERES_AQUI

# ===========================================
# PostgreSQL Database
# ===========================================
POSTGRES_USER=artifyme
POSTGRES_PASSWORD=SUA_SENHA_FORTE_AQUI
POSTGRES_DB=artifyme_db

# ===========================================
# Redis
# ===========================================
REDIS_URL=redis://redis:6379

# ===========================================
# Keycloak Authentication
# ===========================================
KEYCLOAK_URL=https://auth.seu-dominio.com
KEYCLOAK_REALM=artifyme
KEYCLOAK_CLIENT_ID=artifyme-app
KEYCLOAK_CLIENT_SECRET=SEU_CLIENT_SECRET_AQUI

# Keycloak Admin Credentials
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=SUA_SENHA_ADMIN_AQUI
FRONTEND_URL=https://seu-dominio.com

# ===========================================
# N8N Integration
# ===========================================
N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/transform
N8N_API_KEY=SUA_API_KEY_N8N

# ===========================================
# Asaas Payment (Brazil)
# ===========================================
ASAAS_API_KEY=SUA_API_KEY_ASAAS
ASAAS_ENVIRONMENT=production

# ===========================================
# Stripe Payment (Portugal)
# ===========================================
STRIPE_SECRET_KEY=sk_live_SUA_CHAVE_SECRETA
STRIPE_WEBHOOK_SECRET=whsec_SEU_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY=pk_live_SUA_CHAVE_PUBLICA
```

### 4. Gerar Chaves Seguras

```bash
# Gerar JWT_SECRET
openssl rand -base64 32

# Gerar POSTGRES_PASSWORD
openssl rand -base64 24

# Gerar KEYCLOAK_ADMIN_PASSWORD
openssl rand -base64 16
```

---

## 🐳 Deploy com Docker Compose

### 1. Verificar Arquivos

```bash
cd /opt/artifyme/backend

# Verificar estrutura
ls -la
# Deve conter:
# - docker-compose.yml
# - Dockerfile
# - .env
# - nginx/
# - keycloak/
# - database/
# - prisma/
```

### 2. Iniciar os Serviços

```bash
# Build e start em background
docker compose up -d --build

# Acompanhar logs
docker compose logs -f
```

### 3. Verificar Status dos Containers

```bash
# Listar containers
docker compose ps

# Verificar saúde
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### 4. Executar Migrações do Banco

```bash
# Entrar no container da API
docker compose exec api sh

# Executar migrações Prisma
npx prisma migrate deploy

# Gerar cliente Prisma
npx prisma generate

# Sair do container
exit
```

### 5. Verificar Serviços

| Serviço | URL Local | Porta |
|---------|-----------|-------|
| API | http://localhost:3000 | 3000 |
| WebSocket | ws://localhost:3001 | 3001 |
| Keycloak | http://localhost:8080 | 8080 |
| PostgreSQL | localhost:5432 | 5432 |
| Redis | localhost:6379 | 6379 |

---

## 🔐 Configuração do Keycloak

### 1. Acessar Console Admin

Acesse: `http://seu-servidor:8080/admin`

- **Usuário**: valor de `KEYCLOAK_ADMIN_USER`
- **Senha**: valor de `KEYCLOAK_ADMIN_PASSWORD`

### 2. Verificar Realm

O realm `artifyme` é importado automaticamente via `realm-export.json`.

Verifique:
- Realm Settings → General
- Clients → artifyme-app
- Clients → artifyme-api

### 3. Configurar Redirect URIs

Em **Clients → artifyme-app → Settings**:

```
Valid Redirect URIs:
- https://seu-dominio.com/*
- https://www.seu-dominio.com/*

Web Origins:
- https://seu-dominio.com
- https://www.seu-dominio.com
```

### 4. Configurar SMTP para Emails

Em **Realm Settings → Email**:

```
Host: smtp.gmail.com (ou seu provedor)
Port: 587
From: noreply@seu-dominio.com
Enable SSL: OFF
Enable StartTLS: ON
Authentication: ON
Username: seu-email@gmail.com
Password: sua-app-password
```

> **Nota**: Para Gmail, use uma "App Password", não a senha normal.

### 5. Exportar Nova Configuração (Opcional)

```bash
# Exportar realm atualizado
docker compose exec keycloak /opt/keycloak/bin/kc.sh export --dir /tmp/export --realm artifyme

# Copiar para host
docker compose cp keycloak:/tmp/export/artifyme-realm.json ./keycloak/realm-export.json
```

---

## 🔒 Configuração de SSL/HTTPS

### 1. Instalar Certbot

```bash
apt install -y certbot python3-certbot-nginx
```

### 2. Obter Certificados

```bash
# Parar Nginx temporariamente
docker compose stop nginx

# Obter certificados
certbot certonly --standalone -d api.seu-dominio.com -d auth.seu-dominio.com -d ws.seu-dominio.com

# Reiniciar Nginx
docker compose start nginx
```

### 3. Atualizar Configuração Nginx

Edite `nginx/nginx.conf` para usar SSL:

```nginx
# API Server
server {
    listen 443 ssl http2;
    server_name api.seu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/api.seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.seu-dominio.com/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    location / {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# WebSocket Server
server {
    listen 443 ssl http2;
    server_name ws.seu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/ws.seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ws.seu-dominio.com/privkey.pem;

    location / {
        proxy_pass http://websocket:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# Keycloak
server {
    listen 443 ssl http2;
    server_name auth.seu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/auth.seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/auth.seu-dominio.com/privkey.pem;

    location / {
        proxy_pass http://keycloak:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.seu-dominio.com auth.seu-dominio.com ws.seu-dominio.com;
    return 301 https://$server_name$request_uri;
}
```

### 4. Montar Certificados no Docker

Atualize `docker-compose.yml`:

```yaml
nginx:
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 5. Renovação Automática

```bash
# Testar renovação
certbot renew --dry-run

# Adicionar cron job
crontab -e

# Adicionar linha:
0 3 * * * certbot renew --quiet && docker compose restart nginx
```

---

## 🌐 Configuração de DNS

### Registros Necessários

Configure no seu provedor de DNS:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | api | IP_DO_SERVIDOR | 300 |
| A | auth | IP_DO_SERVIDOR | 300 |
| A | ws | IP_DO_SERVIDOR | 300 |
| CNAME | www | seu-dominio.com | 300 |

### Verificar Propagação

```bash
# Verificar DNS
dig api.seu-dominio.com
dig auth.seu-dominio.com

# Ou usar online
# https://dnschecker.org/
```

---

## 🔗 Integrações Externas

### N8N (Processamento de Imagens)

1. Configure seu workflow no N8N
2. Obtenha a URL do webhook
3. Gere uma API key
4. Atualize `.env`:
   ```
   N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/transform
   N8N_API_KEY=sua-api-key
   ```

### Asaas (Pagamentos Brasil)

1. Crie conta em https://www.asaas.com/
2. Acesse **Integrações → API**
3. Copie a API Key
4. Atualize `.env`:
   ```
   ASAAS_API_KEY=$aact_sua_api_key
   ASAAS_ENVIRONMENT=production
   ```

### Stripe (Pagamentos Internacional)

1. Acesse https://dashboard.stripe.com/
2. Obtenha as chaves em **Developers → API Keys**
3. Configure webhook em **Developers → Webhooks**
   - Endpoint: `https://api.seu-dominio.com/webhook/stripe`
   - Eventos: `checkout.session.completed`, `payment_intent.succeeded`
4. Atualize `.env`:
   ```
   STRIPE_SECRET_KEY=sk_live_xxx
   STRIPE_PUBLISHABLE_KEY=pk_live_xxx
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

---

## 📊 Monitoramento e Logs

### Ver Logs em Tempo Real

```bash
# Todos os serviços
docker compose logs -f

# Serviço específico
docker compose logs -f api
docker compose logs -f keycloak

# Últimas 100 linhas
docker compose logs --tail 100 api
```

### Verificar Recursos

```bash
# Uso de recursos dos containers
docker stats

# Espaço em disco
df -h

# Memória
free -m
```

### Configurar Log Rotation

```bash
# Criar arquivo de configuração
nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
# Reiniciar Docker
systemctl restart docker
```

---

## 💾 Backup e Recuperação

### Backup do Banco de Dados

```bash
# Criar script de backup
nano /opt/artifyme/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/artifyme/backups

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose exec -T postgres pg_dump -U artifyme artifyme_db > $BACKUP_DIR/db_$DATE.sql

# Compactar
gzip $BACKUP_DIR/db_$DATE.sql

# Remover backups antigos (manter últimos 7 dias)
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: db_$DATE.sql.gz"
```

```bash
# Dar permissão de execução
chmod +x /opt/artifyme/backup.sh

# Adicionar ao cron (diário às 2h)
crontab -e
0 2 * * * /opt/artifyme/backup.sh
```

### Restaurar Backup

```bash
# Descompactar
gunzip backups/db_20240101_020000.sql.gz

# Restaurar
docker compose exec -T postgres psql -U artifyme artifyme_db < backups/db_20240101_020000.sql
```

### Backup Completo (Volumes Docker)

```bash
# Parar serviços
docker compose stop

# Backup dos volumes
tar -czvf backup_volumes_$(date +%Y%m%d).tar.gz \
  /var/lib/docker/volumes/artifyme_postgres_data \
  /var/lib/docker/volumes/artifyme_redis_data

# Reiniciar serviços
docker compose start
```

---

## 🔧 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs servicename

# Verificar configuração
docker compose config

# Rebuildar
docker compose up -d --build --force-recreate servicename
```

### Erro de conexão com banco

```bash
# Verificar se PostgreSQL está rodando
docker compose exec postgres pg_isready

# Testar conexão
docker compose exec api npx prisma db push
```

### Keycloak não acessível

```bash
# Verificar logs
docker compose logs keycloak

# Verificar se banco está pronto
docker compose exec keycloak /opt/keycloak/bin/kc.sh show-config
```

### Erro de permissão

```bash
# Verificar permissões dos volumes
ls -la /var/lib/docker/volumes/

# Corrigir permissões
chown -R 1000:1000 /opt/artifyme
```

### Limpar e recomeçar

```bash
# CUIDADO: Remove todos os dados
docker compose down -v
docker system prune -a
docker compose up -d --build
```

---

## ✅ Checklist de Deploy

### Antes do Deploy
- [ ] Servidor provisionado com requisitos mínimos
- [ ] Docker e Docker Compose instalados
- [ ] Domínio configurado e propagado
- [ ] Chaves de API obtidas (Asaas, Stripe, N8N)

### Durante o Deploy
- [ ] Arquivo `.env` configurado com todas as variáveis
- [ ] Senhas fortes geradas
- [ ] Docker Compose iniciado com sucesso
- [ ] Todos os containers healthy

### Configuração do Keycloak
- [ ] Realm `artifyme` verificado
- [ ] Redirect URIs configuradas
- [ ] SMTP configurado e testado
- [ ] Client secrets atualizados

### SSL/HTTPS
- [ ] Certificados obtidos para todos os subdomínios
- [ ] Nginx configurado com SSL
- [ ] Renovação automática configurada

### Integrações
- [ ] N8N webhook testado
- [ ] Asaas webhook configurado
- [ ] Stripe webhook configurado

### Pós-Deploy
- [ ] Backup automático configurado
- [ ] Monitoramento ativo
- [ ] Logs sendo coletados
- [ ] Teste completo da aplicação

### Frontend (Lovable)
- [ ] Variáveis de API atualizadas em `src/config/api.ts`
- [ ] Keycloak URLs atualizadas
- [ ] Deploy do frontend realizado

---

## 📞 Suporte

Em caso de problemas:

1. Verifique os logs: `docker compose logs -f`
2. Consulte a documentação dos serviços
3. Verifique o status dos containers: `docker compose ps`

---

**Última atualização**: Dezembro 2024
