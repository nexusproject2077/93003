// ===== NEXUS AI — Frontend runtime config =====
// Point this at your backend. Today it targets the existing live API.
// When your Cloud Run backend is deployed, just swap this URL for the
// Cloud Run URL (e.g. https://nexus-ai-api-xxxx.a.run.app) — nothing else changes.
window.NEXUS_CONFIG = {
    API_BASE: 'https://nexus-ai-api-gc555qtsga-ew.a.run.app',
    // Models exposed in the in-chat model selector.
    MODELS: [
        { id: 'openai/gpt-oss-120b',      label: 'GPT-OSS · 120B', hint: 'Groq · le plus puissant' },
        { id: 'openai/gpt-oss-20b',       label: 'GPT-OSS · 20B',  hint: 'Groq · ultra rapide' },
        { id: 'qwen/qwen3.6-27b',         label: 'Qwen 3.6 · 27B', hint: 'Groq · polyvalent' },
        { id: 'gemini-flash-latest',      label: 'Gemini Flash', hint: 'Google · vision + gros docs' },
        { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite', hint: 'Google · rapide' },
    ],
    DEFAULT_MODEL: 'openai/gpt-oss-120b',
};
