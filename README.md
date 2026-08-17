# Nexus AI

Assistant IA (chat) propulsé par Groq. Le dépôt est séparé en deux :

```
frontend/   → site statique (HTML/CSS/JS) déployé sur Firebase Hosting → nexus-ai.web.app
backend/    → API Node/Express (auth, conversations, mémoire, proxy Groq) déployée sur Cloud Run
```

## Frontend

Site statique, aucune étape de build. En local :

```bash
cd frontend
python3 -m http.server 5173      # puis ouvrir http://localhost:5173
```

L'URL de l'API se configure dans [`frontend/js/config.js`](frontend/js/config.js)
(`window.NEXUS_CONFIG.API_BASE`). Par défaut, il pointe sur l'API existante ;
bascule-le sur l'URL Cloud Run quand ton nouveau backend est en ligne.

## Backend

```bash
cd backend
cp .env.example .env      # renseigner GROQ_API_KEY + JWT_SECRET
npm install
npm run dev               # http://localhost:8080
```

> Le stockage est **en mémoire** par défaut (pratique pour démarrer). Pour la
> production, remplace l'objet `store` de `server.js` par Firestore ou une base
> de données (les emplacements sont balisés `TODO`).

## Déploiement

Voir **[DEPLOY.md](DEPLOY.md)** pour les commandes complètes (Cloud Build +
Firebase Hosting + Cloud Run).
