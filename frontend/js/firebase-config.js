// ===== NEXUS AI — Firebase Authentication (social login) =====
// Récupère ces valeurs dans la console Firebase :
//   Project settings → General → Your apps → SDK setup and configuration.
// Tant que apiKey commence par "REPLACE", la connexion sociale affiche
// un message d'aide au lieu de tenter le popup.
window.FIREBASE_CONFIG = {
    apiKey: 'REPLACE_WITH_FIREBASE_API_KEY',
    authDomain: 'REPLACE_PROJECT_ID.firebaseapp.com',
    projectId: 'REPLACE_PROJECT_ID',
    appId: 'REPLACE_WITH_FIREBASE_APP_ID',
};
