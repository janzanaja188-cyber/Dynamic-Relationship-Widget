// path: public/scripts/extensions/third-party/st-relationship-widget/index.js

const MODULE_NAME = 'st_relationship_widget_v3';

// 1. ค่าเริ่มต้นและการจัดเก็บข้อมูล
const defaultSettings = {
    enabled: true,
    minimalMode: false,
    position: { x: null, y: null },
    charData: {} // รูปแบบ: { "charId": { score: 0, level: 1, history: [], lastInteraction: timestamp } }
};

let settings = {};
let idleTimer = null;
const IDLE_TIMEOUT_MS = 45000; // 45 วินาที
const THAI_WHISPERS = [
    "เงียบจังเลย...", "มองอะไรอยู่คะ?", "แอบมองอยู่นะ...", "รอฟังอยู่นะ...", "คิดอะไรอยู่หรือเปล่า?"
];

// โครงสร้างเลเวลเกม (1, 2, 3)
const LEVEL_THRESHOLDS = [
    { level: 1, name: "คนแปลกหน้า", min: -100, max: 20 },
    { level: 2, name: "คนรู้จัก", min: 21, max: 50 },
    { level: 3, name: "เพื่อนสนิท", min: 51, max: 80 },
    { level: 4, name: "คนพิเศษ", min: 81, max: 100 }
];

function loadSettings() {
    const context = SillyTavern.getContext();
    settings = Object.assign({}, defaultSettings, context.extensionSettings[MODULE_NAME]);
    if (!settings.charData) settings.charData = {};
    context.extensionSettings[MODULE_NAME] = settings;
}

function saveSettings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

function getCharData(charId) {
    if (!settings.charData[charId]) {
        settings.charData[charId] = { score: 0, level: 1, history: [], lastInteraction: Date.now(), hiddenState: null };
    }
    return settings.charData[charId];
}

// 5. ระบบเสื่อมถอยความสัมพันธ์ (Decay System)
function processDecay(charId) {
    const data = getCharData(charId);
    const now = Date.now();
    const daysPassed = (now - data.lastInteraction) / (1000 * 60 * 60 * 24);
    
    if (daysPassed > 3 && data.score > 0) {
        const decayAmount = Math.floor(daysPassed) * 2; // ลดวันละ 2 แต้ม
        data.score = Math.max(0, data.score - decayAmount);
        toastr.info(`ไม่ได้คุยกันนาน ความสัมพันธ์ลดลง ${decayAmount} แต้ม`, 'Relationship Decay');
    }
    data.lastInteraction = now;
    saveSettings();
}

// 4 & 14. ระบบแทรกคำสั่ง (Lorebook Style Injection + Jealousy)
window.relationshipWidgetInterceptor = function(chat, contextSize, abort, type) {
    if (!settings.enabled || (type !== 'chat' && type !== 'swipe')) return;

    const context = SillyTavern.getContext();
    const charId = context.characterId;
    if (!charId) return;

    const cData = getCharData(charId);
    let extraPrompt = "";

    // ระบบความทรงจำพิเศษ (Milestone)
    if (cData.level >= 4 && cData.score > 90) {
        extraPrompt += " [ข้อความลับ: {{char}} รู้สึกคลั่งรักและผูกพันกับผู้ใช้มากๆ] ";
        cData.hiddenState = 'obsessed';
    }

    // ระบบหึงหวง (Jealousy - Group Chat)
    if (context.groupId) {
        let maxScore = -100;
        let rivalName = "";
        // หาคนที่คะแนนเยอะสุดในกลุ่ม
        for (const [id, data] of Object.entries(settings.charData)) {
            if (id !== charId && context.characters[id] && data.score > maxScore) {
                maxScore = data.score;
                rivalName = context.characters[id].name;
            }
        }
        if (maxScore > cData.score + 30) {
            extraPrompt += ` [ข้อความลับ: {{char}} รู้สึกหึงหวงและน้อยใจที่ผู้ใช้สนิทกับ ${rivalName} มากกว่า] `;
        }
    }

    // คำสั่งหลักภาษาไทย
    const corePrompt = `\n\n[คำสั่งระบบ: ประเมินความรู้สึกของ {{char}} ที่มีต่อผู้ใช้ในขณะนี้ และแนบสถานะไว้ท้ายสุดของข้อความในรูปแบบ <!-- [STATUS: สถานะ] [SCORE: คะแนน] --> (สถานะที่อนุญาต: normal, love, angry, sad, cry) (คะแนนสะสม: -100 ถึง +100)${extraPrompt}]`;

    // แทรก (Splice) ไว้เหนือข้อความสุดท้ายของผู้ใช้ (Lorebook position)
    const lastUserIndex = chat.findLastIndex(m => m.is_user);
    if (lastUserIndex !== -1) {
        chat.splice(lastUserIndex, 0, { role: 'system', content: corePrompt, name: 'system' });
    } else {
        chat.push({ role: 'system', content: corePrompt, name: 'system' });
    }
};

// อ่านข้อมูลจากข้อความ AI
function parseRelationshipData(text, charId) {
    if (!text) return null;
    const regex = /<!--\s*\[STATUS:\s*([a-zA-Z]+)\]\s*\[SCORE:\s*([\+\-]?\d+)\]\s*-->/i;
    // Fallback เผื่อ AI ลืมใส่ HTML Comment
    const fallbackRegex = /\[STATUS:\s*([a-zA-Z]+)\]\s*\[SCORE:\s*([\+\-]?\d+)\]/i;
    
    let match = text.match(regex) || text.match(fallbackRegex);
    if (match) {
        const status = match[1].toLowerCase();
        let newScore = parseInt(match[2], 10);
        
        // อัปเดตข้อมูล
        const data = getCharData(charId);
        data.score = Math.max(-100, Math.min(100, newScore));
        data.lastInteraction = Date.now();
        
        // เช็คเลเวลอัป
        const oldLevel = data.level;
        const newLevelData = LEVEL_THRESHOLDS.find(t => data.score >= t.min && data.score <= t.max) || LEVEL_THRESHOLDS[0];
        data.level = newLevelData.level;

        // บันทึกประวัติ (History สำหรับกราฟ - เก็บ 10 ครั้งล่าสุด)
        const today = new Date().toLocaleDateString('th-TH');
        if (data.history.length === 0 || data.history[data.history.length - 1].date !== today) {
            data.history.push({ date: today, score: data.score });
            if (data.history.length > 10) data.history.shift();
        } else {
            data.history[data.history.length - 1].score = data.score;
        }

        saveSettings();
        
        // Effect ตอนเลเวลอัป
        if (data.level > oldLevel) {
            toastr.success(`ความสัมพันธ์เพิ่มขึ้นเป็นเลเวล ${data.level}!`, 'Level Up!');
            spawnParticles('love');
        }

        return { status, score: data.score };
    }
    return null;
}

// 6 & 7. Visual Effects
function spawnParticles(type) {
    const container = document.getElementById('st-rel-particles-container');
    if (!container) return;
    const emojis = type === 'love' ? ['💖', '✨', '🌸'] : type === 'sad' ? ['💧', '🌧️'] : ['💢', '🔥'];
    
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.innerText = emojis[Math.floor(Math.random() * emojis.length)];
        p.style.left = Math.random() * 100 + 'vw';
        p.style.fontSize = (Math.random() * 20 + 10) + 'px';
        p.style.animationDuration = (Math.random() * 2 + 2) + 's';
        container.appendChild(p);
        setTimeout(() => p.remove(), 4000);
    }
}

function updateScreenTint(status) {
    const tint = document.getElementById('st-rel-screen-tint');
    if (!tint) return;
    const colors = {
        angry: 'rgba(255, 59, 48, 0.15)',
        sad: 'rgba(90, 200, 250, 0.1)',
        cry: 'rgba(0, 122, 255, 0.15)',
        obsessed: 'rgba(175, 82, 222, 0.1)'
    };
    tint.style.backgroundColor = colors[status] || 'rgba(0,0,0,0)';
}

function updateWidgetUI() {
    if (!settings.enabled) return;
    const context = SillyTavern.getContext();
    const charId = context.characterId;
    const widget = document.getElementById('st-rel-widget');
    const avatarImg = document.getElementById('st-rel-avatar');
    
    if (!widget) return;
    widget.classList.toggle('minimal-mode', settings.minimalMode);

    if (charId !== undefined && context.characters[charId]) {
        avatarImg.src = `/characters/${context.characters[charId].avatar}`;
        const data = getCharData(charId);
        
        // อัปเดตสถานะที่โชว์
        const validStates = ['normal', 'love', 'angry', 'sad', 'cry', 'obsessed'];
        const displayStatus = data.hiddenState === 'obsessed' ? 'obsessed' : 'normal';
        widget.className = `st-rel-glass state-${displayStatus}`;
        updateScreenTint(displayStatus);
    }
}

// 3. Thai Whispers Bubble
function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    const bubble = document.getElementById('st-rel-bubble');
    if (bubble) bubble.classList.remove('bubble-show');
    
    if (settings.enabled) {
        idleTimer = setTimeout(() => {
            if (!bubble) return;
            bubble.textContent = THAI_WHISPERS[Math.floor(Math.random() * THAI_WHISPERS.length)];
            bubble.classList.add('bubble-show');
            setTimeout(() => bubble.classList.remove('bubble-show'), 6000);
        }, IDLE_TIMEOUT_MS);
    }
}

// --- การฉีด UI เข้าเว็บ (Injection) ---
function injectCoreUI() {
    if (document.getElementById('st-rel-widget')) return;

    // FX Containers
    const tint = document.createElement('div'); tint.id = 'st-rel-screen-tint';
    const parts = document.createElement('div'); parts.id = 'st-rel-particles-container';
    document.body.appendChild(tint); document.body.appendChild(parts);

    // Widget
    const widget = document.createElement('div');
    widget.id = 'st-rel-widget';
    widget.style.display = settings.enabled ? 'block' : 'none';
    widget.innerHTML = `
        <div class="st-rel-glass state-normal">
            <img id="st-rel-avatar" src="" alt=""/>
            <div id="st-rel-bubble"></div>
        </div>
    `;
    document.body.appendChild(widget);

    // Dashboard
    const dashboard = document.createElement('div');
    dashboard.id = 'st-rel-dashboard';
    dashboard.innerHTML = `
        <div class="dash-header">
            <h3>ความสัมพันธ์</h3>
            <div class="dash-close" onclick="document.getElementById('st-rel-dashboard').classList.remove('dash-open')"><i class="fa-solid fa-xmark"></i></div>
        </div>
        <div class="dash-tabs">
            <div class="dash-tab active" data-target="tab-status">สถานะ</div>
            <div class="dash-tab" data-target="tab-graph">กราฟ</div>
            <div class="dash-tab" data-target="tab-settings">ตั้งค่า</div>
        </div>
        <div id="tab-status" class="dash-content active"></div>
        <div id="tab-graph" class="dash-content"></div>
        <div id="tab-settings" class="dash-content">
            <button class="ios-btn" id="btn-toggle-minimal">โหมดซ่อนรูป (Minimal)</button>
            <button class="ios-btn" id="btn-export-data">Export เซฟข้อมูล</button>
            <button class="ios-btn danger" id="btn-reset-pos">ดึงตัวลอยกลับหน้าจอ</button>
        </div>
    `;
    document.body.appendChild(dashboard);

    setupDraggable(widget);
    setupDashboardEvents();
}

function setupDashboardEvents() {
    // Tabs
    $('.dash-tab').on('click', function() {
        $('.dash-tab').removeClass('active');
        $(this).addClass('active');
        $('.dash-content').removeClass('active');
        $('#' + $(this).data('target')).addClass('active');
        if($(this).data('target') === 'tab-graph') renderGraph();
    });

    $('#btn-toggle-minimal').on('click', () => {
        settings.minimalMode = !settings.minimalMode;
        saveSettings(); updateWidgetUI();
        toastr.success(settings.minimalMode ? 'เปิดโหมด Minimal' : 'ปิดโหมด Minimal');
    });

    $('#btn-export-data').on('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings.charData));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "st_relationship_backup.json");
        dlAnchorElem.click();
    });

    $('#btn-reset-pos').on('click', () => {
        if(window.stRelResetPosition) window.stRelResetPosition();
    });
}

function renderDashboardData() {
    const context = SillyTavern.getContext();
    const charId = context.characterId;
    if (!charId) return;

    const data = getCharData(charId);
    const lvlInfo = LEVEL_THRESHOLDS.find(t => t.level === data.level) || LEVEL_THRESHOLDS[0];
    const progressPct = ((data.score - lvlInfo.min) / (lvlInfo.max - lvlInfo.min)) * 100;

    let html = `
        <div class="status-card">
            <img src="/characters/${context.characters[charId].avatar}">
            <div class="status-info">
                <h4>${context.characters[charId].name}</h4>
                <div class="level-badge ${data.level === 4 ? 'max-level' : ''}">Level ${data.level}: ${lvlInfo.name}</div>
                <div class="progress-bg"><div class="progress-fill" style="width: ${Math.max(0, Math.min(100, progressPct))}%;"></div></div>
                <div class="progress-text"><span>แต้ม: ${data.score}</span> <span>MAX: ${lvlInfo.max}</span></div>
            </div>
        </div>
    `;
    
    // Group support (โชว์คนอื่นในกลุ่มด้วยถ้ามี)
    if (context.groupId && context.groups[context.groupId]) {
        html += `<h5 style="margin: 15px 0 5px 0; opacity: 0.7;">สมาชิกในปาร์ตี้</h5>`;
        context.groups[context.groupId].members.forEach(memberId => {
            if (memberId !== charId && context.characters[memberId]) {
                const mData = getCharData(memberId);
                html += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px; background:rgba(255,255,255,0.05); margin-bottom:2px; border-radius:6px;">
                    <span>${context.characters[memberId].name}</span> <span>Lv.${mData.level} (แต้ม: ${mData.score})</span>
                </div>`;
            }
        });
    }
    $('#tab-status').html(html);
}

function renderGraph() {
    const context = SillyTavern.getContext();
    if (!context.characterId) return;
    const data = getCharData(context.characterId);
    const container = $('#tab-graph');
    
    if (data.history.length === 0) {
        container.html('<div class="graph-empty">ยังไม่มีประวัติการพูดคุย</div>');
        return;
    }

    let html = '<div class="graph-container">';
    data.history.forEach(item => {
        // คำนวณความสูง (สเกล -100 ถึง 100 เป็น 0-100%)
        const heightPct = Math.max(5, ((item.score + 100) / 200) * 100);
        const color = item.score > 50 ? '#34c759' : item.score < 0 ? '#ff3b30' : '#007aff';
        html += `
            <div class="graph-bar-wrap" title="${item.date}: ${item.score} แต้ม">
                <div class="graph-bar" style="height: ${heightPct}%; background: ${color};"></div>
                <div class="graph-label">${item.date.split('/')[0]}</div>
            </div>
        `;
    });
    html += '</div><div style="text-align:center; font-size:11px; opacity:0.6;">ประวัติความสัมพันธ์ย้อนหลัง</div>';
    container.html(html);
}

// Drag & Click Logic (แยกกันเด็ดขาด)
function setupDraggable(elmnt) {
    let isDragging = false;
    let startX, startY, initialX, initialY, dragThreshold = false;

    function applyPosition(x, y) {
        const w = elmnt.offsetWidth || 75; const h = elmnt.offsetHeight || 75;
        const maxX = window.innerWidth - w; const maxY = window.innerHeight - h;
        let safeX = Math.max(0, Math.min(x, maxX)); let safeY = Math.max(0, Math.min(y, maxY));
        elmnt.style.left = safeX + "px"; elmnt.style.top = safeY + "px";
        return { x: safeX, y: safeY };
    }

    if (settings.position && settings.position.x !== null) applyPosition(settings.position.x, settings.position.y);
    else applyPosition(window.innerWidth - 100, window.innerHeight - 150);

    window.stRelResetPosition = function() {
        settings.position = applyPosition(window.innerWidth - 100, window.innerHeight - 150);
        saveSettings();
    };

    elmnt.addEventListener('mousedown', dragStart);
    elmnt.addEventListener('touchstart', dragStart, { passive: false });

    function dragStart(e) {
        if (e.target.id === 'st-rel-bubble') return;
        isDragging = true; dragThreshold = false;
        startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        initialX = elmnt.offsetLeft; initialY = elmnt.offsetTop;

        document.addEventListener('mousemove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function dragMove(e) {
        if (!isDragging) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        // ถ้าขยับเกิน 5px ถือว่าตั้งใจ Drag ไม่ใช่ Click
        if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
            dragThreshold = true;
            if(e.cancelable) e.preventDefault();
            applyPosition(initialX + (clientX - startX), initialY + (clientY - startY));
        }
    }

    function dragEnd() {
        isDragging = false;
        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchmove', dragMove);
        document.removeEventListener('touchend', dragEnd);

        if (!dragThreshold) {
            // ถือเป็นการ Click ธรรมดา -> เปิด Dashboard
            renderDashboardData();
            document.getElementById('st-rel-dashboard').classList.add('dash-open');
        } else {
            // บันทึกตำแหน่ง
            settings.position = { x: elmnt.offsetLeft, y: elmnt.offsetTop };
            saveSettings();
        }
    }
}

jQuery(async () => {
    try {
        const context = SillyTavern.getContext();
        const eventSource = context.eventSource;
        const event_types = context.event_types;

        loadSettings();
        injectCoreUI();
        
        console.log("[ST-REL V3] Grand Edition Initialized!");

        eventSource.on(event_types.APP_READY, () => { 
            updateWidgetUI(); 
            resetIdleTimer(); 
            if(context.characterId) processDecay(context.characterId);
        });

        eventSource.on(event_types.CHAT_CHANGED, () => { 
            updateWidgetUI(); 
            resetIdleTimer(); 
            if(context.characterId) processDecay(context.characterId);
            document.getElementById('st-rel-dashboard').classList.remove('dash-open');
        });
        
        // ดักจับข้อความตอน AI พิมพ์เสร็จและ Render แล้ว
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (msgId) => {
            if (!settings.enabled || !context.characterId) return;
            resetIdleTimer();
            
            const chat = context.chat;
            const message = chat.find(m => m._id === msgId || m.id === msgId) || chat[chat.length - 1];
            if (!message || message.is_user) return;

            const parsed = parseRelationshipData(message.mes, context.characterId);
            if (parsed) {
                const widget = document.getElementById('st-rel-widget');
                widget.className = `st-rel-glass state-${parsed.status}`;
                updateScreenTint(parsed.status);
                
                // เอฟเฟกต์ตามอารมณ์
                if(parsed.status === 'love') spawnParticles('love');
                if(parsed.status === 'angry') spawnParticles('angry');
                if(parsed.status === 'cry' || parsed.status === 'sad') spawnParticles('sad');
                
                if (document.getElementById('st-rel-dashboard').classList.contains('dash-open')) {
                    renderDashboardData(); // อัปเดตหน้าต่างถ้าเปิดอยู่
                }
            }
        });

        eventSource.on(event_types.MESSAGE_SENT, () => {
            resetIdleTimer();
            updateScreenTint('normal'); // รีเซ็ตสีจอกลับตอนเราพิมพ์ตอบ
        });

        window.addEventListener('resize', () => {
            if (settings.enabled && window.stRelResetPosition) window.stRelResetPosition();
        });

    } catch (error) {
        console.error("[ST-REL V3] Error:", error);
    }
});
