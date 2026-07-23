// path: public/scripts/extensions/third-party/st-relationship-widget/index.js

const MODULE_NAME = 'st_relationship_widget';

const defaultSettings = {
    enabled: true,
    idleEnabled: true,
    position: { x: null, y: null }
};

let settings = {};
let idleTimer = null;
const IDLE_TIMEOUT_MS = 180000; // 3 นาที

const idleWhispers = [
    "...", "Are you still there?", "Just looking at you...", "Thinking...", "*waits patiently*"
];

// โหลดและเซฟตั้งค่า
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

// Prompt Interceptor บังคับแทรกคำสั่งให้ AI ส่งสถานะ
window.relationshipWidgetInterceptor = function(chat, contextSize, abort, type) {
    if (!settings.enabled) return;
    if (type !== 'chat' && type !== 'swipe') return;

    const instruction = `\n\n[SYSTEM INSTRUCTION: At the very end of your response, you MUST append a hidden HTML comment containing the relationship status and score change. Format EXACTLY like this: <!-- [STATUS: normal] [SCORE: +10] -->. Allowed states: normal, love, angry, sad, cry. Score: A number between -100 and +100.]`;

    let userMsgFound = false;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].role === 'user') {
            chat[i].content += instruction;
            userMsgFound = true;
            break;
        }
    }

    if (!userMsgFound) {
        chat.push({ role: 'system', content: instruction });
    }
};

// ฟังก์ชันแกะรอยหา Status และ Score (รองรับทุกรูปแบบ HTML Comment)
function parseRelationshipData(text) {
    if (!text) return null;
    // Regex แบบยืดหยุ่นสูง รองรับทุกการเว้นวรรคและเครื่องหมาย
    const regex = /<!--[\s\S]*?\[?STATUS:\s*([a-zA-Z]+)\]?[\s\S]*?\[?SCORE:\s*([\+\-]?\d+)\]?[\s\S]*?-->/i;
    const match = text.match(regex);

    if (match) {
        return {
            status: match[1].toLowerCase(),
            score: parseInt(match[2], 10)
        };
    }
    return null;
}

// อัปเดตรูปอวาตาร์
function updateAvatar() {
    const context = SillyTavern.getContext();
    const charId = context.characterId;
    const avatarImg = document.getElementById('st-rel-avatar');
    
    if (avatarImg && charId !== undefined && context.characters[charId]) {
        avatarImg.src = `/characters/${context.characters[charId].avatar}`;
    }
}

// อัปเดตสถานะ Widget และ Score Popup
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

// ระบบ Idle Whispers (กระซิบยามว่าง)
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
    bubble.classList.add('bubble-show');
    setTimeout(hideBubble, 5000);
}

function hideBubble() {
    const bubble = document.getElementById('st-rel-bubble');
    if (bubble) bubble.classList.remove('bubble-show');
}

// สร้าง Widget ใส่ DOM พร้อมระบบลาก (Mouse + Touch) และป้องกันตกขอบ
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
    dragElement(document.getElementById("st-rel-widget"));
}

function dragElement(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    function applySafePosition(targetX, targetY) {
        const rect = elmnt.getBoundingClientRect();
        const w = rect.width || (window.innerWidth <= 768 ? 60 : 80);
        const h = rect.height || (window.innerWidth <= 768 ? 60 : 80);

        const maxX = Math.max(0, document.documentElement.clientWidth - w);
        const maxY = Math.max(0, document.documentElement.clientHeight - h);

        let safeX = targetX !== null ? targetX : maxX - 20;
        let safeY = targetY !== null ? targetY : maxY - 100;

        safeX = Math.max(0, Math.min(maxX, safeX));
        safeY = Math.max(0, Math.min(maxY, safeY));

        elmnt.style.left = safeX + "px";
        elmnt.style.top = safeY + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";

        return { x: safeX, y: safeY };
    }

    settings.position = applySafePosition(settings.position.x, settings.position.y);

    window.stRelResetPosition = function() {
        settings.position = applySafePosition(null, null);
        saveSettings();
    };

    elmnt.onmousedown = dragStart;
    elmnt.ontouchstart = dragStart;

    function dragStart(e) {
        const isTouch = e.type.includes('touch');
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        pos3 = clientX;
        pos4 = clientY;

        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
        document.addEventListener('touchmove', dragMove, { passive: false });
    }

    function dragMove(e) {
        if(e.cancelable) e.preventDefault();
        const isTouch = e.type.includes('touch');
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;

        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;

        applySafePosition(elmnt.offsetLeft - pos1, elmnt.offsetTop - pos2);
    }

    function dragEnd() {
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchend', dragEnd);
        document.removeEventListener('touchmove', dragMove);

        settings.position = { x: elmnt.offsetLeft, y: elmnt.offsetTop };
        saveSettings();
    }
}

// สร้าง Settings UI และปุ่ม Reset ตำแหน่ง
function injectSettingsUI() {
    if (document.getElementById('st-rel-settings-drawer')) return;

    const html = `
        <div class="inline-drawer" id="st-rel-settings-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-heart"></i> Relationship Widget</b>
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

// Main Setup Lifecycle
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
