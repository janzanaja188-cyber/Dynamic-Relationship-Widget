// path: public/scripts/extensions/third-party/status-tracker-ios/index.js

const EXTENSION_NAME = 'statusTrackerIos';
let currentCharacterId = null;

// ค่าเริ่มต้น
const defaultSettings = {
    score: 0,
    status: 'ไม่รู้จัก'
};

// ฟังก์ชันหลักที่ผูกกับ Hook: activate
window.initStatusUI = async function() {
    console.log("[Status Tracker] Initializing iOS Dashboard...");
    
    // สร้าง UI ลงใน DOM
    const uiHTML = `
        <div id="ios-status-pill">
            <span id="pill-icon">😐</span> 
            <span id="pill-text">ไม่รู้จัก</span>
        </div>
        <div id="ios-bottom-sheet">
            <div class="ios-handle"></div>
            <div class="status-content">
                <div class="status-title" id="sheet-status-text">ไม่รู้จัก</div>
                <div class="status-score" id="sheet-score-text">0 PTS</div>
                <div class="status-progress-container">
                    <div class="status-progress-bar" id="sheet-progress"></div>
                </div>
                <p style="font-size: 0.85rem; color: #666; margin-bottom: 5px;">
                    ความสัมพันธ์ขยับขึ้นลงตามการกระทำจริง
                </p>
                <button class="ios-close-btn" id="sheet-close-btn">ปิดหน้าต่าง</button>
            </div>
        </div>
    `;
    $('body').append(uiHTML);

    // Event Listeners สำหรับ UI
    $('#ios-status-pill').on('click', () => {
        $('#ios-bottom-sheet').addClass('open');
    });

    $('#sheet-close-btn, .ios-handle').on('click', () => {
        $('#ios-bottom-sheet').removeClass('open');
    });

    const context = SillyTavern.getContext();

    // โหลดข้อมูลเมื่อเปลี่ยนตัวละคร
    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        currentCharacterId = context.characterId;
        if (!currentCharacterId) return;
        
        // ดึงค่า หรือสร้างค่าใหม่ถ้าเพิ่งเคยคุย
        if (!context.extensionSettings[EXTENSION_NAME]) {
            context.extensionSettings[EXTENSION_NAME] = {};
        }
        if (!context.extensionSettings[EXTENSION_NAME][currentCharacterId]) {
            context.extensionSettings[EXTENSION_NAME][currentCharacterId] = { ...defaultSettings };
        }
        updateUIDisplay();
    });

    // ดักจับข้อความใหม่เพื่ออ่านสถานะที่ถูกซ่อนไว้ (HTML Comment ไม่แสดงในจอแชทปกติ)
    context.eventSource.on(context.event_types.MESSAGE_RECEIVED, () => {
        if (!currentCharacterId) return;
        const chat = context.chat;
        if (chat.length === 0) return;
        
        const lastMes = chat[chat.length - 1];
        if (lastMes.is_user) return;

        // Regex หาคอมเมนต์ซ่อนสถานะ
        const regex = /<!--\s*\[STATUS:\s*(.*?)]\s*\[SCORE:\s*([-+]?\d+)]\s*-->/i;
        const match = lastMes.mes.match(regex);
        
        if (match) {
            const newStatus = match[1].trim();
            const newScore = parseInt(match[2], 10);
            updateStatusState(newStatus, newScore);
        }
    });
};

// --- ฟังก์ชันอัปเดตระบบ ---
function updateStatusState(newStatus, newScore) {
    const context = SillyTavern.getContext();
    const oldScore = context.extensionSettings[EXTENSION_NAME][currentCharacterId].score;
    
    // อัปเดตข้อมูลและบันทึก
    context.extensionSettings[EXTENSION_NAME][currentCharacterId].status = newStatus;
    context.extensionSettings[EXTENSION_NAME][currentCharacterId].score = newScore;
    context.saveSettingsDebounced();

    updateUIDisplay();

    // เล่น Gimmick ปล่อยอิโมจิ
    if (newScore > oldScore) {
        spawnFloatingEmoji('✨', '💖', '🌸');
    } else if (newScore < oldScore) {
        spawnFloatingEmoji('💔', '🌧️', '🥀');
    }
}

function updateUIDisplay() {
    const context = SillyTavern.getContext();
    const data = context.extensionSettings[EXTENSION_NAME][currentCharacterId] || defaultSettings;
    
    let icon = '😐';
    let progressPercent = 50; // 0 คะแนนอยู่ตรงกลาง (50%)
    
    if (data.score > 0) {
        icon = '💖';
        progressPercent = 50 + Math.min(50, (data.score / 100) * 50); 
    } else if (data.score < 0) {
        icon = '💔';
        progressPercent = 50 - Math.min(50, (Math.abs(data.score) / 100) * 50);
    }

    // อัปเดต Pill
    $('#pill-icon').text(icon);
    $('#pill-text').text(data.status);

    // อัปเดต Bottom Sheet
    $('#sheet-status-text').text(data.status);
    $('#sheet-score-text').text(`${data.score} PTS`);
    $('#sheet-progress').css('width', `${progressPercent}%`);
}

function spawnFloatingEmoji(...emojis) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const $el = $(`<div class="floating-emoji">${randomEmoji}</div>`);
    
    // สุ่มตำแหน่งโผล่บริเวณกลางๆ จอด้านล่าง
    const randomX = Math.random() * 40 - 20; 
    $el.css({
        left: `calc(50% + ${randomX}px)`,
        bottom: '80px'
    });

    $('body').append($el);
    setTimeout(() => $el.remove(), 2000);
}

// --- Interceptor: หัวใจหลักในการสั่ง AI (ทำงานแทน Lorebook) ---
window.injectStatusLorebook = function(chat, contextSize, abort, type) {
    if (type !== 'chat') return; // ทำงานเฉพาะตอนแชทปกติ
    if (!currentCharacterId) return;

    const context = SillyTavern.getContext();
    const data = context.extensionSettings[EXTENSION_NAME][currentCharacterId] || defaultSettings;

    // คำสั่งที่ฝังเข้าไป (Prompt อัดแน่นด้วยสถานะกว่า 50 ระดับ และกฎที่เข้มงวด)
    const systemPrompt = `[System Note (Relationship Lorebook):
สถานะความสัมพันธ์ปัจจุบันของ {{char}} ที่มีต่อ {{user}} คือ: "${data.status}" (คะแนนสะสม: ${data.score})
คำสั่ง: วิเคราะห์เหตุการณ์ล่าสุดและประเมินสถานะใหม่ ความสัมพันธ์ต้องตั้งอยู่บน "ความสมจริงอย่างเข้มงวด" ไม่มีอะไรได้มาง่ายๆ
เลือก 1 สถานะที่ตรงกับใจ {{char}} มากที่สุดจากระดับเหล่านี้ (หรือใกล้เคียง):
- แง่ลบรุนแรง: เกลียดเข้าไส้, อาฆาต, ขยะแขยง, หวาดกลัวสุดขีด, รังเกียจ, แค้นเคือง, แตกหัก, ร้าวฉาน, หมดศรัทธา, เป็นศัตรู, ตัดขาด
- แง่ลบ: หมางเมิน, ผิดหวัง, หลีกเลี่ยง, หวาดระแวง, กดดัน, อึดอัด, ไม่ไว้ใจ, เย็นชา, รำคาญ, ขุ่นเคือง, เหม็นขี้หน้า, ห่างเหิน, ระวังตัว, มองข้าม
- กลาง (จุดเริ่มต้น): ไม่รู้จัก, คนแปลกหน้า, สังเกตการณ์, ลังเล, ประเมินค่า
- แง่บวก: สนใจ, เปิดใจ, เป็นมิตร, คุ้นเคย, สบายใจ, พึ่งพาได้, ไว้วางใจ, สนิทสนม, เอ็นดู, ประทับใจ, ห่วงใย, ผูกพัน, รู้ใจ, ปกป้อง
- แง่บวกขั้นสุด: หวงแหน, ทะนุถนอม, รักใคร่, หวานชื่น, เสน่หา, ลึกซึ้ง, หลงใหล, คลั่งไคล้, ขาดไม่ได้, เทิดทูน, ภักดี, มอบกายถวายชีวิต

**บังคับ**: คุณต้องเขียนแท็กโค้ดนี้ซ่อนไว้ที่ ท้ายสุด ของข้อความเสมอ ห้ามลืมเด็ดขาด!
รูปแบบ: <!-- [STATUS: คำสถานะที่เลือก] [SCORE: คะแนนรวมใหม่] -->]`;

    // แทรกคำสั่งเข้าไปก่อนข้อความล่าสุดของ User เพื่อให้ AI ให้น้ำหนักสูงสุด (เสมือนยัด Lorebook ณ วินาทีสุดท้าย)
    let insertIndex = chat.length - 1;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user) {
            insertIndex = i;
            break;
        }
    }

    chat.splice(insertIndex, 0, {
        name: 'System',
        is_system: true,
        is_user: false,
        mes: systemPrompt
    });
};
