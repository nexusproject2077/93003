# Déploiement — Nexus AI

Objectif : **frontend sur Firebase Hosting** (`nexus-ai.web.app`) et **backend sur
Cloud Run**, le tout piloté par **Cloud Build**.

## 0. Prérequis (une seule fois)

```bash
# Installer les CLI
npm install -g firebase-tools
# gcloud : https://cloud.google.com/sdk/docs/install

# Se connecter
gcloud auth login
firebase login

# Créer le projet GCP/Firebase (ou en réutiliser un)
gcloud projects create MON_PROJECT_ID --name="Nexus AI"
firebase projects:addfirebase MON_PROJECT_ID
gcloud config set project MON_PROJECT_ID

# Activer les APIs nécessaires
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com firebasehosting.googleapis.com

# Créer le dépôt d'images
gcloud artifacts repositories create nexus --repository-format=docker --location=europe-west1
```

> Remplace `MON_PROJECT_ID` par ton vrai ID, puis mets-le dans **`.firebaserc`**
> à la place de `REPLACE_WITH_YOUR_GCP_PROJECT_ID`.

## 1. Backend → Cloud Run

```bash
# Secrets (jamais dans le code)
echo -n "TA_CLE_GROQ"          | gcloud secrets create GROQ_API_KEY --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create JWT_SECRET  --data-file=-

# Autoriser Cloud Run à lire les secrets
PROJECT_NUMBER=$(gcloud projects describe MON_PROJECT_ID --format='value(projectNumber)')
for S in GROQ_API_KEY JWT_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done

# Build + deploy
gcloud builds submit --config backend/cloudbuild.yaml \
  --substitutions=_REGION=europe-west1,_SERVICE=nexus-ai-api
```

À la fin, Cloud Run affiche une URL type `https://nexus-ai-api-xxxx.a.run.app`.
Copie-la dans **`frontend/js/config.js`** (`API_BASE`).

## 2. Frontend → Firebase Hosting

Crée le site Hosting `nexus-ai` (donne l'URL `nexus-ai.web.app`) :

```bash
firebase hosting:sites:create nexus-ai --project MON_PROJECT_ID
```

Déploiement manuel :

```bash
firebase deploy --only hosting:nexus-ai --project MON_PROJECT_ID
```

Déploiement via Cloud Build (CI) :

```bash
firebase login:ci                                   # génère un token
echo -n "LE_TOKEN" | gcloud secrets create FIREBASE_TOKEN --data-file=-
gcloud builds submit --config cloudbuild.yaml
```

## 3. Connexion sociale (Firebase Authentication)

Le front fait le popup Google/GitHub, récupère l'**ID token** Firebase et le
poste à `POST /auth/firebase` ; le backend le vérifie avec Firebase Admin puis
émet le JWT applicatif habituel (les autres routes ne changent pas).

### a. Activer les fournisseurs

Console Firebase → **Authentication → Sign-in method** → activer **Google** et
**GitHub**.

- **GitHub** : crée une OAuth App sur GitHub
  (Settings → Developer settings → OAuth Apps).
  - *Authorization callback URL* : `https://REPLACE_PROJECT_ID.firebaseapp.com/__/auth/handler`
  - Colle le *Client ID* / *Client secret* dans Firebase.
- **Authorized domains** (Authentication → Settings) : ajoute `nexus-ai.web.app`
  (et `localhost` pour le dev).

### b. Config front

Authentication → *Project settings → General → Your apps* : copie `apiKey`,
`authDomain`, `projectId`, `appId` dans **`frontend/js/firebase-config.js`**.

### c. Backend

Rien à faire sur Cloud Run : Firebase Admin utilise les *Application Default
Credentials* et lit `GOOGLE_CLOUD_PROJECT` automatiquement. En local, exporte
`GOOGLE_APPLICATION_CREDENTIALS` vers une clé de compte de service pour tester la
vérification des tokens.

> Tant que `firebase-config.js` contient les placeholders `REPLACE_…`, les
> boutons sociaux affichent un message d'aide au lieu de lancer le popup.

## 4. Résultat

- Frontend : **https://nexus-ai.web.app**
- Backend  : URL Cloud Run (référencée dans `frontend/js/config.js`)

> ⚠️ Firebase Hosting sert uniquement du statique — d'où le backend séparé sur
> Cloud Run. L'URL est `nexus-ai.web.app` (Firebase n'émet pas de `.web.app.com`).
