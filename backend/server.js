// ===============================================================
//  NEXUS AI — Backend API (Cloud Run ready)
// ---------------------------------------------------------------
//  Reproduces every route the frontend calls:
//    POST   /auth/register        POST   /auth/login
//    GET    /conversations        POST   /conversations
//    PUT    /conversations/:id     DELETE /conversations/:id
//    POST   /chat                 (Groq proxy)
//    GET    /user/settings        PUT    /user/settings
//    PUT    /user/memory          DELETE /user/memory/:index
//
//  Storage is IN-MEMORY by default so you can boot it instantly.
//  For production, swap the `store` object for Firestore / a DB
//  (see the TODO markers). Nothing else needs to change.
// ===============================================================

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const app = express();
app.use(cors());                       // allow the Firebase-hosted frontend
app.use(express.json({ limit: '12mb' })); // messages can carry file text

const PORT        = process.env.PORT || 8080;
const JWT_SECRET  = process.env.JWT_SECRET || 'change-me-in-production';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// Models the frontend dropdown is allowed to select (allow-list = safety).
const ALLOWED_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
]);

// ---------------------------------------------------------------
//  IN-MEMORY STORE  (TODO: replace with Firestore for production)
// ---------------------------------------------------------------
const store = {
  users: new Map(),          // email -> { id, username, email, passwordHash, settings, memory, sidebarState }
  conversations: new Map(),  // convId -> { _id, userId, title, messages, history, createdAt }
};

// ---------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email };
}

// ---------------------------------------------------------------
//  FIREBASE ADMIN (lazy) — verifies social sign-in ID tokens.
//  On Cloud Run in the same GCP project, Application Default
//  Credentials work with no extra config. Locally, set
//  GOOGLE_APPLICATION_CREDENTIALS to a service-account key file.
// ---------------------------------------------------------------
let admin = null;
let firebaseReady = false;
async function ensureFirebase() {
  if (firebaseReady) return true;
  try {
    if (!admin) admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      admin.initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || undefined,
      });
    }
    firebaseReady = true;
  } catch (e) {
    console.error('Firebase Admin unavailable:', e.message);
  }
  return firebaseReady;
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = [...store.users.values()].find(u => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'Session invalide.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expirée.' });
  }
}

// ---------------------------------------------------------------
//  HEALTH
// ---------------------------------------------------------------
app.get('/', (_req, res) => res.json({ service: 'nexus-ai-backend', ok: true }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------
//  AUTH
// ---------------------------------------------------------------
app.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Champs manquants.' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court.' });
  if (store.users.has(email)) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });

  const user = {
    id: randomUUID(),
    username,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    settings: {},
    memory: [],
    sidebarState: 'visible',
  };
  store.users.set(email, user);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Champs manquants.' });
  const user = store.users.get(email);
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// Social sign-in (Firebase Authentication): the frontend performs the
// Google/GitHub popup, then posts the Firebase ID token here. We verify
// it with Firebase Admin and issue our own app JWT so every other route
// keeps working unchanged.
app.post('/auth/firebase', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken manquant.' });
  if (!(await ensureFirebase())) {
    return res.status(501).json({ error: 'Connexion sociale non configurée sur le serveur (Firebase Admin indisponible).' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email || `${decoded.uid}@firebase.local`;
    let user = store.users.get(email);
    if (!user) {
      user = {
        id: decoded.uid,
        username: decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'user'),
        email,
        passwordHash: null,
        provider: (decoded.firebase && decoded.firebase.sign_in_provider) || 'firebase',
        settings: {},
        memory: [],
        sidebarState: 'visible',
      };
      store.users.set(email, user);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    console.error('verifyIdToken failed:', e.message);
    res.status(401).json({ error: 'Jeton Firebase invalide.' });
  }
});

// ---------------------------------------------------------------
//  CONVERSATIONS
// ---------------------------------------------------------------
app.get('/conversations', auth, (req, res) => {
  const list = [...store.conversations.values()]
    .filter(c => c.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

app.post('/conversations', auth, (req, res) => {
  const conv = {
    _id: randomUUID(),
    userId: req.user.id,
    title: 'Nouvelle conversation',
    messages: [],
    history: [],
    createdAt: new Date().toISOString(),
  };
  store.conversations.set(conv._id, conv);
  res.json(conv);
});

app.put('/conversations/:id', auth, (req, res) => {
  const conv = store.conversations.get(req.params.id);
  if (!conv || conv.userId !== req.user.id) return res.status(404).json({ error: 'Introuvable.' });
  const { title, messages, history } = req.body || {};
  if (title !== undefined) conv.title = title;
  if (messages !== undefined) conv.messages = messages;
  if (history !== undefined) conv.history = history;
  res.json(conv);
});

app.delete('/conversations/:id', auth, (req, res) => {
  const conv = store.conversations.get(req.params.id);
  if (!conv || conv.userId !== req.user.id) return res.status(404).json({ error: 'Introuvable.' });
  store.conversations.delete(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------
//  CHAT — Groq proxy
// ---------------------------------------------------------------
app.post('/chat', auth, async (req, res) => {
  if (!GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY non configurée sur le serveur.' });
  const { messages, model } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages requis.' });

  const chosenModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model: chosenModel, messages, temperature: 0.7 }),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Groq error:', err);
    res.status(502).json({ error: 'Erreur de communication avec Groq.' });
  }
});

// ---------------------------------------------------------------
//  USER SETTINGS + MEMORY
// ---------------------------------------------------------------
app.get('/user/settings', auth, (req, res) => {
  res.json({
    settings: req.user.settings || {},
    memory: req.user.memory || [],
    sidebarState: req.user.sidebarState || 'visible',
  });
});

app.put('/user/settings', auth, (req, res) => {
  const { settings, sidebarState } = req.body || {};
  if (settings !== undefined) req.user.settings = settings;
  if (sidebarState !== undefined) req.user.sidebarState = sidebarState;
  res.json({ ok: true });
});

app.put('/user/memory', auth, (req, res) => {
  const { memory } = req.body || {};
  if (Array.isArray(memory)) req.user.memory = memory;
  res.json({ ok: true, memory: req.user.memory });
});

app.delete('/user/memory/:index', auth, (req, res) => {
  const i = parseInt(req.params.index, 10);
  if (Number.isInteger(i) && i >= 0 && i < (req.user.memory || []).length) {
    req.user.memory.splice(i, 1);
  }
  res.json({ ok: true, memory: req.user.memory });
});

// ---------------------------------------------------------------
app.listen(PORT, () => console.log(`Nexus AI backend listening on :${PORT}`));
