// ===== CONFIGURATION =====
const API_BASE = 'https://api.mmi25b11.mmi-troyes.fr';
const TYPING_SPEED = 15;

// ===== AUTH =====
function getToken() { return localStorage.getItem('nexus_token'); }
function getUser()  { return JSON.parse(localStorage.getItem('nexus_user') || 'null'); }

function setAuth(token, user) {
    localStorage.setItem('nexus_token', token);
    localStorage.setItem('nexus_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
}

function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

// ===== SWITCH TAB AUTH =====
window.switchTab = function(tab) {
    document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
};

// ===== LOGIN =====
window.handleLogin = async function() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');

    if (!email || !password) { errorEl.textContent = 'Remplis tous les champs.'; return; }

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Connexion…';
    errorEl.textContent = '';

    try {
        const res  = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) { errorEl.textContent = data.error || 'Erreur de connexion.'; return; }

        setAuth(data.token, data.user);
        initChatPage();
    } catch {
        errorEl.textContent = 'Impossible de contacter le serveur.';
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Se connecter';
    }
};

// ===== REGISTER =====
window.handleRegister = async function() {
    const username = document.getElementById('register-username').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const errorEl  = document.getElementById('register-error');
    const btn      = document.getElementById('register-btn');

    if (!username || !email || !password) { errorEl.textContent = 'Remplis tous les champs.'; return; }
    if (password.length < 6) { errorEl.textContent = 'Mot de passe trop court (6 caractères min).'; return; }

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Création…';
    errorEl.textContent = '';

    try {
        const res  = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();

        if (!res.ok) { errorEl.textContent = data.error || "Erreur lors de l'inscription."; return; }

        setAuth(data.token, data.user);
        initChatPage();
    } catch {
        errorEl.textContent = 'Impossible de contacter le serveur.';
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Créer un compte';
    }
};

// ===== LOGOUT =====
window.handleLogout = function() {
    clearAuth();
    conversations = [];
    currentConversationId = null;
    document.getElementById('chat-page').classList.add('hidden');
    document.getElementById('auth-page').classList.remove('hidden');
};

// ===== INIT =====
function initChatPage() {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('chat-page').classList.remove('hidden');

    const user = getUser();
    if (user) document.getElementById('sidebar-username').textContent = `@${user.username}`;

    if (window.innerWidth <= 768) sidebar.classList.add('hidden');

    loadConversationsFromServer();
    updateClock();
    setInterval(updateClock, 1000);
}

// ===== ELEMENTS DOM =====
const chatBox           = document.getElementById('chat-box');
const userInput         = document.getElementById('user-input');
const sendButton        = document.getElementById('send-button');
const clock             = document.getElementById('clock');
const conversationsList = document.getElementById('conversations-list');
const newChatBtn        = document.getElementById('new-chat-btn');
const sidebar           = document.getElementById('sidebar');
const fileInput         = document.getElementById('file-input');
const attachFileBtn     = document.getElementById('attach-file-btn');
const uploadedFilesDiv  = document.getElementById('uploaded-files');

// ===== ETAT =====
let conversations = [];
let currentConversationId = null;
let attachedFiles = [];
let isTyping = false;

// ===== SIDEBAR =====
const toggleSidebarInside  = document.getElementById('toggle-sidebar-inside');
const toggleSidebarOutside = document.getElementById('toggle-sidebar-outside');

if (toggleSidebarInside) {
    toggleSidebarInside.addEventListener('click', () => sidebar.classList.add('hidden'));
}
if (toggleSidebarOutside) {
    toggleSidebarOutside.addEventListener('click', () => sidebar.classList.remove('hidden'));
}
if (window.innerWidth <= 768 && conversationsList) {
    conversationsList.addEventListener('click', () => sidebar.classList.add('hidden'));
}

// ===== HORLOGE =====
function updateClock() {
    if (!clock) return;
    const now = new Date();
    clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(n => String(n).padStart(2, '0')).join(':');
}

// ===== FICHIERS =====
if (attachFileBtn) attachFileBtn.addEventListener('click', () => fileInput.click());

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                attachedFiles.push({ name: file.name, type: file.type, size: file.size, content: event.target.result });
                renderUploadedFiles();
            };
            if (file.type.startsWith('text/') || file.name.endsWith('.txt')) reader.readAsText(file);
            else reader.readAsDataURL(file);
        });
        fileInput.value = '';
    });
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return { txt:'📄', pdf:'📕', doc:'📘', docx:'📘', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', xlsx:'📊', xls:'📊', csv:'📊' }[ext] || '📎';
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderUploadedFiles() {
    if (!uploadedFilesDiv) return;
    uploadedFilesDiv.innerHTML = '';
    attachedFiles.forEach((file, index) => {
        const fileEl = document.createElement('div');
        fileEl.className = 'uploaded-file';
        fileEl.innerHTML = `
            <span class="file-icon">${getFileIcon(file.name)}</span>
            <span class="file-name" title="${file.name}">${file.name}</span>
            <span style="color:#999;font-size:0.85em;margin-left:8px">${formatFileSize(file.size)}</span>
            <span class="remove-file" onclick="removeFile(${index})">x</span>
        `;
        uploadedFilesDiv.appendChild(fileEl);
    });
}

window.removeFile = function(index) {
    attachedFiles.splice(index, 1);
    renderUploadedFiles();
};

// ===== API CONVERSATIONS =====
async function loadConversationsFromServer() {
    try {
        const res = await fetch(`${API_BASE}/conversations`, { headers: authHeaders() });
        if (res.status === 401) { handleLogout(); return; }
        conversations = await res.json();
        if (conversations.length === 0) {
            await createNewConversation();
        } else {
            loadConversation(conversations[0]._id);
        }
        renderConversationsList();
    } catch {
        conversations = [];
        await createNewConversation();
    }
}

async function createNewConversation() {
    try {
        const res  = await fetch(`${API_BASE}/conversations`, { method: 'POST', headers: authHeaders() });
        const conv = await res.json();
        conversations.unshift(conv);
        loadConversation(conv._id);
        renderConversationsList();
    } catch (err) {
        console.error('Erreur creation conversation:', err);
    }
}

async function saveConversationToServer(conv) {
    try {
        await fetch(`${API_BASE}/conversations/${conv._id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ title: conv.title, messages: conv.messages, history: conv.history })
        });
    } catch (err) {
        console.error('Erreur sauvegarde:', err);
    }
}

window.deleteConversation = async function(id, event) {
    event.stopPropagation();
    if (!confirm('Supprimer cette conversation ?')) return;
    try {
        await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE', headers: authHeaders() });
        conversations = conversations.filter(c => c._id !== id);
        if (currentConversationId === id) {
            if (conversations.length === 0) await createNewConversation();
            else loadConversation(conversations[0]._id);
        }
        renderConversationsList();
    } catch (err) {
        console.error('Erreur suppression:', err);
    }
};

function loadConversation(id) {
    currentConversationId = id;
    const conv = conversations.find(c => c._id === id);
    if (!conv) return;

    chatBox.innerHTML = '';
    conv.messages.forEach(msg => {
        if (msg.type === 'user') addMessage('user-message', msg.content, false, false);
        else addMessage('bot-message', msg.content, true, false);
    });

    renderConversationsList();
    setTimeout(() => { chatBox.scrollTop = chatBox.scrollHeight; }, 100);
}

function getCurrentConversation() {
    return conversations.find(c => c._id === currentConversationId);
}

function updateConversationTitle(message) {
    const conv = getCurrentConversation();
    if (conv && conv.messages.length === 1) {
        conv.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        renderConversationsList();
        saveConversationToServer(conv);
    }
}

function renderConversationsList() {
    if (!conversationsList) return;
    conversationsList.innerHTML = '';
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv._id === currentConversationId ? ' active' : '');
        const date    = new Date(conv.createdAt);
        const dateStr = date.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
        const timeStr = date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        item.innerHTML = `
            <div class="conversation-title">${conv.title}</div>
            <div class="conversation-date">${dateStr} ${timeStr}</div>
            <button class="delete-conv-btn" onclick="deleteConversation('${conv._id}', event)">x</button>
        `;
        item.addEventListener('click', () => loadConversation(conv._id));
        conversationsList.appendChild(item);
    });
}

if (newChatBtn) newChatBtn.addEventListener('click', createNewConversation);

// ===== MARKDOWN =====
function markdownToHTML(text) {
    text = text.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    text = text.replace(/\n\n/g, '</p><p>');
    return text;
}

// ===== TYPEWRITER =====
async function typeWriter(element, text, isHTML) {
    element.classList.add('typing');
    isTyping = true;
    if (isHTML) {
        const html = markdownToHTML(text);
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const plain = temp.textContent;
        for (let i = 0; i <= plain.length; i++) {
            element.innerHTML = markdownToHTML(plain.substring(0, i));
            chatBox.scrollTop = chatBox.scrollHeight;
            await new Promise(r => setTimeout(r, window._typingSpeed ?? TYPING_SPEED));
        }
        element.innerHTML = html;
    } else {
        for (let i = 0; i <= text.length; i++) {
            element.textContent = text.substring(0, i);
            chatBox.scrollTop = chatBox.scrollHeight;
            await new Promise(r => setTimeout(r, window._typingSpeed ?? TYPING_SPEED));
        }
    }
    element.classList.remove('typing');
    isTyping = false;
}

// ===== MESSAGES =====
async function addMessage(className, message, isHTML = false, animate = true) {
    const msg = document.createElement('div');
    msg.className = className;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;

    if (className === 'bot-message' && animate) {
        await typeWriter(msg, message, isHTML);
    } else {
        if (isHTML) msg.innerHTML = markdownToHTML(message);
        else msg.textContent = message;
    }

    const conv = getCurrentConversation();
    if (conv && !conv.messages.find(m => m.content === message)) {
        conv.messages.push({ type: className.includes('user') ? 'user' : 'bot', content: message });
        saveConversationToServer(conv);
    }

    return msg;
}

function showTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'typing-indicator';
    el.id = 'typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    chatBox.appendChild(el);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTypingIndicator() {
    const el = document.getElementById('typing');
    if (el) el.remove();
}

// ===== TICKET =====
function formatDate(d) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`; }
function formatTime(d) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function generateRandomSequence() { return Array.from({length:6}, () => String(Math.floor(Math.random()*100)).padStart(2,'0')).join("'"); }
function generateRandomLetter() { return String.fromCharCode(65 + Math.floor(Math.random()*26)); }
function generateRandomCode() {
    const l1 = generateRandomLetter();
    let l2, l3;
    do { l2 = generateRandomLetter(); } while (l2 === l1);
    do { l3 = generateRandomLetter(); } while (l3 === l1 || l3 === l2);
    return `${l1}${Math.floor(Math.random()*10)}${l2}${l3}`;
}

// ===== SYSTEM PROMPT BUILDER =====
function buildSystemPrompt() {
    const s = loadSettings();
    let prompt = 'Tu es Nexus AI, un assistant IA intelligent, sympa et utile cree par l\'entreprise Nexus. Tu reponds en francais.';

    if (s.alias) prompt += ` L'utilisateur s'appelle ${s.alias}.`;
    if (s.profession) prompt += ` Sa profession est : ${s.profession}.`;
    if (s.about) prompt += ` Informations sur l'utilisateur : ${s.about}.`;

    const styleMap = { formal: 'Adopte un style formel et professionnel.', casual: 'Adopte un style decontracte et familier.', concise: 'Sois tres concis et va droit au but.', detailed: 'Donne des reponses detaillees et completes.' };
    if (styleMap[s.style]) prompt += ' ' + styleMap[s.style];
    if (s.warm === 'more') prompt += ' Sois tres chaleureux et bienveillant.';
    if (s.warm === 'less') prompt += ' Reste neutre et factuel.';
    if (s.enthusiastic === 'more') prompt += ' Montre de l\'enthousiasme dans tes reponses.';
    if (s.enthusiastic === 'less') prompt += ' Garde un ton calme et posé.';
    if (s.lists === 'more') prompt += ' Utilise souvent des titres et des listes.';
    if (s.lists === 'less') prompt += ' Evite les listes et les titres, prefere la prose.';
    if (s.emojis === 'more') prompt += ' Utilise des emojis pour illustrer tes reponses.';
    if (s.emojis === 'less') prompt += ' N\'utilise pas d\'emojis.';
    if (s.contentFilter || s.safeMode) prompt += ' Filtre tout contenu inapproprie. Reste dans des sujets educatifs et constructifs.';
    if (s.instructions) prompt += '\n\nInstructions personnalisees : ' + s.instructions;

    prompt += '\n\nIMPORTANT: Tu PEUX et tu DOIS analyser, lire et traiter TOUS les types de fichiers que l\'utilisateur te partage. Tu peux utiliser le formatage Markdown dans tes reponses.';
    return prompt;
}

// ===== API GROQ =====
async function getGroqAIResponse(message) {
    try {
        const conv = getCurrentConversation();
        let fullMessage = message;

        if (attachedFiles.length > 0) {
            fullMessage += '\n\n[Fichiers joints:]\n';
            attachedFiles.forEach(file => {
                fullMessage += `\nFichier: ${file.name} (${formatFileSize(file.size)})\n`;
                if (file.type.startsWith('text/') || file.name.endsWith('.txt')) fullMessage += `Contenu:\n${file.content}\n`;
                else fullMessage += `Type: ${file.type}\n`;
            });
        }

        if (!conv.history) conv.history = [];
        conv.history.push({ role: 'user', content: fullMessage });

        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: buildSystemPrompt()
                    },
                    ...conv.history
                ]
            })
        });

        if (!response.ok) {
            if (response.status === 401) { handleLogout(); return ''; }
            return 'Erreur de connexion a Nexus AI. Reessaie dans quelques secondes.';
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        conv.history.push({ role: 'assistant', content: aiResponse });
        if (conv.history.length > 20) conv.history = conv.history.slice(-20);

        saveConversationToServer(conv);
        attachedFiles = [];
        renderUploadedFiles();

        return aiResponse;
    } catch (error) {
        console.error('Erreur:', error);
        return 'Erreur de connexion. Verifie ta connexion internet.';
    }
}

// ===== GESTION MESSAGES =====
async function handleMessage() {
    const message = userInput.value.trim();
    if (!message && attachedFiles.length === 0) return;
    if (isTyping) return;

    sendButton.disabled = true;
    userInput.disabled  = true;

    const displayMessage = message || '[Fichier(s) envoye(s)]';
    await addMessage('user-message', displayMessage, false, false);
    updateConversationTitle(displayMessage);
    userInput.value = '';

    if (message === '1h' && attachedFiles.length === 0) {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        const ticket = `Titre 1 voyage\n\nValable 1 heure des reception du SMS\nLe ${formatDate(now)}\nDe ${formatTime(now)} a ${formatTime(oneHourLater)}\n\n1.35 E\n\n${generateRandomSequence()}\n\n0783643942${generateRandomCode()}\n\nCGV : www.tcat.fr/cgv-ticket-sms`;
        setTimeout(async () => {
            await addMessage('bot-message', ticket, false, true);
            sendButton.disabled = false;
            userInput.disabled  = false;
            userInput.focus();
        }, 500);
        navigator.clipboard.writeText(ticket).catch(console.error);
    } else {
        showTypingIndicator();
        const aiResponse = await getGroqAIResponse(message || 'Analyse ces fichiers');
        hideTypingIndicator();
        if (aiResponse) await addMessage('bot-message', aiResponse, true, true);
        sendButton.disabled = false;
        userInput.disabled  = false;
        userInput.focus();
    }
}

if (sendButton) sendButton.addEventListener('click', handleMessage);
if (userInput) userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendButton.disabled && !isTyping) handleMessage();
});

const loginPwd = document.getElementById('login-password');
const registerPwd = document.getElementById('register-password');
if (loginPwd) loginPwd.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
if (registerPwd) registerPwd.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });

// ===== VERIFIER TOKEN AU CHARGEMENT (toujours en dernier) =====
if (getToken()) {
    initChatPage();
}

// ===== SETTINGS =====
const SETTINGS_KEY = 'nexus_settings';

const defaultSettings = {
    theme: 'system',
    contrast: 'system',
    accent: '#00d2ff',
    langue: 'auto',
    typingSpeed: 15,
    vocalMode: false,
    notifGroup: 'push',
    notifCodex: 'push',
    notifProjects: 'email',
    notifReco: 'both',
    notifReplies: 'push',
    notifTasks: 'both',
    notifUsage: 'both',
    style: 'default',
    warm: 'default',
    enthusiastic: 'default',
    lists: 'default',
    emojis: 'default',
    quickReplies: true,
    instructions: '',
    alias: '',
    profession: '',
    about: '',
    memory: false,
    modelImprove: true,
    twoFA: false,
    contentFilter: false,
    safeMode: false,
    enterSend: true,
};

function loadSettings() {
    try {
        return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
        return { ...defaultSettings };
    }
}

function saveSettings() {
    const s = readSettingsFromDOM();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function readSettingsFromDOM() {
    const g = id => document.getElementById(id);
    return {
        theme:         g('s-theme')?.value || defaultSettings.theme,
        contrast:      g('s-contrast')?.value || defaultSettings.contrast,
        accent:        g('s-accent')?.value || defaultSettings.accent,
        langue:        g('s-langue')?.value || defaultSettings.langue,
        typingSpeed:   parseInt(g('s-typing-speed')?.value ?? defaultSettings.typingSpeed),
        vocalMode:     g('s-vocal-mode')?.checked ?? defaultSettings.vocalMode,
        notifGroup:    g('s-notif-group')?.value || defaultSettings.notifGroup,
        notifCodex:    g('s-notif-codex')?.value || defaultSettings.notifCodex,
        notifProjects: g('s-notif-projects')?.value || defaultSettings.notifProjects,
        notifReco:     g('s-notif-reco')?.value || defaultSettings.notifReco,
        notifReplies:  g('s-notif-replies')?.value || defaultSettings.notifReplies,
        notifTasks:    g('s-notif-tasks')?.value || defaultSettings.notifTasks,
        notifUsage:    g('s-notif-usage')?.value || defaultSettings.notifUsage,
        style:         g('s-style')?.value || defaultSettings.style,
        warm:          g('s-warm')?.value || defaultSettings.warm,
        enthusiastic:  g('s-enthusiastic')?.value || defaultSettings.enthusiastic,
        lists:         g('s-lists')?.value || defaultSettings.lists,
        emojis:        g('s-emojis')?.value || defaultSettings.emojis,
        quickReplies:  g('s-quick-replies')?.checked ?? defaultSettings.quickReplies,
        instructions:  g('s-instructions')?.value || '',
        alias:         g('s-alias')?.value || '',
        profession:    g('s-profession')?.value || '',
        about:         g('s-about')?.value || '',
        memory:        g('s-memory')?.checked ?? defaultSettings.memory,
        modelImprove:  g('s-model-improve')?.checked ?? defaultSettings.modelImprove,
        twoFA:         g('s-2fa')?.checked ?? defaultSettings.twoFA,
        contentFilter: g('s-content-filter')?.checked ?? defaultSettings.contentFilter,
        safeMode:      g('s-safe-mode')?.checked ?? defaultSettings.safeMode,
        enterSend:     g('s-enter-send')?.checked ?? defaultSettings.enterSend,
    };
}

function populateSettingsDOM(s) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    set('s-theme', s.theme);
    set('s-contrast', s.contrast);
    set('s-accent', s.accent);
    set('s-langue', s.langue);
    set('s-typing-speed', s.typingSpeed);
    check('s-vocal-mode', s.vocalMode);
    set('s-notif-group', s.notifGroup);
    set('s-notif-codex', s.notifCodex);
    set('s-notif-projects', s.notifProjects);
    set('s-notif-reco', s.notifReco);
    set('s-notif-replies', s.notifReplies);
    set('s-notif-tasks', s.notifTasks);
    set('s-notif-usage', s.notifUsage);
    set('s-style', s.style);
    set('s-warm', s.warm);
    set('s-enthusiastic', s.enthusiastic);
    set('s-lists', s.lists);
    set('s-emojis', s.emojis);
    check('s-quick-replies', s.quickReplies);
    set('s-instructions', s.instructions);
    set('s-alias', s.alias);
    set('s-profession', s.profession);
    set('s-about', s.about);
    check('s-memory', s.memory);
    check('s-model-improve', s.modelImprove);
    check('s-2fa', s.twoFA);
    check('s-content-filter', s.contentFilter);
    check('s-safe-mode', s.safeMode);
    check('s-enter-send', s.enterSend);
    updateSliderLabel();
    updateColorDot();
}

function id(x) { return document.getElementById(x); }

function applySettings() {
    saveSettings();
    const s = loadSettings();

    // Typing speed
    window._typingSpeed = s.typingSpeed;

    // Accent color
    document.documentElement.style.setProperty('--accent', s.accent);
    updateColorDot();

    // Theme
    const root = document.documentElement;
    if (s.theme === 'light') {
        root.classList.add('theme-light');
    } else {
        root.classList.remove('theme-light');
    }

    // Contrast
    if (s.contrast === 'high') {
        root.classList.add('contrast-high');
    } else {
        root.classList.remove('contrast-high');
    }
}

function updateSliderLabel() {
    const slider = id('s-typing-speed');
    const label  = id('typing-speed-label');
    if (slider && label) label.textContent = slider.value + 'ms';
}

function updateColorDot() {
    const dot    = id('color-dot');
    const select = id('s-accent');
    if (dot && select) dot.style.background = select.value;
}

window.openSettings = function() {
    const overlay = id('settings-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    const s = loadSettings();
    populateSettingsDOM(s);
    applySettings();
    updateStorageInfo();
    const user = getUser();
    if (user) {
        const uEl = id('account-username');
        const eEl = id('account-email');
        if (uEl) uEl.textContent = '@' + user.username;
        if (eEl) eEl.textContent = user.email || '—';
    }
};

window.closeSettings = function() {
    const overlay = id('settings-overlay');
    if (overlay) overlay.classList.add('hidden');
};

window.handleSettingsOverlayClick = function(e) {
    if (e.target === id('settings-overlay')) closeSettings();
};

window.switchSettingsTab = function(tab) {
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === 'tab-' + tab);
    });
};

function updateStorageInfo() {
    try {
        let total = 0;
        for (const key in localStorage) {
            if (!localStorage.hasOwnProperty(key)) continue;
            total += (localStorage[key].length + key.length) * 2;
        }
        const kb   = (total / 1024).toFixed(1);
        const pct  = Math.min((total / (5 * 1024 * 1024)) * 100, 100).toFixed(1);
        const used = id('storage-used');
        const fill = id('storage-bar-fill');
        if (used) used.textContent = kb + ' KB / ~5 MB';
        if (fill) fill.style.width = pct + '%';
    } catch {}
}

window.exportData = function() {
    try {
        const data = {
            user: getUser(),
            settings: loadSettings(),
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'nexus-data.json';
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (err) {
        alert('Erreur lors de l\'export.');
    }
};

window.confirmDeleteAllConversations = function() {
    if (!confirm('Supprimer TOUTES vos conversations ? Cette action est irréversible.')) return;
    conversations = [];
    chatBox.innerHTML = '';
    fetch(`${API_BASE}/conversations`, { headers: authHeaders() })
        .then(r => r.json())
        .then(list => Promise.all(list.map(c =>
            fetch(`${API_BASE}/conversations/${c._id}`, { method: 'DELETE', headers: authHeaders() })
        )))
        .catch(() => {})
        .finally(() => createNewConversation());
};

window.clearCache = function() {
    if (!confirm('Vider le cache local ?')) return;
    const keep = ['nexus_token', 'nexus_user', SETTINGS_KEY];
    Object.keys(localStorage).forEach(k => { if (!keep.includes(k)) localStorage.removeItem(k); });
    updateStorageInfo();
    alert('Cache vidé.');
};

// Apply settings on page load
(function() {
    const s = loadSettings();
    window._typingSpeed = s.typingSpeed;
    document.documentElement.style.setProperty('--accent', s.accent);
    if (s.theme === 'light') document.documentElement.classList.add('theme-light');
    if (s.contrast === 'high') document.documentElement.classList.add('contrast-high');
})();

// Ctrl+, shortcut to open settings
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); }
});
