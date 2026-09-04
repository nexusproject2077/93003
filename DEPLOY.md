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

## 1. Base de données → Firestore

Le backend persiste les comptes, conversations, paramètres, mémoire et numéros
de téléphone dans **Cloud Firestore** (mode Native) quand `USE_FIRESTORE=true`
(déjà réglé dans `backend/cloudbuild.yaml`).

```bash
# Créer la base Firestore (mode Native) dans la même région que Cloud Run
gcloud firestore databases create --location=europe-west1

# Le compte de service Cloud Run doit pouvoir lire/écrire Firestore
PROJECT_NUMBER=$(gcloud projects describe MON_PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding MON_PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

> L'accès à Firestore passe uniquement par le backend (Admin SDK, qui contourne
> les règles de sécurité) : aucune règle Firestore côté client n'est nécessaire.
> En local, mets `USE_FIRESTORE=false` (défaut) pour rester en mémoire, ou pointe
> `GOOGLE_APPLICATION_CREDENTIALS` vers une clé de compte de service pour tester.

## 2. Backend → Cloud Run

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

# Build + deploy (guillemets autour des substitutions — requis sur PowerShell)
gcloud builds submit --config backend/cloudbuild.yaml \
  --substitutions="_REGION=europe-west1,_SERVICE=nexus-ai-api"
```

À la fin, Cloud Run affiche une URL type `https://nexus-ai-api-xxxx.a.run.app`.
Copie-la dans **`frontend/js/config.js`** (`API_BASE`).

## 3. Frontend → Firebase Hosting

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

## 4. Connexion sociale (Firebase Authentication)

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

## 5. Abonnement Nexus Pro (Stripe) — optionnel

Le **quota gratuit** (20 messages/jour, réglable via `FREE_DAILY_LIMIT`) est
appliqué **sans Stripe** : personne ne peut dépasser, tes coûts sont bornés.
Pour permettre aux utilisateurs de passer en illimité à **18€/mois**, branche
Stripe :

### a. Créer le produit + prix (dashboard Stripe)
Stripe → **Produits** → créer « Nexus Pro » → prix **récurrent 18€/mois** →
copie l'ID du prix (`price_...`).

### b. Récupérer les clés
- **Clé secrète** : Stripe → Développeurs → Clés API → `sk_live_...` (ou `sk_test_...`).
- **Webhook** : Stripe → Développeurs → Webhooks → *Add endpoint* :
  - URL : `https://<URL_CLOUD_RUN>/billing/webhook`
  - Événements : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
  - copie le **signing secret** (`whsec_...`).

### c. Créer les secrets + les brancher sur Cloud Run
```bash
echo -n "sk_live_..."  | gcloud secrets create STRIPE_SECRET_KEY     --data-file=-
echo -n "price_..."    | gcloud secrets create STRIPE_PRICE_ID       --data-file=-
echo -n "whsec_..."    | gcloud secrets create STRIPE_WEBHOOK_SECRET --data-file=-

PROJECT_NUMBER=$(gcloud projects describe MON_PROJECT_ID --format='value(projectNumber)')
for S in STRIPE_SECRET_KEY STRIPE_PRICE_ID STRIPE_WEBHOOK_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```
Puis **décommente** la ligne Stripe dans `backend/cloudbuild.yaml`
(`--set-secrets=…,STRIPE_SECRET_KEY=…`) et redéploie le backend.

> Tant que ces secrets sont absents, la facturation est désactivée
> proprement : le quota gratuit reste appliqué et le bouton « S'abonner »
> affiche « indisponible ».

## 6. Notifications push (Web Push / VAPID) — optionnel

Le front embarque un Service Worker (`frontend/sw.js`) et s'abonne au push via
`PushManager`. Le serveur envoie les notifications avec la librairie `web-push`
et une paire de clés **VAPID**. Tout est **désactivé par défaut** côté
utilisateur ; sans clés VAPID, le push serveur est simplement inactif (les
notifications locales de test fonctionnent quand même).

### a. Générer les clés VAPID
```bash
npx web-push generate-vapid-keys
# → Public Key: B... / Private Key: ...
```

### b. Créer les secrets + les brancher sur Cloud Run
```bash
echo -n "CLE_PUBLIQUE"  | gcloud secrets create VAPID_PUBLIC_KEY  --data-file=-
echo -n "CLE_PRIVEE"    | gcloud secrets create VAPID_PRIVATE_KEY --data-file=-

PROJECT_NUMBER=$(gcloud projects describe MON_PROJECT_ID --format='value(projectNumber)')
for S in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do
  gcloud secrets add-iam-policy-binding $S \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```
Puis **ajoute** les clés dans le `--set-secrets` de `backend/cloudbuild.yaml`
(`,VAPID_PUBLIC_KEY=VAPID_PUBLIC_KEY:latest,VAPID_PRIVATE_KEY=VAPID_PRIVATE_KEY:latest`)
et, si tu veux, `VAPID_SUBJECT` en `--set-env-vars`. Redéploie le backend.

> Le Service Worker et le push exigent **HTTPS** : ça marche sur
> `https://…web.app`, pas en `http://` (sauf `localhost`).

## 7. Résultat

- Frontend : **https://nexus-ai.web.app**
- Backend  : URL Cloud Run (référencée dans `frontend/js/config.js`)

> ⚠️ Firebase Hosting sert uniquement du statique — d'où le backend séparé sur
> Cloud Run. L'URL est `nexus-ai.web.app` (Firebase n'émet pas de `.web.app.com`).
