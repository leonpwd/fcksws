# FckSWS - QR Code Sync

Application ultra-légère pour partager des QR codes en temps réel via WebSocket.

## 🚀 Quick Start

### Développement local
```bash
# Installation
bun install

# Lancer le serveur (hot reload)
bun run dev

# Ouvrir le navigateur
open http://localhost:3000
```

### Production (Docker)
```bash
# Build + Run
docker build -t fcksws .
docker run -p 3000:3000 fcksws

# Ou avec docker-compose
docker-compose up -d
```

### Test
```bash
./test.sh
```

## 📋 Fonctionnalités

- **4 rooms isolées** : Chaque room a ses propres connexions WebSocket
- **Mode Scanneur** : Détecte et envoie les QR codes via la caméra
- **Mode Profiteur** : Reçoit et affiche les QR codes en temps réel
- **Ultra-rapide** : WebSocket natif Bun pour latence minimale (~100-300ms)
- **Léger** : ~50MB Docker image, <100KB frontend

## 🏗️ Stack

- **Runtime**: Bun
- **Framework**: Hono (3KB)
- **WebSocket**: Natif Bun
- **QR Detection**: jsQR
- **QR Generation**: qrcode.js
- **Frontend**: Vanilla JS (pas de framework)

## 📁 Structure

```
fcksws/
├── src/
│   ├── server.ts           # Serveur Hono + WebSocket
│   └── public/
│       ├── index.html      # UI
│       └── app.js          # Logique client
├── Dockerfile
└── package.json
```

## 🔧 Configuration

Le serveur écoute sur le port `3000` par défaut.

```typescript
// src/server.ts
const server = Bun.serve({
  port: process.env.PORT || 3000,
  // ...
});
```

### Variables d'environnement
```bash
PORT=3000    # Port du serveur
```

## 📝 Notes

- Les QR codes Sowesign changent toutes les 5s
- Fenêtre de transmission : ~2-4s après détection
- Le mode scanneur nécessite HTTPS en production (getUserMedia)

## 🌐 Déploiement

### Déploiement rapide

**Railway / Render / Fly.io :**
```bash
# 1. Connecter le repo Git
# 2. Définir Dockerfile comme buildpack
# 3. Port 3000 (auto-détecté)
# 4. Deploy !
```

**VPS (Ubuntu/Debian) :**
```bash
# Installer Bun
curl -fsSL https://bun.sh/install | bash

# Cloner et lancer
git clone <repo>
cd fcksws
bun install
bun run build
PORT=3000 bun run start
```

### HTTPS (obligatoire pour caméra)

Le mode scanneur nécessite HTTPS (sauf localhost). Solutions :
- **Reverse proxy** : Nginx/Caddy avec Let's Encrypt
- **Cloudflare** : SSL gratuit
- **Railway/Render** : HTTPS automatique
