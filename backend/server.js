// ===============================================================
//  NEXUS AI — Backend API (Cloud Run ready)
// ---------------------------------------------------------------
//  Reproduces every route the frontend calls:
//    POST   /auth/register        POST   /auth/login
//    POST   /auth/firebase        (social sign-in)
//    GET    /conversations        POST   /conversations
//    PUT    /conversations/:id     DELETE /conversations/:id
//    POST   /chat                 (Groq proxy)
//    GET    /user/settings        PUT    /user/settings
//    PUT    /user/phone
//    PUT    /user/memory          DELETE /user/memory/:index
//
//  Persistence lives in store.js: Cloud Firestore when
//  USE_FIRESTORE=true, in-memory otherwise (dev default).
// ===============================================================

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getStore, randomUUID } from './store.js';

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

// Persistence backend (Firestore or in-memory) — see store.js.
const store = await getStore();

// ---------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, phone: user.phone || '' };
}

// Light phone normalisation/validation: keep +, digits and spaces; 6-20 digits.
function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[^\d+\s().-]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 20) return null;
  return cleaned;
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

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await store.usersGetById(payload.id);
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
app.get('/', (_req, res) => res.json({ service: 'nexus-ai-backend', ok: true, storage: store.kind }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------
//  AUTH
// ---------------------------------------------------------------
app.post('/auth/register', async (req, res) => {
  const { username, email, password, phone } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'Champs manquants.' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court.' });
  if (await store.usersGetByEmail(email)) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });

  // Phone is optional at register but validated when provided.
  let phoneValue = '';
  if (phone) {
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    phoneValue = p;
  }

  const user = {
    id: randomUUID(),
    username,
    email,
    phone: phoneValue,
    passwordHash: await bcrypt.hash(password, 10),
    provider: 'password',
    settings: {},
    memory: [],
    sidebarState: 'visible',
    createdAt: new Date().toISOString(),
  };
  await store.usersCreate(user);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Champs manquants.' });
  const user = await store.usersGetByEmail(email);
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
    let user = await store.usersGetByEmail(email);
    if (!user) {
      user = {
        id: decoded.uid,
        username: decoded.name || (decoded.email ? decoded.email.split('@')[0] : 'user'),
        email,
        phone: '',
        passwordHash: null,
        provider: (decoded.firebase && decoded.firebase.sign_in_provider) || 'firebase',
        settings: {},
        memory: [],
        sidebarState: 'visible',
        createdAt: new Date().toISOString(),
      };
      await store.usersCreate(user);
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
app.get('/conversations', auth, async (req, res) => {
  res.json(await store.convsListByUser(req.user.id));
});

app.post('/conversations', auth, async (req, res) => {
  const conv = {
    _id: randomUUID(),
    userId: req.user.id,
    title: 'Nouvelle conversation',
    messages: [],
    history: [],
    createdAt: new Date().toISOString(),
  };
  await store.convsCreate(conv);
  res.json(conv);
});

app.put('/conversations/:id', auth, async (req, res) => {
  const conv = await store.convsGet(req.params.id);
  if (!conv || conv.userId !== req.user.id) return res.status(404).json({ error: 'Introuvable.' });
  const { title, messages, history } = req.body || {};
  const fields = {};
  if (title !== undefined) fields.title = title;
  if (messages !== undefined) fields.messages = messages;
  if (history !== undefined) fields.history = history;
  const updated = await store.convsUpdate(req.params.id, fields);
  res.json(updated);
});

app.delete('/conversations/:id', auth, async (req, res) => {
  const conv = await store.convsGet(req.params.id);
  if (!conv || conv.userId !== req.user.id) return res.status(404).json({ error: 'Introuvable.' });
  await store.convsDelete(req.params.id);
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
//  USER SETTINGS + PHONE + MEMORY
// ---------------------------------------------------------------
app.get('/user/settings', auth, (req, res) => {
  res.json({
    settings: req.user.settings || {},
    memory: req.user.memory || [],
    sidebarState: req.user.sidebarState || 'visible',
  });
});

app.put('/user/settings', auth, async (req, res) => {
  const { settings, sidebarState } = req.body || {};
  if (settings !== undefined) req.user.settings = settings;
  if (sidebarState !== undefined) req.user.sidebarState = sidebarState;
  await store.usersSave(req.user);
  res.json({ ok: true });
});

// Update the user's phone number (from the login prompt or Settings).
app.put('/user/phone', auth, async (req, res) => {
  const { phone } = req.body || {};
  if (phone === '' || phone === null) {
    req.user.phone = '';
  } else {
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    req.user.phone = p;
  }
  await store.usersSave(req.user);
  res.json({ ok: true, user: publicUser(req.user) });
});

app.put('/user/memory', auth, async (req, res) => {
  const { memory } = req.body || {};
  if (Array.isArray(memory)) req.user.memory = memory;
  await store.usersSave(req.user);
  res.json({ ok: true, memory: req.user.memory });
});

app.delete('/user/memory/:index', auth, async (req, res) => {
  const i = parseInt(req.params.index, 10);
  if (Number.isInteger(i) && i >= 0 && i < (req.user.memory || []).length) {
    req.user.memory.splice(i, 1);
    await store.usersSave(req.user);
  }
  res.json({ ok: true, memory: req.user.memory });
});

// ---------------------------------------------------------------
app.listen(PORT, () => console.log(`Nexus AI backend listening on :${PORT}`));
