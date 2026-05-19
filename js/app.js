// ===== CONFIGURATION =====
// Clé API supprimée - gérée côté backend
const TYPING_SPEED = 15; // Vitesse de frappe en millisecondes (plus petit = plus rapide)

// ===== ÉLÉMENTS DOM =====
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clock = document.getElementById('clock');
const conversationsList = document.getElementById('conversations-list');
const newChatBtn = document.getElementById('new-chat-btn');
const sidebar = document.getElementById('sidebar');
const fileInput = document.getElementById('file-input');
const attachFileBtn = document.getElementById('attach-file-btn');
const uploadedFilesDiv = document.getElementById('uploaded-files');

// ===== ÉTAT DE L'APPLICATION =====
let conversations = JSON.parse(localStorage.getItem('nexus_conversations')) || [];
let currentConversationId = null;
let attachedFiles = [];
let isTyping = false;

// ===== FERMER LA SIDEBAR PAR DÉFAUT SUR MOBILE =====
if (window.innerWidth <= 768) {
    sidebar.classList.add('hidden');
}

// ===== INITIALISATION =====
if (conversations.length === 0) {
    createNewConversation();
} else {
    loadConversation(conversations[0].id);
}
renderConversationsList();

// ===== HORLOGE =====
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    clock.textContent = `${hours}:${minutes}:${seconds}`;
}
setInterval(updateClock, 1000);
updateClock();

// ===== GESTION DE LA SIDEBAR =====
const toggleSidebarInside = document.getElementById('toggle-sidebar-inside');
const toggleSidebarOutside = document.getElementById('toggle-sidebar-outside');

// Bouton INTÉRIEUR (dans la sidebar)
if (toggleSidebarInside) {
    toggleSidebarInside.addEventListener('click', () => {
        sidebar.classList.add('hidden');
    });
}

// Bouton EXTÉRIEUR (apparaît quand sidebar fermée)
if (toggleSidebarOutside) {
    toggleSidebarOutside.addEventListener('click', () => {
        sidebar.classList.remove('hidden');
    });
}

// Fermer la sidebar au clic sur une conversation sur mobile
if (window.innerWidth <= 768) {
    conversationsList.addEventListener('click', () => {
        sidebar.classList.add('hidden');
    });
}

// ===== GESTION DES FICHIERS =====
attachFileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            attachedFiles.push({
                name: file.name,
                type: file.type,
                size: file.size,
                content: event.target.result
            });
            renderUploadedFiles();
        };
        
        if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
    fileInput.value = '';
});

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'txt': '📄', 'pdf': '📕', 'doc': '📘', 'docx': '📘',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'xlsx': '📊', 'xls': '📊', 'csv': '📊'
    };
    return icons[ext] || '📎';
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
            <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${formatFileSize(file.size)}</span>
            <span class="remove-file" onclick="removeFile(${index})">✕</span>
        `;
        uploadedFilesDiv.appendChild(fileEl);
    });
}

window.removeFile = function(index) {
    attachedFiles.splice(index, 1);
    renderUploadedFiles();
};

// ===== GESTION DES CONVERSATIONS =====
function createNewConversation() {
    const conversation = {
        id: Date.now().toString(),
        title: 'Nouvelle conversation',
        messages: [],
        history: [],
        createdAt: new Date().toISOString()
    };
    conversations.unshift(conversation);
    saveConversations();
    loadConversation(conversation.id);
    renderConversationsList();
}

function loadConversation(id) {
    currentConversationId = id;
    const conversation = conversations.find(c => c.id === id);
    if (!conversation) return;

    chatBox.innerHTML = '';
    conversation.messages.forEach(msg => {
        if (msg.type === 'user') {
            addMessage('user-message', msg.content, false);
        } else {
            addMessage('bot-message', msg.content, true, false);
        }
    });

    renderConversationsList();
    
    setTimeout(() => {
        chatBox.scrollTop = chatBox.scrollHeight;
    }, 100);
}

function saveConversations() {
    localStorage.setItem('nexus_conversations', JSON.stringify(conversations));
}

function getCurrentConversation() {
    return conversations.find(c => c.id === currentConversationId);
}

function updateConversationTitle(message) {
    const conversation = getCurrentConversation();
    if (conversation && conversation.messages.length === 1) {
        conversation.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        saveConversations();
        renderConversationsList();
    }
}

function deleteConversation(id, event) {
    event.stopPropagation();
    if (confirm('Supprimer cette conversation ?')) {
        conversations = conversations.filter(c => c.id !== id);
        saveConversations();
        
        if (currentConversationId === id) {
            if (conversations.length === 0) {
                createNewConversation();
            } else {
                loadConversation(conversations[0].id);
            }
        }
        renderConversationsList();
    }
}

function renderConversationsList() {
    conversationsList.innerHTML = '';
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (conv.id === currentConversationId ? ' active' : '');
        
        const date = new Date(conv.createdAt);
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
            <div class="conversation-title">${conv.title}</div>
            <div class="conversation-date">${dateStr} ${timeStr}</div>
            <button class="delete-conv-btn" onclick="deleteConversation('${conv.id}', event)">✕</button>
        `;
        
        item.addEventListener('click', () => loadConversation(conv.id));
        conversationsList.appendChild(item);
    });
}

newChatBtn.addEventListener('click', createNewConversation);

// ===== MARKDOWN TO HTML =====
function markdownToHTML(text) {
    text = text.replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code>$2</code></pre>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
    text = text.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
    text = text.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    text = text.split('\n\n').map(para => {
        if (!para.trim().startsWith('<')) {
            return '<p>' + para + '</p>';
        }
        return para;
    }).join('\n');
    text = text.replace(/\n/g, '<br>');
    return text;
}

// ===== EFFET DE FRAPPE LETTRE PAR LETTRE =====
async function typeWriter(element, text, isHTML = false) {
    isTyping = true;
    element.classList.add('typing');
    
    if (isHTML) {
        // Pour le HTML, on affiche progressivement le texte formaté
        const formattedText = markdownToHTML(text);
        let currentText = '';
        
        for (let i = 0; i < text.length; i++) {
            currentText += text[i];
            element.innerHTML = markdownToHTML(currentText);
            chatBox.scrollTop = chatBox.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, TYPING_SPEED));
        }
    } else {
        // Pour le texte brut
        for (let i = 0; i < text.length; i++) {
            element.textContent = text.substring(0, i + 1);
            chatBox.scrollTop = chatBox.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, TYPING_SPEED));
        }
    }
    
    element.classList.remove('typing');
    isTyping = false;
}

// ===== AJOUT DE MESSAGES =====
async function addMessage(className, message, isHTML = false, animate = true) {
    const msg = document.createElement('div');
    msg.className = className;
    
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Effet de frappe pour les messages du bot
    if (className === 'bot-message' && animate) {
        await typeWriter(msg, message, isHTML);
    } else {
        if (isHTML) {
            msg.innerHTML = markdownToHTML(message);
        } else {
            msg.textContent = message;
        }
    }

    // Sauvegarder dans la conversation
    const conversation = getCurrentConversation();
    if (conversation && !conversation.messages.find(m => m.content === message)) {
        conversation.messages.push({
            type: className.includes('user') ? 'user' : 'bot',
            content: message
        });
        saveConversations();
    }

    return msg;
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.id = 'typing';
    indicator.innerHTML = '<span>●</span><span>●</span><span>●</span>';
    chatBox.appendChild(indicator);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing');
    if (indicator) {
        indicator.remove();
    }
}

// ===== GÉNÉRATION DE TICKETS =====
function formatDate(date) {
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getFullYear()).slice(-2)}`;
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function generateRandomSequence() {
    return Array.from({ length: 6 }, () =>
        String(Math.floor(Math.random() * 100)).padStart(2, '0')
    ).join("'");
}

function generateRandomLetter() {
    return String.fromCharCode(65 + Math.floor(Math.random() * 26));
}

function generateRandomCode() {
    const letter1 = generateRandomLetter();
    let letter2, letter3;
    do {
        letter2 = generateRandomLetter();
    } while (letter2 === letter1);
    do {
        letter3 = generateRandomLetter();
    } while (letter3 === letter1 || letter3 === letter2);
    const digit = Math.floor(Math.random() * 10);
    return `${letter1}${digit}${letter2}${letter3}`;
}

// ===== API GROQ =====
async function getGroqAIResponse(message) {
    try {
        const conversation = getCurrentConversation();
        
        let fullMessage = message;
        if (attachedFiles.length > 0) {
            fullMessage += '\n\n[Fichiers joints:]\n';
            attachedFiles.forEach(file => {
                fullMessage += `\nFichier: ${file.name} (${formatFileSize(file.size)})\n`;
                if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
                    fullMessage += `Contenu:\n${file.content}\n`;
                } else {
                    fullMessage += `Type: ${file.type}\n`;
                }
            });
        }
        
        conversation.history.push({
            role: "user",
            content: fullMessage
        });

const response = await fetch('https://api.mmi25b11.mmi-troyes.fr/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        messages: [
            {
                role: "system",
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
            ...conversation.history
        ]
    })
});

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Erreur API:', errorData);
            if (response.status === 401) {
                return "❌ Clé API invalide. Vérifie ta configuration.";
            }
            return "❌ Erreur de connexion à Nexus AI. Réessaie dans quelques secondes.";
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        conversation.history.push({
            role: "assistant",
            content: aiResponse
        });

        if (conversation.history.length > 20) {
            conversation.history = conversation.history.slice(-20);
        }

        saveConversations();
        
        attachedFiles = [];
        renderUploadedFiles();
        
        return aiResponse;
    } catch (error) {
        console.error('Erreur:', error);
        return "❌ Erreur de connexion. Vérifie ta connexion internet.";
    }
}

// ===== GESTION DES MESSAGES =====
async function handleMessage() {
    const message = userInput.value.trim();
    if (!message && attachedFiles.length === 0) return;
    if (isTyping) return; // Empêcher l'envoi pendant la frappe

    sendButton.disabled = true;
    userInput.disabled = true;

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
            userInput.disabled = false;
            userInput.focus();
        }, 500);

        navigator.clipboard.writeText(ticket)
            .then(() => console.log('Ticket copié'))
            .catch(err => console.error('Erreur copie:', err));
    } else {
        showTypingIndicator();
        
        const aiResponse = await getGroqAIResponse(message || 'Analyse ces fichiers');
        
        hideTypingIndicator();
        
        await addMessage('bot-message', aiResponse, true, true);
        
        sendButton.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}

sendButton.addEventListener('click', handleMessage);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendButton.disabled && !isTyping) {
        handleMessage();
    }
});
