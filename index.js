// path: public/scripts/extensions/third-party/st-relationship-widget/index.js

const MODULE_NAME = 'st_relationship_widget';

const defaultSettings = {
    enabled: true,
    idleEnabled: true,
    position: { x: null, y: null }
};

let settings = {};
let idleTimer = null;
const IDLE_TIMEOUT_MS = 60000; // ปรับให้แสดงทุก 1 นาทีจะได้เห็นบ่อยขึ้น

const idleWhispers = [
    "...", "Are you still there?", "Just looking at you...", "Thinking...", "*waits patiently*"
];

function loadSettings() {
    const context = SillyTavern.getContext();
    settings = Object.assign({}, defaultSettings, context.extensionSettings[MODULE_NAME]);
    context.extensionSettings[MODULE_NAME] = settings;
}

function saveSettings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

// 1. The Prompt Fix (บังคับเด็ดขาดด้วย System Message)
window.relationshipWidgetInterceptor = function(chat, contextSize, abort, type) {
    if (!settings.enabled) return;
    if (type !== 'chat' && type !== 'swipe') return;

    const prompt = `\n\n[CRITICAL SYSTEM INSTRUCTION: You MUST evaluate the current relationship and append a status block at the VERY END of your response. Format EXACTLY like this: <!-- [STATUS: state] [SCORE: number] -->\nValid states: normal, love, angry, sad, cry.\nNumber must be between -100 and +100.\nExample: <!-- [STATUS: love] [SCORE: +5] -->\nDO NOT ignore this instruction.]`;
    
    // ยัดเป็น System Message เดี่ยวๆ ก้อนสุดท้าย เพื่อให้น้ำหนักสูงสุด
    chat.push({ role: 'system', content: prompt, name: 'system' });
};

// Robust Parser (อ่านได้แม้ AI พิมพ์มาชุ่ยๆ)
function parseRelationshipData(text) {
    if (!text) return null;
    const regex = /\[STATUS:\s*([a-zA-Z]+)\]\s*\[SCORE:\s*([\+\-]?\d+)\]/i;
    const match = text.match(regex);

    if (match) {
        return {
            status: match[1].toLowerCase(),
            score: parseInt(match[2], 10)
        };
    }
    return null;
}

function updateAvatar() {
    const context = SillyTavern.getContext();
    const charId = context.characterId;
    const avatarImg = document.getElementById('st-rel-avatar');
    
    if (avatarImg && charId !== undefined && context.characters[charId]) {
        avatarImg.src = `/characters/${context.characters[charId].avatar}`;
    }
}

function updateWidgetState(status, score) {
    if (!settings.enabled) return;
    const widget = document.getElementById('st-rel-widget');
    const scorePopup = document.getElementById('st-rel-score-popup');
    if (!widget || !scorePopup) return;

    widget.className = 'st-rel-glass';
    const validStates = ['normal', 'love', 'angry', 'sad', 'cry'];
    const safeStatus = validStates.includes(status) ? status : 'normal';
    widget.classList.add(`state-${safeStatus}`);

    if (score !== 0 && !isNaN(score)) {
        scorePopup.classList.remove('score-animate', 'score-positive', 'score-negative');
        void scorePopup.offsetWidth; // Force Reflow
        scorePopup.textContent = score > 0 ? `+${score}` : `${score}`;
        scorePopup.classList.add('score-animate');
        scorePopup.classList.add(score > 0 ? 'score-positive' : 'score-negative');
    }
}

// 3. The Bubble Fix (ยัดข้อความก่อนแสดงผล)
function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    hideBubble();
    if (settings.idleEnabled && settings.enabled) {
        idleTimer = setTimeout(showRandomWhisper, IDLE_TIMEOUT_MS);
    }
}

function showRandomWhisper() {
    const bubble = document.getElementById('st-rel-bubble');
    if (!bubble) return;
    bubble.textContent = idleWhispers[Math.floor(Math.random() * idleWhispers.length)];
    void bubble.offsetWidth; // Force reflow บังคับให้เบราว์เซอร์คำนวณขนาดก่อนโชว์
    bubble.classList.add('bubble-show');
    setTimeout(hideBubble, 5000);
}

function hideBubble() {
    const bubble = document.getElementById('st-rel-bubble');
    if (bubble) bubble.classList.remove('bubble-show');
}

function injectWidgetToDOM() {
    if (document.getElementById('st-rel-widget-container')) return;

    const container = document.createElement('div');
    container.id = 'st-rel-widget-container';
    container.style.display = settings.enabled ? 'block' : 'none';

    container.innerHTML = `
        <div id="st-rel-widget" class="st-rel-glass state-normal">
            <img id="st-rel-avatar" src="" alt=""/>
            <div id="st-rel-score-popup"></div>
            <div id="st-rel-bubble"></div>
        </div>
    `;
    document.body.appendChild(container);
    setupDraggable(document.getElementById("st-rel-widget"));
}

// 2. The Drag Fix (สมูทขึ้น รองรับมือถือแบบ 100%)
function setupDraggable(elmnt) {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    function applyPosition(x, y) {
        const w = elmnt.offsetWidth || 80;
        const h = elmnt.offsetHeight || 80;
        const maxX = window.innerWidth - w;
        const maxY = window.innerHeight - h;
        
        let safeX = Math.max(0, Math.min(x, maxX));
        let safeY = Math.max(0, Math.min(y, maxY));

        elmnt.style.left = safeX + "px";
        elmnt.style.top = safeY + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";

        return { x: safeX, y: safeY };
    }

    if (settings.position && settings.position.x !== null) {
        applyPosition(settings.position.x, settings.position.y);
    } else {
        applyPosition(window.innerWidth - 100, window.innerHeight - 150);
    }

    window.stRelResetPosition = function() {
        settings.position = applyPosition(window.innerWidth - 100, window.innerHeight - 150);
        saveSettings();
    };

    elmnt.addEventListener('mousedown', dragStart);
    elmnt.addEventListener('touchstart', dragStart, { passive: false });

    function dragStart(e) {
        if (e.target.id === 'st-rel-bubble' || e.target.id === 'st-rel-score-popup') return;
        
        isDragging = true;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        initialX = elmnt.offsetLeft;
        initialY = elmnt.offsetTop;

        document.addEventListener('mousemove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
        
        elmnt.style.transition = 'none'; // ปิดอนิเมชั่นตอนกำลังลาก
    }

    function dragMove(e) {
        if (!isDragging) return;
        if(e.cancelable) e.preventDefault(); // กันจอมือถือเลื่อนตามตอนลาก

        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        applyPosition(initialX + dx, initialY + dy);
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', dragMove);
        document.removeEventListener('touchend', dragEnd);

        elmnt.style.transition = 'transform 0.2s, border-color 0.5s, box-shadow 0.5s'; // เปิดอนิเมชั่นกลับ
        settings.position = { x: elmnt.offsetLeft, y: elmnt.offsetTop };
        saveSettings();
    }
}

function injectSettingsUI() {
    if (document.getElementById('st-rel-settings-drawer')) return;

    const html = `
        <div class="inline-drawer" id="st-rel-settings-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-heart"></i> Relationship Widget (Hardened)</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="display: none;">
                <div class="st-rel-settings-container">
                    <div class="st-rel-setting-row">
                        <label class="st-rel-label">
                            <span class="title">Enable Widget</span>
                            <span class="desc">เปิด/ปิดการแสดงผลตัวลอย</span>
                        </label>
                        <label class="st-rel-ios-toggle">
                            <input type="checkbox" id="st-rel-enable" ${settings.enabled ? 'checked' : ''}>
                            <span class="st-rel-slider"></span>
                        </label>
                    </div>
                    <div class="st-rel-setting-row" style="justify-content: center; margin-top: 15px;">
                        <button id="st-rel-reset-btn" class="menu_button" style="width: 100%;">
                            <i class="fa-solid fa-crosshairs"></i> ดึงตัวลอยกลับมา (Reset Position)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    $('#extensions_settings').append(html);

    $('#st-rel-enable').on('change', function() {
        settings.enabled = $(this).is(':checked');
        document.getElementById('st-rel-widget-container').style.display = settings.enabled ? 'block' : 'none';
        if(settings.enabled && window.stRelResetPosition) window.stRelResetPosition();
        saveSettings();
        resetIdleTimer();
    });

    $('#st-rel-reset-btn').on('click', function() {
        if(window.stRelResetPosition) {
            window.stRelResetPosition();
            toastr.success('ดึงตัวลอยกลับมาที่หน้าจอแล้ว!', 'Relationship Widget');
        }
    });
}

jQuery(async () => {
    try {
        const context = SillyTavern.getContext();
        const eventSource = context.eventSource;
        const event_types = context.event_types;

        loadSettings();
        injectSettingsUI();
        injectWidgetToDOM();
        
        console.log("[ST-REL] Widget Initialized Successfully!");

        eventSource.on(event_types.APP_READY, () => { 
            updateAvatar(); 
            resetIdleTimer(); 
        });

        eventSource.on(event_types.CHAT_CHANGED, () => { 
            updateAvatar(); 
            resetIdleTimer(); 
            
            const chat = context.chat;
            if (chat && chat.length > 0) {
                const lastCharMsg = [...chat].reverse().find(m => !m.is_user);
                if (lastCharMsg && lastCharMsg.mes) {
                    const data = parseRelationshipData(lastCharMsg.mes);
                    if (data) {
                        updateWidgetState(data.status, 0);
                        return;
                    }
                }
            }
            updateWidgetState('normal', 0);
        });
        
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
            if (!settings.enabled) return;
            resetIdleTimer();
            
            const chat = context.chat;
            const message = chat.find(m => m._id === msgId || m.id === msgId) || chat[chat.length - 1];
            if (!message || message.is_user) return;

            const data = parseRelationshipData(message.mes);
            if (data) {
                updateWidgetState(data.status, data.score);
            }
        });

        eventSource.on(event_types.MESSAGE_SENT, resetIdleTimer);
        window.addEventListener('resize', () => {
            if (settings.enabled && window.stRelResetPosition) window.stRelResetPosition();
        });

    } catch (error) {
        console.error("[ST-REL] Error starting widget:", error);
    }
});
