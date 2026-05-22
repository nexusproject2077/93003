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
    _settingsCache = null;
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

    if (window.innerWidth <= 768) {
        sidebar.classList.add('hidden');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('visible');
    } else {
        const savedSidebar = localStorage.getItem('nexus_sidebar');
        if (savedSidebar === 'hidden') sidebar.classList.add('hidden');
    }

    loadConversationsFromServer();
    loadSettingsFromServer();
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

// ===== DEBOUNCE =====
function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ===== SIDEBAR =====
const toggleSidebarInside  = document.getElementById('toggle-sidebar-inside');
const toggleSidebarOutside = document.getElementById('toggle-sidebar-outside');
const sidebarBackdrop      = document.getElementById('sidebar-backdrop');

function isMobile() { return window.innerWidth <= 768; }

function openSidebar() {
    sidebar.classList.remove('hidden');
    localStorage.setItem('nexus_sidebar', 'visible');
    if (isMobile() && sidebarBackdrop) sidebarBackdrop.classList.add('visible');
    saveSidebarStateToServer('visible');
}

function closeSidebar() {
    sidebar.classList.add('hidden');
    localStorage.setItem('nexus_sidebar', 'hidden');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('visible');
    saveSidebarStateToServer('hidden');
}

window.closeSidebarMobile = closeSidebar;

if (toggleSidebarInside)  toggleSidebarInside.addEventListener('click',  closeSidebar);
if (toggleSidebarOutside) toggleSidebarOutside.addEventListener('click', openSidebar);

if (conversationsList) {
    conversationsList.addEventListener('click', () => {
        if (isMobile()) closeSidebar();
    });
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
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
 claude/parameter-configuration-goiQL
            const ext = file.name.split('.').pop().toLowerCase();
            const isImage = file.type.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);

            // For images: show thumbnail immediately, then update once BLIP finishes
            if (isImage) {
                const dataUrl = await readAsDataURL(file);
                const info    = await getImageDimensions(dataUrl);
                // Partial entry — thumbnail visible, content still loading
                const partial = { name: file.name, type: file.type, size: file.size,
                                  kind: 'image', preview: dataUrl, content: null,
                                  description: `${info.width}×${info.height}px · analyse en cours…` };
                attachedFiles.push(partial);
                renderUploadedFiles();
                // Finish analysis in background
                try {
                    const colors  = await analyzeImageColors(dataUrl);
                    const caption = await captionImageWithHF(dataUrl, file.type);
                    let content = `[Image jointe : ${file.name}]\nDimensions : ${info.width}×${info.height}px\nLuminosité : ${colors.luminosityLabel} (${colors.brightness}/255)\nCouleur dominante : ${colors.avgColor}`;
                    if (caption) content += `\n\nDescription du contenu :\n${caption}`;
                    const desc = caption
                        ? `${info.width}×${info.height}px · "${caption.substring(0, 60)}${caption.length > 60 ? '…' : ''}"`
                        : `${info.width}×${info.height}px · analyse visuelle`;
                    partial.content = content;
                    partial.description = desc;
                } catch {
                    partial.content = `[Image : ${file.name}]\nDimensions : ${info.width}×${info.height}px`;
                    partial.description = `${info.width}×${info.height}px`;
                }
                renderUploadedFiles();
            } else {
                // Non-image: show loading placeholder then extract
                const placeholder = { name: file.name, type: file.type, size: file.size, kind: 'loading', content: null };
                attachedFiles.push(placeholder);
                renderUploadedFiles();
                try {
                    const extracted = await readFileContent(file);
                    const idx = attachedFiles.indexOf(placeholder);
                    if (idx !== -1) attachedFiles[idx] = extracted;
                } catch {
                    const idx = attachedFiles.indexOf(placeholder);
                    if (idx !== -1) attachedFiles[idx] = { name: file.name, type: file.type, size: file.size, kind: 'error', content: null };
                }
                renderUploadedFiles();

            const placeholder = { name: file.name, type: file.type, size: file.size, kind: 'loading', content: null };
            attachedFiles.push(placeholder);
            renderUploadedFiles();
            try {
                const extracted = await readFileContent(file);
                const idx = attachedFiles.indexOf(placeholder);
                if (idx !== -1) attachedFiles[idx] = extracted;
            } catch (err) {
                const idx = attachedFiles.indexOf(placeholder);
                if (idx !== -1) attachedFiles[idx] = { name: file.name, type: file.type, size: file.size, kind: 'error', content: null };
 main
            }
        }
        fileInput.value = '';
    });
}

// ===== FILE READING & EXTRACTION =====
function readAsText(file)        { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file); }); }
function readAsDataURL(file)     { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file); }); }
function readAsArrayBuffer(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsArrayBuffer(file); }); }

async function readFileContent(file) {
    const base = { name: file.name, type: file.type, size: file.size };
    const ext = file.name.split('.').pop().toLowerCase();

    if (file.type.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) {
        const dataUrl = await readAsDataURL(file);
 claude/parameter-configuration-goiQL
        const info    = await getImageDimensions(dataUrl);
        const colors  = await analyzeImageColors(dataUrl);

        // Try HF BLIP captioning (free, no auth required for public models)
        let caption = await captionImageWithHF(dataUrl, file.type);

        // Build rich text description for the AI
        let content = `[Image jointe : ${file.name}]\nDimensions : ${info.width}×${info.height}px\nLuminosité : ${colors.luminosityLabel} (${colors.brightness}/255)\nCouleur dominante : ${colors.avgColor}`;
        if (caption) content += `\n\nDescription du contenu :\n${caption}`;

        const desc = caption
            ? `${info.width}×${info.height}px · "${caption.substring(0, 60)}${caption.length > 60 ? '…' : ''}"`
            : `${info.width}×${info.height}px · analyse visuelle`;

        return { ...base, kind: 'image', content, preview: dataUrl, description: desc };

        const info = await getImageDimensions(dataUrl);
        const compressed = await compressImage(dataUrl, 1024, 0.75);
        return { ...base, kind: 'image', content: compressed, preview: dataUrl,
                 description: `Image ${file.name} — ${info.width}x${info.height}px` };
 main
    }

    if (file.type.startsWith('text/') || ['txt','csv','md','json','xml','html','js','ts','py','java','c','cpp','css'].includes(ext)) {
        const text = await readAsText(file);
        return { ...base, kind: 'text', content: text, description: `Texte (${text.split('\n').length} lignes)` };
    }

    if (file.type === 'application/pdf' || ext === 'pdf') {
        const text = await extractPDFText(file);
        return { ...base, kind: 'text', content: text, description: `PDF extrait (${text.split('\n').length} lignes)` };
    }

    if (['xlsx','xls','ods'].includes(ext) || file.type.includes('spreadsheet') || file.type.includes('excel')) {
        const text = await extractExcelText(file);
        return { ...base, kind: 'text', content: text, description: `Tableau extrait` };
    }

    if (['docx'].includes(ext) || file.type.includes('wordprocessingml')) {
        const text = await extractWordText(file);
        return { ...base, kind: 'text', content: text, description: `Document extrait (${text.split('\n').length} lignes)` };
    }

    try {
        const text = await readAsText(file);
        return { ...base, kind: 'text', content: text };
    } catch {
        return { ...base, kind: 'binary', content: null, description: 'Fichier binaire non lisible' };
    }
}

function getImageDimensions(dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
 claude/parameter-configuration-goiQL
        img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });

        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = dataUrl;
    });
}

function compressImage(dataUrl, maxWidth = 1024, quality = 0.75) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
 main
        img.src = dataUrl;
    });
}

function analyzeImageColors(dataUrl) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 80; canvas.height = 80;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 80, 80);
                const data = ctx.getImageData(0, 0, 80, 80).data;
                let r = 0, g = 0, b = 0, br = 0;
                const n = data.length / 4;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i]; g += data[i+1]; b += data[i+2];
                    br += data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
                }
                r = Math.round(r/n); g = Math.round(g/n); b = Math.round(b/n);
                br = Math.round(br/n);
                const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
                const luminosityLabel = br < 80 ? 'sombre' : br < 170 ? 'moyen' : 'clair';
                resolve({ avgColor: hex, brightness: br, luminosityLabel });
            } catch { resolve({ avgColor: '#888888', brightness: 128, luminosityLabel: 'moyen' }); }
        };
        img.onerror = () => resolve({ avgColor: '#888888', brightness: 128, luminosityLabel: 'moyen' });
        img.src = dataUrl;
    });
}

function dataURLtoBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
}

async function captionImageWithHF(dataUrl, mimeType) {
    try {
        const blob = dataURLtoBlob(dataUrl);
        // Try up to 2 attempts (model may be loading on first try → 503)
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(
                'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large',
                { method: 'POST', headers: { 'Content-Type': mimeType || 'image/jpeg' }, body: blob }
            );
            if (res.ok) {
                const json = await res.json();
                return (Array.isArray(json) ? json[0]?.generated_text : json?.generated_text) || null;
            }
            if (res.status === 503 && attempt === 0) {
                // Model warming up — wait 4s and retry once
                await new Promise(r => setTimeout(r, 4000));
                continue;
            }
            break;
        }
        return null;
    } catch { return null; }
}

async function extractPDFText(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js non charge');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buffer = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages, 80);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const lineMap = {};
        content.items.forEach(item => {
            const y = Math.round(item.transform[5]);
            lineMap[y] = (lineMap[y] || '') + item.str + ' ';
        });
        const pageText = Object.keys(lineMap).sort((a,b) => b-a).map(y => lineMap[y].trim()).join('\n');
        pages.push(`--- Page ${i} ---\n${pageText}`);
    }
    if (pdf.numPages > maxPages) pages.push(`[${pdf.numPages - maxPages} page(s) tronquees]`);
    return pages.join('\n\n');
}

async function extractExcelText(file) {
    if (typeof XLSX === 'undefined') throw new Error('SheetJS non charge');
    const buffer = await readAsArrayBuffer(file);
    const workbook = XLSX.read(buffer, { type: 'array' });
    return workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        return `=== Feuille : ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join('\n\n');
}

async function extractWordText(file) {
    if (typeof mammoth === 'undefined') throw new Error('mammoth.js non charge');
    const buffer = await readAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return { txt:'📄', pdf:'📕', doc:'📘', docx:'📘', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', webp:'🖼️', xlsx:'📊', xls:'📊', csv:'📊', json:'📋', md:'📝' }[ext] || '📎';
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
        fileEl.className = 'uploaded-file' + (file.kind === 'loading' ? ' file-loading' : '');
        if (file.kind === 'image' && file.preview) {
            const badge = file.content
                ? '<span class="file-badge ok">✓ analysable</span>'
                : '<span class="file-badge extracting">analyse IA…</span>';
            fileEl.innerHTML = `
                <img src="${file.preview}" class="file-thumb" alt="${file.name}">
                <div class="file-info">
                    <span class="file-name" title="${file.name}">${file.name}</span>
                    <span class="file-meta">${file.description || formatFileSize(file.size)}</span>
                </div>
claude/parameter-configuration-goiQL
                ${badge}
                <span class="remove-file" onclick="removeFile(${index})">×</span>
            `;
        } else {
            const statusBadge = file.kind === 'loading'
                ? '<span class="file-badge extracting">extraction…</span>'
                : (file.kind === 'text' || file.kind === 'image') && file.content
                ? '<span class="file-badge ok">✓ analysable</span>'

                <span class="remove-file" onclick="removeFile(${index})">x</span>
            `;
        } else {
            const statusBadge = file.kind === 'loading'
                ? '<span class="file-badge extracting">extraction...</span>'
                : file.kind === 'text' && file.description
                ? '<span class="file-badge ok">analysable</span>'
 main
                : file.kind === 'error'
                ? '<span class="file-badge err">erreur</span>'
                : '';
            fileEl.innerHTML = `
                <span class="file-icon">${getFileIcon(file.name)}</span>
                <div class="file-info">
                    <span class="file-name" title="${file.name}">${file.name}</span>
                    <span class="file-meta">${file.description || formatFileSize(file.size)}</span>
                </div>
                ${statusBadge}
                <span class="remove-file" onclick="removeFile(${index})">x</span>
            `;
        }
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
        if (conversations.length === 0) await createNewConversation();
        else loadConversation(conversations[0]._id);
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

const debouncedSave = debounce(saveConversationToServer, 900);

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
    const filtered = searchQuery
        ? conversations.filter(c => c.title.toLowerCase().includes(searchQuery))
        : conversations;
    if (filtered.length === 0 && searchQuery) {
        conversationsList.innerHTML = '<p style="color:rgba(255,255,255,0.2);font-size:0.78rem;text-align:center;padding:16px 0">Aucun resultat</p>';
        return;
    }
    filtered.forEach(conv => {
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
    text = text.replace(/```(\w+)?\n?([\s\S]+?)```/g, (_, lang, code) => {
        const langAttr = lang ? ` class="language-${lang}"` : '';
        return `<div class="code-block-wrapper"><pre><code${langAttr}>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre><button class="copy-code-btn" onclick="copyCode(this)">Copier</button></div>`;
    });
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    text = text.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>)(\n<li>[\s\S]*?<\/li>)*/g, match => `<ul>${match}</ul>`);
    text = text.replace(/\n\n/g, '</p><p>');
    return text;
}

// ===== TYPEWRITER =====
let stopRequested = false;
let currentFetch = null;

window.stopGeneration = function() {
    stopRequested = true;
    if (currentFetch) { currentFetch.abort(); currentFetch = null; }
    isTyping = false;
    hideTypingIndicator();
    sendButton.disabled = false;
    userInput.disabled  = false;
    userInput.focus();
    toggleStopButton(false);
};

function toggleStopButton(show) {
    const stopBtn = document.getElementById('stop-button');
    if (!stopBtn) return;
    stopBtn.classList.toggle('hidden', !show);
    sendButton.classList.toggle('hidden', show);
}

async function typeWriter(element, text, isHTML) {
    element.classList.add('typing');
    isTyping = true;
    stopRequested = false;
    const speed = window._typingSpeed ?? TYPING_SPEED;

    if (isHTML) {
        const html = markdownToHTML(text);
        if (speed === 0) {
            element.innerHTML = html;
        } else {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            const plain = temp.textContent;
            const tokens = plain.match(/\S+|\s+/g) || [];
            let buf = '';
            for (const token of tokens) {
                if (stopRequested) break;
                buf += token;
                if (token.trim()) {
                    element.innerHTML = markdownToHTML(buf);
                    chatBox.scrollTop = chatBox.scrollHeight;
                    await new Promise(r => setTimeout(r, speed));
                }
            }
            element.innerHTML = html;
        }
    } else {
        if (speed === 0) {
            element.textContent = text;
        } else {
            const tokens = text.match(/\S+|\s+/g) || [];
            let buf = '';
            for (const token of tokens) {
                if (stopRequested) break;
                buf += token;
                if (token.trim()) {
                    element.textContent = buf;
                    chatBox.scrollTop = chatBox.scrollHeight;
                    await new Promise(r => setTimeout(r, speed));
                }
            }
            element.textContent = text;
        }
    }

    element.classList.remove('typing');
    isTyping = false;

    if (isHTML && typeof hljs !== 'undefined') {
        element.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    }
}

// ===== MESSAGES =====
async function addMessage(className, message, isHTML = false, animate = true) {
    const msg = document.createElement('div');
    msg.className = className;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = 'Copier';
    copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(message).then(() => {
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
                copyBtn.classList.remove('copied');
                copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 1800);
        }).catch(() => {});
    };
    msg.appendChild(copyBtn);
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
        debouncedSave(conv);
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
    let prompt = "Tu es Nexus AI, un assistant IA intelligent, sympa et utile cree par l'entreprise Nexus. Tu reponds en francais.";
    if (s.alias) prompt += ` L'utilisateur s'appelle ${s.alias}.`;
    if (s.profession) prompt += ` Sa profession est : ${s.profession}.`;
    if (s.about) prompt += ` Informations sur l'utilisateur : ${s.about}.`;
    const styleMap = { formal: 'Adopte un style formel et professionnel.', casual: 'Adopte un style decontracte et familier.', concise: 'Sois tres concis et va droit au but.', detailed: 'Donne des reponses detaillees et completes.' };
    if (styleMap[s.style]) prompt += ' ' + styleMap[s.style];
    if (s.warm === 'more') prompt += ' Sois tres chaleureux et bienveillant.';
    if (s.warm === 'less') prompt += ' Reste neutre et factuel.';
    if (s.enthusiastic === 'more') prompt += " Montre de l'enthousiasme dans tes reponses.";
    if (s.enthusiastic === 'less') prompt += ' Garde un ton calme et pose.';
    if (s.lists === 'more') prompt += ' Utilise souvent des titres et des listes.';
    if (s.lists === 'less') prompt += ' Evite les listes et les titres, prefere la prose.';
    if (s.emojis === 'more') prompt += ' Utilise des emojis pour illustrer tes reponses.';
    if (s.emojis === 'less') prompt += " N'utilise pas d'emojis.";
    if (s.contentFilter || s.safeMode) prompt += ' Filtre tout contenu inapproprie.';
    if (s.instructions) prompt += '\n\nInstructions personnalisees : ' + s.instructions;
    prompt += "\n\nIMPORTANT: Tu PEUX analyser tous les fichiers. Tu peux utiliser le formatage Markdown.";
    return prompt;
}

// ===== API GROQ =====
async function getGroqAIResponse(message) {
    try {
        const conv = getCurrentConversation();
        if (!conv.history) conv.history = [];

 claude/parameter-configuration-goiQL
        // Build the full text message — all file types (images included) send their
        // extracted text content; base64 is never forwarded to the backend.
        let fullMessage = message || '';
        if (attachedFiles.length > 0) {
            attachedFiles.forEach(f => {
                fullMessage += `\n\n[Fichier joint : ${f.name} (${formatFileSize(f.size)})]\n`;
                if (f.content && f.kind !== 'binary') {
                    const preview = f.content.length > 15000
                        ? f.content.substring(0, 15000) + `\n[… ${f.content.length - 15000} caractères tronqués]`

        const images    = attachedFiles.filter(f => f.kind === 'image');
        const textFiles = attachedFiles.filter(f => f.kind === 'text' || f.kind === 'binary');

        let textPart = message || '';
        if (textFiles.length > 0) {
            textPart += '\n\n';
            textFiles.forEach(f => {
                textPart += `\n[Fichier joint : ${f.name} (${formatFileSize(f.size)})]\n`;
                if (f.content) {
                    const preview = f.content.length > 15000
                        ? f.content.substring(0, 15000) + `\n[... ${f.content.length - 15000} caracteres tronques]`
 main
                        : f.content;
                    fullMessage += preview + '\n';
                } else {
                    fullMessage += `Type : ${f.type} · non analysable\n`;
                }
            });
        }

 claude/parameter-configuration-goiQL
        conv.history.push({ role: 'user', content: fullMessage || 'Analyse ces fichiers' });

        let currentContent;
        let historyEntry;
        if (images.length > 0) {
            const parts = [{ type: 'text', text: textPart || 'Analyse ces fichiers' }];
            images.forEach(img => {
                parts.push({ type: 'image_url', image_url: { url: img.content } });
            });
            currentContent = parts;
            historyEntry = textPart + images.map(img => `\n[Image jointe : ${img.name}]`).join('');
        } else {
            currentContent = textPart || 'Analyse ces fichiers';
            historyEntry = currentContent;
        }

        conv.history.push({ role: 'user', content: historyEntry });

        const historyForAPI = conv.history.slice(0, -1).map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : m.content
        }));
main

        currentFetch = new AbortController();
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: authHeaders(),
            signal: currentFetch.signal,
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: buildSystemPrompt() },
                    ...conv.history
                ]
            })
        });

        currentFetch = null;
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
        if (error.name === 'AbortError') return '';
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
    userInput.style.height = 'auto';

    if (message === '1h' && attachedFiles.length === 0) {
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        const ticket = `Titre 1 voyage\n\nValable 1 heure des reception du SMS\nLe ${formatDate(now)}\nDe ${formatTime(now)} a ${formatTime(oneHourLater)}\n\n1.35 E\n\n${generateRandomSequence()}\n\n0783643942${generateRandomCode()}\n\nCGV : www.tcat.fr/cgv-ticket-sms`;
        setTimeout(async () => {
            await addMessage('bot-message', ticket, false, true);
            sendButton.disabled = false;
            userInput.disabled  = false;
            userInput.focus();
            toggleStopButton(false);
        }, 500);
        navigator.clipboard.writeText(ticket).catch(console.error);
    } else {
        toggleStopButton(true);
        showTypingIndicator();
        const aiResponse = await getGroqAIResponse(message || 'Analyse ces fichiers');
        hideTypingIndicator();
        if (aiResponse) await addMessage('bot-message', aiResponse, true, true);
        sendButton.disabled = false;
        userInput.disabled  = false;
        userInput.focus();
        toggleStopButton(false);
    }
}

if (sendButton) sendButton.addEventListener('click', handleMessage);

if (userInput) {
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
    });
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            const s = loadSettings();
            if (s.enterSend !== false && !sendButton.disabled && !isTyping) {
                e.preventDefault();
                handleMessage();
            }
        }
    });
}

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
let _settingsCache = null;

const defaultSettings = {
    theme: 'system', contrast: 'system', accent: '#00d2ff', langue: 'auto',
    typingSpeed: 15, vocalMode: false, notifGroup: 'push', notifCodex: 'push',
    notifProjects: 'email', notifReco: 'both', notifReplies: 'push', notifTasks: 'both',
    notifUsage: 'both', style: 'default', warm: 'default', enthusiastic: 'default',
    lists: 'default', emojis: 'default', quickReplies: true, instructions: '',
    alias: '', profession: '', about: '', memory: false, modelImprove: true,
    twoFA: false, contentFilter: false, safeMode: false, enterSend: true,
};

function loadSettings() {
    if (_settingsCache) return { ...defaultSettings, ..._settingsCache };
    try {
        return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
        return { ...defaultSettings };
    }
}

async function loadSettingsFromServer() {
    try {
        const res = await fetch(`${API_BASE}/user/settings`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        _settingsCache = data.settings || {};
        if (data.sidebarState === 'hidden') sidebar.classList.add('hidden');
        else if (window.innerWidth > 768) sidebar.classList.remove('hidden');
        const s = loadSettings();
        window._typingSpeed = s.typingSpeed;
        document.documentElement.style.setProperty('--accent', s.accent || '#00d2ff');
        if (s.theme === 'light') document.documentElement.classList.add('theme-light');
        else document.documentElement.classList.remove('theme-light');
        if (s.contrast === 'high') document.documentElement.classList.add('contrast-high');
        else document.documentElement.classList.remove('contrast-high');
    } catch (err) {
        console.error('Erreur chargement settings:', err);
    }
}

async function saveSettingsToServer(s) {
    try {
        _settingsCache = s;
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ settings: s })
        });
    } catch (err) {
        console.error('Erreur sauvegarde settings:', err);
    }
}

async function saveSidebarStateToServer(state) {
    try {
        await fetch(`${API_BASE}/user/settings`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ sidebarState: state })
        });
    } catch (err) {
        console.error('Erreur sauvegarde sidebar:', err);
    }
}

function saveSettings() {
    const s = readSettingsFromDOM();
    _settingsCache = s;
    saveSettingsToServer(s);
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
    const set   = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    set('s-theme', s.theme); set('s-contrast', s.contrast); set('s-accent', s.accent);
    set('s-langue', s.langue); set('s-typing-speed', s.typingSpeed);
    check('s-vocal-mode', s.vocalMode);
    set('s-notif-group', s.notifGroup); set('s-notif-codex', s.notifCodex);
    set('s-notif-projects', s.notifProjects); set('s-notif-reco', s.notifReco);
    set('s-notif-replies', s.notifReplies); set('s-notif-tasks', s.notifTasks);
    set('s-notif-usage', s.notifUsage); set('s-style', s.style);
    set('s-warm', s.warm); set('s-enthusiastic', s.enthusiastic);
    set('s-lists', s.lists); set('s-emojis', s.emojis);
    check('s-quick-replies', s.quickReplies);
    set('s-instructions', s.instructions); set('s-alias', s.alias);
    set('s-profession', s.profession); set('s-about', s.about);
    check('s-memory', s.memory); check('s-model-improve', s.modelImprove);
    check('s-2fa', s.twoFA); check('s-content-filter', s.contentFilter);
    check('s-safe-mode', s.safeMode); check('s-enter-send', s.enterSend);
    updateSliderLabel();
    updateColorDot();
}

function id(x) { return document.getElementById(x); }

function applySettings() {
    saveSettings();
    const s = loadSettings();
    window._typingSpeed = s.typingSpeed;
    document.documentElement.style.setProperty('--accent', s.accent);
    updateColorDot();
    const root = document.documentElement;
    if (s.theme === 'light') root.classList.add('theme-light');
    else root.classList.remove('theme-light');
    if (s.contrast === 'high') root.classList.add('contrast-high');
    else root.classList.remove('contrast-high');
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
        const tokenSize = ((localStorage.getItem('nexus_token') || '').length + (localStorage.getItem('nexus_user') || '').length) * 2;
        const kb   = (tokenSize / 1024).toFixed(1);
        const used = id('storage-used');
        const fill = id('storage-bar-fill');
        if (used) used.textContent = kb + ' KB (donnees sur serveur)';
        if (fill) fill.style.width = '1%';
    } catch {}
}

window.exportData = function() {
    try {
        const data = {
            user: getUser(),
            settings: _settingsCache || loadSettings(),
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'nexus-data.json';
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (err) {
        alert("Erreur lors de l'export.");
    }
};

window.confirmDeleteAllConversations = function() {
    if (!confirm('Supprimer TOUTES vos conversations ? Cette action est irreversible.')) return;
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
    const keep = ['nexus_token', 'nexus_user'];
    Object.keys(localStorage).forEach(k => { if (!keep.includes(k)) localStorage.removeItem(k); });
    updateStorageInfo();
    showToast('Cache vide.', 'success');
};

// Apply settings on page load
(function() {
    const s = loadSettings();
    window._typingSpeed = s.typingSpeed;
    document.documentElement.style.setProperty('--accent', s.accent);
    if (s.theme === 'light') document.documentElement.classList.add('theme-light');
    if (s.contrast === 'high') document.documentElement.classList.add('contrast-high');
})();

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); createNewConversation(); }
    if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        sidebar.classList.contains('hidden') ? openSidebar() : closeSidebar();
    }
});

// ===== CONVERSATION SEARCH =====
let searchQuery = '';

window.filterConversations = function(q) {
    searchQuery = q.toLowerCase().trim();
    renderConversationsList();
};

// ===== TOAST =====
window.showToast = function(msg, type = '', duration = 2400) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
};

// ===== COPY CODE BLOCK =====
window.copyCode = function(btn) {
    const code = btn.closest('.code-block-wrapper')?.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'Copie !';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('copied'); }, 1800);
    }).catch(() => {});
};
