// ===== NEXUS AI — Frontend runtime config =====
// Point this at your backend. Today it targets the existing live API.
// When your Cloud Run backend is deployed, just swap this URL for the
// Cloud Run URL (e.g. https://nexus-ai-api-xxxx.a.run.app) — nothing else changes.
window.NEXUS_CONFIG = {
    API_BASE: 'https://nexus-ai-api-gc555qtsga-ew.a.run.app',
    // Groq models exposed in the in-chat model selector.
    MODELS: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 · 70B', hint: 'Groq · le plus puissant' },
        { id: 'llama-3.1-8b-instant',   label: 'Llama 3.1 · 8B',  hint: 'Groq · ultra rapide' },
        { id: 'mixtral-8x7b-32768',     label: 'Mixtral · 8x7B',  hint: 'Groq · grand contexte' },
        { id: 'gemma2-9b-it',           label: 'Gemma 2 · 9B',    hint: 'Groq · léger' },
        { id: 'gemini-flash-latest',      label: 'Gemini Flash', hint: 'Google · gros documents' },
        { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite', hint: 'Google · rapide' },
    ],
    DEFAULT_MODEL: 'llama-3.3-70b-versatile',
};
