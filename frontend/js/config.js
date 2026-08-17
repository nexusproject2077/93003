// ===== NEXUS AI — Frontend runtime config =====
// Point this at your backend. Today it targets the existing live API.
// When your Cloud Run backend is deployed, just swap this URL for the
// Cloud Run URL (e.g. https://nexus-ai-api-xxxx.a.run.app) — nothing else changes.
window.NEXUS_CONFIG = {
    API_BASE: 'https://api.mmi25b11.mmi-troyes.fr',
    // Groq models exposed in the in-chat model selector.
    MODELS: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 · 70B', hint: 'Le plus puissant' },
        { id: 'llama-3.1-8b-instant',   label: 'Llama 3.1 · 8B',  hint: 'Ultra rapide' },
        { id: 'mixtral-8x7b-32768',     label: 'Mixtral · 8x7B',  hint: 'Grand contexte' },
        { id: 'gemma2-9b-it',           label: 'Gemma 2 · 9B',    hint: 'Léger' },
    ],
    DEFAULT_MODEL: 'llama-3.3-70b-versatile',
};
