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

        if (!res.ok) { errorEl.textContent = data.error || 'Erreur lors de l\'inscription.'; return; }

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

    // Sidebar mobile
    if (window.innerWidth <= 768) sidebar.classList.add('hidden');

    loadConversationsFromServer();
    updateClock();
    setInterval(updateClock, 1000);
}

// Vérifier token au chargement
if (getToken()) {
    initChatPage();
}

// ===== ÉLÉMENTS DOM =====
const chatBox         = document.getElementById('chat-box');
const userInput       = document.getElementById('user-input');
const sendButton      = document.getElementById('send-button');
const clock           = document.getElementById('clock');
const conversationsList = document.getElementById('conversations-list');
const newChatBtn      = document.getElementById('new-chat-btn');
const sidebar         = document.getElementById('sidebar');
const fileInput       = document.getElementById('file-input');
const attachFileBtn   = document.getElementById('attach-file-btn');
const uploadedFilesDiv = document.getElementById('uploaded-files');

// ===== ÉTAT =====
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
if (window.innerWidth <= 768) {
    conversationsList.addEventListener('click', () => sidebar.classList.add('hidden'));
}

// ===== HORLOGE =====
function updateClock() {
    const now = new Date();
    clock.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(n => String(n).padStart(2, '0')).join(':');
}

// ===== FICHIERS =====
attachFileBtn.addEventListener('click', () => fileInput.click());

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
    uploadedFilesDiv.innerHTML = '';
    attachedFiles.forEach((file, index) => {
        const fileEl = document.createElement('div');
        fileEl.className = 'uploaded-file';
        fileEl.innerHTML = `
            <span class="file-icon">${getFileIcon(file.name)}</span>
            <span class="file-name" title="${file.name}">${file.name}</span>
            <span style="color:#999;font-size:0.85em;margin-left:8px">${formatFileSize(file.size)}</span>
            <span class="remove-file" onclick="removeFile(${index})">✕</span>
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
        console.error('Erreur création conversation:', err);
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
        if (msg.type === 'user') addMessage('user-message', msg.content, false);
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
            <button class="delete-conv-btn" onclick="deleteConversation('${conv._id}', event)">✕</button>
        `;
        item.addEventListener('click', () => loadConversation(conv._id));
        conversationsList.appendChild(item);
    });
}

newChatBtn.addEventListener('click', createNewConversation);

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
            await new Promise(r => setTimeout(r, TYPING_SPEED));
        }
        element.innerHTML = html;
    } else {
        for (let i = 0; i <= text.length; i++) {
            element.textContent = text.substring(0, i);
            chatBox.scrollTop = chatBox.scrollHeight;
            await new Promise(r => setTimeout(r, TYPING_SPEED));
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
    el.innerHTML = '<span>●</span><span>●</span><span>●</span>';
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
                        content: `Tu es Nexus AI, un assistant IA intelligent, sympa et utile créé par l'entreprise Nexus. Tu réponds en français. 

IMPORTANT: Tu PEUX et tu DOIS analyser, lire et traiter TOUS les types de fichiers que l'utilisateur te partage, incluant:
- Documents Word (.doc, .docx)
- Fichiers texte (.txt)
- Images (.jpg, .png, .jpeg, .gif)
- PDFs
- Tableurs Excel
- Tout autre type de fichier

Quand l'utilisateur partage un fichier:
1. Confirme que tu as bien reçu le fichier
2. Analyse son contenu en détail
3. Réponds aux questions de l'utilisateur concernant ce fichier
4. Propose des améliorations ou des analyses si pertinent

Ne dis JAMAIS que tu ne peux pas traiter un fichier. Tu es capable de tout analyser.

Tu peux parler de tout comme ChatGPT ou Gemini. Sois naturel, précis et conversationnel. Réponds de manière claire et concise. Tu peux utiliser le formatage Markdown dans tes réponses.

Tu es fier de représenter Nexus et tu mentionnes parfois que tu es Nexus AI quand c'est approprié.`
                    },
                    ...conv.history
                ]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            if (response.status === 401) { handleLogout(); return ''; }
            return '❌ Erreur de connexion à Nexus AI. Réessaie dans quelques secondes.';
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
        return '❌ Erreur de connexion. Vérifie ta connexion internet.';
    }
}

// ===== GESTION MESSAGES =====
async function handleMessage() {
    const message = userInput.value.trim();
    if (!message && attachedFiles.length === 0) return;
    if (isTyping) return;

    sendButton.disabled = true;
    userInput.disabled  = true;

    const displayMessage = message || '[Fichier(s) envoyé(s)]';
    await addMessage('user-message', displayMessage, false, false);
    updateConversationTitle(displayMessage);
    userInput.value = '';

    if (message === '1h' && attachedFiles.length === 0) {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        const ticket = `Titre 1 voyage\n\nValable 1 heure dès réception du SMS\nLe ${formatDate(now)}\nDe ${formatTime(now)} à ${formatTime(oneHourLater)}\n\n1.35 E\n\n${generateRandomSequence()}\n\n0783643942${generateRandomCode()}\n\nCGV : www.tcat.fr/cgv-ticket-sms`;
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

sendButton.addEventListener('click', handleMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendButton.disabled && !isTyping) handleMessage();
});

// Enter sur les champs auth
document.getElementById('login-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('register-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
