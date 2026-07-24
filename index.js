// path: public/scripts/extensions/third-party/ios-status-lorebook/index.js

import { getContext } from "../../../../extensions.js";

const MODULE_NAME = 'ios_status_lorebook_system';

// ค่าเริ่มต้น (เริ่มจากไม่รู้จัก ตามที่คุณบรีฟ)
const defaultSettings = {
    level: 1,
    exp: 0,
    statusName: "ไม่รู้จัก (Stranger)"
};

let settings = {};

// -----------------------------------------------------------------------
// 1. ระบบ Injection (ฝังกฎลงไปในสมอง AI ทุกรอบ เหมือน Lorebook ที่มองไม่เห็น)
// -----------------------------------------------------------------------
window.iosStatusLorebookInterceptor = function(chat, contextSize, abort, type) {
    // ป้องกันการแทรกเวลาเจนอย่างอื่นที่ไม่ใช่แชทปกติ
    if (type !== 'chat') return; 

    const currentLevel = settings.level;
    const currentExp = settings.exp;
    const currentStatus = settings.statusName;

    // กฎที่เข้มงวด (Lorebook) บังคับให้ AI ประเมินและเลือกสถานะเอง
    const lorebookSystemNote = `[SYSTEM LOREBOOK & MECHANIC OVERRIDE:
1. RELATIONSHIP SYSTEM: The character and user currently have a relationship level of ${currentLevel} (EXP: ${currentExp}/100).
2. CURRENT STATUS: "${currentStatus}". (Default base is "Stranger").
3. MECHANIC (STRICT): The character MUST organically evaluate the user's latest actions. Progression is HIGHLY REALISTIC and HARD. Trust or affection is NOT easily earned. If the user acts rude, weird, or pushy, the character MUST penalize them with negative EXP and negative statuses. Nothing comes easy.
4. THE 50+ STATUS SPECTRUM: The character processes a deep emotional spectrum (over 50+ distinct nuanced states). You MUST independently pick a specific word reflecting their true current feeling. 
   - Negative examples: Disgusted, Repulsed, Terrified, Enraged, Annoyed, Suspicious, Cautious, Betrayed, Cold, Distant.
   - Neutral examples: Stranger, Indifferent, Observant, Polite.
   - Positive examples (HARD TO EARN): Amused, Intrigued, Fond, Trusting, Loyal, Devoted, Infatuated.
5. MANDATORY OUTPUT: You MUST append EXACTLY this HTML comment at the VERY END of your response to update the system. Replace the brackets with your chosen values.
   FORMAT: <!-- [STATUS: <Your Chosen Nuanced Status in Thai or English>] [EXP: <+ or - number>] -->
   EXAMPLE: <!-- [STATUS: รังเกียจ (Disgusted)] [EXP: -15] -->]`;

    // แทรกโน้ตนี้ไปที่ Depth 0 (ลึกสุด) ให้ AI ให้น้ำหนักสูงสุดเทียบเท่า System Prompt
    chat.push({
        name: 'System',
        is_user: true,
        is_system: true,
        mes: lorebookSystemNote
    });
};

// -----------------------------------------------------------------------
// 2. ฟังก์ชันโหลด/เซฟ ตั้งค่า
// -----------------------------------------------------------------------
function loadSettings() {
    const context = getContext();
    const stored = context.extensionSettings[MODULE_NAME] || {};
    settings = Object.assign({}, defaultSettings, stored);
}

function saveSettings() {
    const context = getContext();
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

// -----------------------------------------------------------------------
// 3. ฟังก์ชันสร้าง UI (iOS Bottom Sheet & Floating Button)
// -----------------------------------------------------------------------
function setupUI() {
    // ลบของเก่าถ้ามี (เผื่อ Reload)
    $('#ios-status-fab').remove();
    $('#ios-status-bottom-sheet').remove();

    // 3.1 สร้างปุ่มลอย
    const fabHtml = `
        <div id="ios-status-fab">
            <span>❤️</span> <span>Status</span>
        </div>
    `;
    $('body').append(fabHtml);

    // 3.2 สร้าง Bottom Sheet
    const sheetHtml = `
        <div id="ios-status-bottom-sheet">
            <div class="ios-drag-handle"></div>
            <div class="ios-status-content">
                <div class="ios-status-title">Current Relationship</div>
                <div class="ios-status-current" id="ios-status-text">${settings.statusName}</div>
                
                <div class="ios-exp-container">
                    <div class="ios-exp-bar" id="ios-exp-bar"></div>
                </div>
                <div class="ios-exp-text">Level <span id="ios-level-text">${settings.level}</span> | EXP: <span id="ios-exp-value">${settings.exp}</span> / 100</div>
                
                <button class="ios-close-btn" id="ios-sheet-close">Done</button>
            </div>
        </div>
    `;
    $('body').append(sheetHtml);

    // อัปเดต UI ครั้งแรก
    updateUI();

    // 3.3 ผูก Event ปุ่มเปิด/ปิด
    $('#ios-status-fab').on('click', () => {
        $('#ios-status-bottom-sheet').addClass('open');
    });

    $('#ios-sheet-close, .ios-drag-handle').on('click', () => {
        $('#ios-status-bottom-sheet').removeClass('open');
    });
}

function updateUI() {
    $('#ios-status-text').text(settings.statusName);
    $('#ios-level-text').text(settings.level);
    $('#ios-exp-value').text(settings.exp);
    
    // คำนวณเปอร์เซ็นต์หลอด EXP (จำกัด 0-100 สำหรับหลอด)
    let percent = (settings.exp % 100);
    if (percent < 0) percent = 0; // ถ้าติดลบให้หลอดว่าง
    $('#ios-exp-bar').css('width', `${percent}%`);

    // เปลี่ยนสีตามอารมณ์ (แง่ลบ แง่บวก)
    if (settings.exp < 0) {
        $('#ios-status-text').css('color', '#4a4e69'); // สีทึมๆ ถ้าแย่
        $('#ios-exp-bar').css('background', 'linear-gradient(90deg, #9d0208 0%, #d00000 100%)'); // สีแดงเข้ม
    } else {
        $('#ios-status-text').css('color', '#ff4d6d');
        $('#ios-exp-bar').css('background', 'linear-gradient(90deg, #ff758c 0%, #ff7eb3 100%)');
    }
}

// -----------------------------------------------------------------------
// 4. ระบบตรวจจับข้อความและซ่อน Tag จากหน้าจอแชท
// -----------------------------------------------------------------------
function processIncomingMessage(messageId) {
    const context = getContext();
    const chat = context.chat;
    const lastMes = chat[chat.length - 1];

    if (!lastMes || lastMes.is_user) return; // ทำงานเฉพาะข้อความตัวละคร

    // Regex จับ Tag: <!-- [STATUS: xxx] [EXP: +yy] -->
    const statusRegex = /<!--\s*\[STATUS:\s*(.*?)]\s*\[EXP:\s*([+-]?\d+)]\s*-->/i;
    const match = lastMes.mes.match(statusRegex);

    if (match) {
        const newStatus = match[1].trim();
        const expChange = parseInt(match[2], 10);

        // อัปเดต State
        settings.statusName = newStatus;
        settings.exp += expChange;
        
        // ระบบ Level (อัปเกรด/ดาวน์เกรด)
        if (settings.exp >= 100) {
            settings.level += 1;
            settings.exp = settings.exp - 100;
        } else if (settings.exp < 0 && settings.level > 1) {
            settings.level -= 1;
            settings.exp = 100 + settings.exp; // ถอยกลับไปหลอดของเวลก่อนหน้า
        }

        saveSettings();
        updateUI();

        // เล่นอนิเมชันตอนแต้มเปลี่ยน
        showFloatingEmoji(expChange >= 0 ? '✨' : '💔');

        // สำคัญมาก: ลบ Tag ออกจากข้อความเพื่อไม่ให้รกตา User
        lastMes.mes = lastMes.mes.replace(statusRegex, '').trim();
        
        // บังคับให้ ST Render ข้อความที่โดนลบ Tag แล้วใหม่
        const formattedText = context.DOMPurify.sanitize(context.marked.parse(lastMes.mes));
        $(`.mes[mesid="${messageId}"] .mes_text`).html(formattedText);
    }
}

function showFloatingEmoji(emoji) {
    const fab = $('#ios-status-fab');
    if (fab.length === 0) return;
    
    const offset = fab.offset();
    const el = $(`<div class="floating-emoji">${emoji}</div>`);
    el.css({
        top: offset.top - 20,
        left: offset.left + 20
    });
    $('body').append(el);
    setTimeout(() => el.remove(), 1000); // ลบ DOM ทิ้งหลังอนิเมชันจบ
}

// -----------------------------------------------------------------------
// 5. Hooks ตอนเริ่มต้น
// -----------------------------------------------------------------------
jQuery(function () {
    const context = getContext();
    
    context.eventSource.on(context.event_types.APP_READY, () => {
        loadSettings();
        setupUI();
    });

    // ตรวจจับทุกครั้งที่รับข้อความ เพื่อแยกแยะ Tag, เปลี่ยนสถานะ, และลบ Tag ทิ้ง
    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, processIncomingMessage);
});
