# Nexus AI

Assistant IA (chat) premium, **multi-modèles** (Groq + Google Gemini), avec
comptes utilisateurs, mémoire, recherche web, notifications push, quota et
abonnement. Le dépôt est séparé en deux :

```
frontend/   → site statique (HTML/CSS/JS), déployé sur Firebase Hosting  → https://nexus-ai-608af.web.app
backend/    → API Node/Express, déployée sur Cloud Run (europe-west1)     → Firestore pour la persistance
```

Déploiement piloté par **Cloud Build** (backend) et **Firebase Hosting** (frontend).
Toutes les commandes sont dans **[DEPLOY.md](DEPLOY.md)**.

---

## Fonctionnalités

### Interface premium
- Design **glassmorphism** (verre dépoli, dégradés aurora, typographie soignée),
  page de connexion travaillée, **icônes 100 % SVG** (aucun emoji dans l'UI).
- Sélecteur de modèle dans le chat, **compteur tokens/seconde**, cartes de
  suggestions d'accueil (onboarding).
- **Badge de fournisseur dynamique** : « Propulsé par Groq » (cyan) pour les
  modèles Llama/GPT-OSS/Qwen, « Propulsé par Gemini API » (violet) pour Gemini —
  fini l'incohérence Groq/Gemini.
- **Barre de saisie toujours visible** : la zone de chat est verrouillée sur la
  hauteur de l'écran, seule la liste de messages défile.
- **Responsive** : sidebar mobile, modale de paramètres en *bottom sheet*,
  croix de fermeture nette sur tous les écrans.

### Modèles d'IA (multi-fournisseurs)
- **Groq** (OpenAI-compatible) : `openai/gpt-oss-120b`, `openai/gpt-oss-20b`,
  `qwen/qwen3.6-27b`.
- **Google Gemini** (API native) : `gemini-flash-latest`, `gemini-flash-lite-latest`,
  avec **vision d'image native** (envoi réel des images au modèle).
- Routage par modèle côté serveur (`MODEL_PROVIDER`), avec repli propre si une
  clé fournisseur manque.

### Comptes & authentification
- Inscription / connexion par e-mail (JWT 30 j, mots de passe bcrypt).
- **Connexion sociale Google & GitHub** via **Firebase Authentication**
  (le front récupère l'ID token, le backend le vérifie avec Firebase Admin).
- **Numéro de téléphone** : champ à l'inscription, modifiable dans les
  paramètres, enregistré côté serveur.
- **Migration automatique** des anciens comptes MongoDB à la première connexion.

### Chat & productivité
- Recherche web (Tavily) injectée dans le contexte quand pertinent.
- **Mémoire** : extraction silencieuse des infos utiles pour personnaliser les
  réponses suivantes.
- Paramètres riches : thème / contraste / couleur d'accent / langue / vitesse
  d'écriture, **Mode Flash** (affichage instantané), style et ton des réponses.

### Notifications push (Web Push / VAPID) — réel
- Système **Web Push** complet : Service Worker (`frontend/sw.js`) + abonnement
  `PushManager` + envoi serveur via **VAPID** (librairie `web-push`).
- **Tout est désactivé par défaut** : l'utilisateur active les catégories
  souhaitées (Chats de groupe, Codex, Projets, Recommandations, Réponses,
  Tâches, Utilisation). L'activation déclenche la demande d'autorisation du
  navigateur puis l'abonnement.
- Bouton **« Tester »** qui affiche une vraie notification (push serveur si
  VAPID est configuré, sinon notification locale de repli).
- **Notifications par e-mail : « À venir »** (placeholder, pas encore branché).
- Dégrade proprement : sans clés VAPID côté serveur, `/push/config` renvoie
  `enabled:false` et l'UI reste fonctionnelle (notifications locales).

### Quota & abonnement
- **Quota gratuit** : `FREE_DAILY_LIMIT` messages / jour par utilisateur
  (défaut 20). Au-delà, `/chat` renvoie `402 QUOTA_EXCEEDED` → coûts fournisseurs
  bornés, personne ne peut faire déraper la facture.
- **Nexus Pro — 18 €/mois** via **Stripe** (Checkout + webhook signé). Modale
  *paywall* au dépassement, panneau Facturation dans les paramètres. Désactivé
  proprement tant que Stripe n'est pas configuré (le quota gratuit reste actif).

### Easter eggs (tickets de transport)
- Taper **`1h`** → génère un ticket **Tcat** (valable 1 h, code aléatoire type `R4LI`).
- Taper **`1h15`** → génère un ticket **Grand Reims Mobilités** (valable 1h15,
  1,80 € TTC, code type `DS7U`). Les deux utilisent le **numéro de téléphone du
  compte connecté** et **copient automatiquement** le ticket dans le presse-papier.
  L'heure de validité est calculée en direct.

---

## Développement local

### Frontend (aucun build)
```bash
cd frontend
python3 -m http.server 5173      # puis http://localhost:5173
```
L'URL de l'API se règle dans [`frontend/js/config.js`](frontend/js/config.js)
(`window.NEXUS_CONFIG.API_BASE`). La config Firebase (connexion sociale) est
dans [`frontend/js/firebase-config.js`](frontend/js/firebase-config.js).

> ⚠️ Les notifications push et les Service Workers exigent **HTTPS** (ou
> `localhost`). En prod, tout passe par `https://…web.app`.

### Backend
```bash
cd backend
cp .env.example .env      # renseigner au minimum GROQ_API_KEY + JWT_SECRET
npm install
npm run dev               # http://localhost:8080
```

> Persistance : **Firestore** quand `USE_FIRESTORE=true`, sinon **en mémoire**
> (défaut dev, données perdues au redémarrage). Logique isolée dans
> [`backend/store.js`](backend/store.js).

---

## Variables d'environnement (backend)

| Variable | Rôle |
| --- | --- |
| `JWT_SECRET` | Signature des tokens de session (obligatoire en prod). |
| `GROQ_API_KEY` | Clé Groq (modèles GPT-OSS / Qwen). |
| `GEMINI_API_KEY` | Clé Google AI Studio (modèles Gemini + vision). |
| `USE_FIRESTORE` | `true` pour persister dans Firestore. |
| `FREE_DAILY_LIMIT` / `PRO_DAILY_LIMIT` | Quotas journaliers (défaut 20 / 500). |
| `APP_URL` | URL publique du site (redirections Stripe). |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` | Abonnement Nexus Pro (optionnel). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Notifications push (optionnel). |
| `LEGACY_API_BASE` | API MongoDB héritée pour la migration des comptes. |

Génère une paire de clés VAPID avec :
```bash
npx web-push generate-vapid-keys
```

---

## API (routes principales)

```
POST /auth/register        POST /auth/login        POST /auth/firebase
GET  /conversations        POST /conversations
PUT  /conversations/:id    DELETE /conversations/:id
POST /chat                 (proxy Groq / Gemini, quota appliqué)
GET  /user/settings        PUT  /user/settings
PUT  /user/phone           PUT  /user/memory       DELETE /user/memory/:index
GET  /billing/status       POST /billing/checkout  POST /billing/webhook
GET  /push/config          POST /push/subscribe    PUT  /push/categories
POST /push/unsubscribe     POST /push/test
```

---

## Déploiement

Voir **[DEPLOY.md](DEPLOY.md)** : Firestore, Cloud Run (Cloud Build), Firebase
Hosting, connexion sociale, abonnement Stripe et notifications push (VAPID).
