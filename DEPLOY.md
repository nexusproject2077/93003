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

## 3. Résultat

- Frontend : **https://nexus-ai.web.app**
- Backend  : URL Cloud Run (référencée dans `frontend/js/config.js`)

> ⚠️ Firebase Hosting sert uniquement du statique — d'où le backend séparé sur
> Cloud Run. L'URL est `nexus-ai.web.app` (Firebase n'émet pas de `.web.app.com`).
