// path: public/scripts/extensions/third-party/st-relationship-widget/index.js
const MODULE_NAME = 'st_relationship_widget';

// Default Settings
const defaultSettings = {
    enabled: true,
    idleEnabled: true,
    logEnabled: true,
    position: { x: null, y: null } // Save widget position
};

let settings = {};
let idleTimer = null;
const IDLE_TIMEOUT_MS = 180000; // 3 minutes

// General Universal Whispers
const idleWhispers = [
    "...",
    "Are you still there?",
    "Just looking at you...",
    "Thinking...",
    "*waits patiently*"
];

/**
 * Load and Save Settings
 */
function loadSettings() {
    const context = SillyTavern.getContext();
    settings = Object.assign({}, defaultSettings, context.extensionSettings[MODULE_NAME]);
    context.extensionSettings[MODULE_NAME] = settings;
}

function saveSettings() {
    SillyTavern.getContext().extensionSettings[MODULE_NAME] = settings;
    SillyTavern.getContext().saveSettingsDebounced();
}

/**
 * Prompt Interceptor: บังคับให้ AI พิมพ์ HTML Comment ซ่อนสถานะ
 */
window.relationshipWidgetInterceptor = function(chat, contextSize, abort, type) {
    if (!settings.enabled) return;
    // แทรกเฉพาะตอนเจนแชทหลัก ไม่ยุ่งกับ summarize หรืออื่นๆ
    if (type !== 'chat' && type !== 'swipe') return;

    const instruction = `\n\n[SYSTEM INSTRUCTION: At the very end of your response, you MUST append a hidden HTML comment containing the relationship status and score change. Format EXACTLY like this: \`<!-- [STATUS: state] [SCORE: +10] --!>\`. 
Allowed states: normal, love, angry, sad, cry. 
Score: A number between -100 and +100 based on the user's action. 
This MUST be inside the HTML comment and placed at the very bottom of your message.]`;

    // ค้นหาข้อความ system สุดท้าย แล้วยัดเงื่อนไขเข้าไป
    chat.push({
        role: 'system',
        content: instruction
    });
};

/**
 * อัปเดต UI กรอบรูป
 */
function updateAvatar() {
    const context = SillyTavern.getContext();
    const charId = context.characterId;
    if (charId === undefined || !context.characters[charId]) return;
    
    const avatarImg = document.getElementById('st-rel-avatar');
    if (avatarImg) {
        // อัปเดตรูปให้ตรงกับตัวละครปัจจุบัน
        avatarImg.src = `/characters/${context.characters[charId].avatar}`;
    }
}

/**
 * อัปเดตสถานะ (สี/แอนิเมชัน)
 */
function updateWidgetState(status, score) {
    if (!settings.enabled) return;
    const widget = document.getElementById('st-rel-widget');
    const scorePopup = document.getElementById('st-rel-score-popup');
    if (!widget || !scorePopup) return;

    // เคลียร์คลาสเก่า
    widget.className = 'st-rel-glass';
    
    // ใส่คลาสสถานะใหม่
    const validStates = ['normal', 'love', 'angry', 'sad', 'cry'];
    const safeStatus = validStates.includes(status) ? status : 'normal';
    widget.classList.add(`state-${safeStatus}`);

    // อนิเมชันคะแนนลอย
    if (score !== 0) {
        // รีเซ็ตอนิเมชัน
        scorePopup.classList.remove('score-animate', 'score-positive', 'score-negative');
        void scorePopup.offsetWidth; // Trigger reflow
        
        scorePopup.textContent = score > 0 ? `+${score}` : `${score}`;
        scorePopup.classList.add('score-animate');
        scorePopup.classList.add(score > 0 ? 'score-positive' : 'score-negative');
    }

    // (Optional) บันทึกลง localforage ถ้าเปิด Record Timeline
    if (settings.logEnabled && score !== 0) {
        const charName = SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name || 'Unknown';
        const logEntry = { date: new Date().toISOString(), character: charName, status, score };
        // ดึงของเก่ามาต่อ แล้วเซฟ (ละโค้ดส่วนเซฟ DB เต็มๆ ไว้เพื่อความกะทัดรัด)
        console.log("[ST-REL] Timeline Log:", logEntry);
    }
}

/**
 * จัดการ Idle Whisper (บับเบิ้ลคำพูดสุ่ม)
 */
function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    hideBubble();

    if (settings.idleEnabled && settings.enabled) {
        idleTimer = setTimeout(() => {
            showRandomWhisper();
        }, IDLE_TIMEOUT_MS);
    }
}

function showRandomWhisper() {
    const bubble = document.getElementById('st-rel-bubble');
    if (!bubble) return;
    
    const text = idleWhispers[Math.floor(Math.random() * idleWhispers.length)];
    bubble.textContent = text;
    bubble.classList.add('bubble-show');
    
    // จางหายไปหลัง 5 วิ
    setTimeout(hideBubble, 5000);
}

function hideBubble() {
    const bubble = document.getElementById('st-rel-bubble');
    if (bubble) bubble.classList.remove('bubble-show');
}

/**
 * สร้าง DOM ของ Widget เข้าสู่หน้าจอ
 */
function injectWidgetToDOM() {
    if (document.getElementById('st-rel-widget-container')) return;

    const container = document.createElement('div');
    container.id = 'st-rel-widget-container';
    
    // ซ่อนถ้าไม่ได้เปิดใช้งาน
    container.style.display = settings.enabled ? 'block' : 'none';

    container.innerHTML = `
        <div id="st-rel-widget" class="st-rel-glass state-normal">
            <img id="st-rel-avatar" src="" alt="Avatar"/>
            <div id="st-rel-score-popup"></div>
            <div id="st-rel-bubble"></div>
        </div>
    `;
    document.body.appendChild(container);

    // ทำให้ลากได้ (Draggable)
    dragElement(document.getElementById("st-rel-widget"));
}

/**
 * ฟังก์ชันทำให้ Widget ลากย้ายตำแหน่งได้
 */
function dragElement(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    elmnt.onmousedown = dragMouseDown;

    // Load saved position
    if (settings.position.x && settings.position.y) {
        elmnt.style.top = settings.position.y + "px";
        elmnt.style.left = settings.position.x + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        // Save position
        settings.position = { x: elmnt.offsetLeft, y: elmnt.offsetTop };
        saveSettings();
    }
}

/**
 * Main Setup เมื่อแอปพร้อม
 */
jQuery(async () => {
    const context = SillyTavern.getContext();
    const eventSource = context.eventSource;
    const event_types = context.event_types;

    loadSettings();

    // 1. Render Settings UI
    const settingsHtml = await context.renderExtensionTemplateAsync(
        'third-party/st-relationship-widget', 
        'settings'
    );
    $('#extensions_settings').append(settingsHtml);

    // Binding Settings Toggles
    $('#st-rel-enable').prop('checked', settings.enabled).on('change', function() {
        settings.enabled = $(this).is(':checked');
        document.getElementById('st-rel-widget-container').style.display = settings.enabled ? 'block' : 'none';
        saveSettings();
        resetIdleTimer();
    });
    $('#st-rel-idle').prop('checked', settings.idleEnabled).on('change', function() {
        settings.idleEnabled = $(this).is(':checked');
        saveSettings();
        resetIdleTimer();
    });
    $('#st-rel-log').prop('checked', settings.logEnabled).on('change', function() {
        settings.logEnabled = $(this).is(':checked');
        saveSettings();
    });

    // 2. Inject Widget & Update Avatar
    injectWidgetToDOM();
    
    eventSource.on(event_types.APP_READY, () => {
        updateAvatar();
        resetIdleTimer();
    });
    
    eventSource.on(event_types.CHAT_CHANGED, () => {
        updateAvatar();
        updateWidgetState('normal', 0); // Reset state on new chat
        resetIdleTimer();
    });

    // 3. Parser: ดักจับข้อความใหม่หา HTML Comment
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
        if (!settings.enabled) return;
        resetIdleTimer(); // รีเซ็ตเวลา Idle เมื่อมีการคุย

        const chat = context.chat;
        const message = chat.find(m => m._id === msgId || m.id === msgId) || chat[chat.length - 1];
        if (!message || message.is_user) return; // ทำเฉพาะบอท

        // Regex หาแบบ: <!-- [STATUS: angry] [SCORE: -10] --!> 
        // เผื่อ AI พิมพ์เพี้ยนนิดหน่อยเว้นวรรคไม่ตรง
        const regex = /<!--\s*\[?STATUS:\s*([a-zA-Z]+)\]?\s*\[?SCORE:\s*([\+\-]?\d+)\]?\s*--!?>/i;
        const match = message.mes.match(regex);

        if (match) {
            const status = match[1].toLowerCase();
            const score = parseInt(match[2], 10);
            console.log(`[ST-REL] Parsed Status: ${status}, Score: ${score}`);
            updateWidgetState(status, score);
        }
    });

    // รีเซ็ต Idle timer ตอนเราพิมพ์
    eventSource.on(event_types.MESSAGE_SENT, () => resetIdleTimer());
});
