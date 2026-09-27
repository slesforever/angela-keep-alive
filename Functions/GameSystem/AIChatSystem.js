import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 歷史對話 JSON 檔案存儲路徑
const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'ai_history.json');

// ==========================================
// 1. 模型與備援設定
// ==========================================
// 優先使用 2.5-flash，若遇 404 或 503 依序自動降級切換
const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash'
];

// 記憶體中的對話歷史與防鎖定機制
const chatHistory = new Map(); // Key: `${guildId}_${userId}`, Value: Array
const cooldowns = new Map();   // 冷卻冷卻時間紀錄
const activeLocks = new Set();  // 正在處理請求的使用者鎖
let backupTimer = null;

// ==========================================
// 2. 磁碟檔案持久化寫入 (JSON Storage)
// ==========================================

function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * 啟動時從硬碟載入 JSON 歷史紀錄
 */
export function loadHistDisk() {
    try {
        ensureDir();
        if (fs.existsSync(HISTORY_FILE)) {
            const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
            const data = JSON.parse(raw);
            chatHistory.clear();
            for (const [key, val] of Object.entries(data)) {
                if (Array.isArray(val)) {
                    chatHistory.set(key, val);
                }
            }
            console.log(`[AIChat] 成功載入 ${chatHistory.size} 筆 AI 歷史對話記憶。`);
        }
    } catch (err) {
        console.error('[AIChat] 讀取歷史記憶檔失敗:', err.message);
    }
}

/**
 * 將記憶寫回硬碟
 */
export function saveHistDisk() {
    try {
        ensureDir();
        const obj = {};
        for (const [key, val] of chatHistory.entries()) {
            obj[key] = val;
        }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
        console.error('[AIChat] 寫入歷史記憶檔失敗:', err.message);
    }
}

/**
 * 防頻繁寫入的防彈備份佇列 (5 秒內無新動作才存檔)
 */
export function queueBackup(client, guildId) {
    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
        saveHistDisk();
    }, 5000);
}

// 模組初始化時自動讀取記憶檔
loadHistDisk();

// ==========================================
// 3. 對話歷史紀錄管理與格式防爆
// ==========================================

export function getHist(guildId, userId) {
    const key = `${guildId}_${userId}`;
    if (!chatHistory.has(key)) {
        chatHistory.set(key, []);
    }
    return chatHistory.get(key);
}

export function pushHist(guildId, userId, role, text) {
    const hist = getHist(guildId, userId);
    hist.push({
        role: role === 'model' ? 'model' : 'user',
        parts: [{ text }]
    });

    // 限制最多保留近 20 條對話紀錄
    if (hist.length > 20) {
        hist.splice(0, hist.length - 20);
    }
}

export function clearHist(guildId, userId) {
    const key = `${guildId}_${userId}`;
    chatHistory.delete(key);
    saveHistDisk();
}

/**
 * 整理歷史紀錄，確保符合 Gemini API 要求 (user 與 model 嚴格交替)
 */
export function sanitizeHistory(hist) {
    if (!Array.isArray(hist) || hist.length === 0) return [];

    const cleaned = [];
    let expectedRole = 'user';

    for (const item of hist) {
        if (!item || !item.role || !Array.isArray(item.parts) || item.parts.length === 0) continue;
        
        const currentRole = item.role === 'model' ? 'model' : 'user';

        if (currentRole === expectedRole) {
            const validParts = item.parts
                .map(p => ({ text: p.text || '' }))
                .filter(p => p.text.trim() !== '');

            if (validParts.length > 0) {
                cleaned.push({
                    role: currentRole,
                    parts: validParts
                });
                expectedRole = expectedRole === 'user' ? 'model' : 'user';
            }
        }
    }

    // 若最後一筆依然是 user，先移除以防與最新的請求連續出現兩次 user
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
        cleaned.pop();
    }

    return cleaned;
}

// ==========================================
// 4. 圖片處理與人設設定
// ==========================================

/**
 * 將 Discord Attachment 下載並轉為 Base64
 */
export async function toInline(attachment) {
    if (!attachment || !attachment.url) return null;

    try {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`圖片下載失敗 [HTTP ${response.status}]`);

        const arrayBuffer = await response.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');
        const contentType = attachment.contentType || response.headers.get('content-type') || 'image/jpeg';

        return {
            inlineData: {
                mimeType: contentType,
                data: base64Data
            }
        };
    } catch (err) {
        console.error('[AIChat] 圖片轉換失敗:', err.message);
        return null;
    }
}

/**
 * Angela 人格與 System Instruction
 */
export function systemInstr(guild) {
    const guildName = guild?.name || 'Discord 伺服器';
    return {
        parts: [{
            text: `你是由 Sles 開發的 Discord 助理 Angela。
當前服務的 Discord 伺服器名稱為：${guildName}。

請嚴格遵守以下設定與回應風格：
1. 語氣保持冷靜、優雅、親切且微帶禮貌，使用繁體中文（台灣習慣用語）回應。
2. 回答注重邏輯與條理，避免無意義的贅詞。
3. 正確識別你的創作者兼開發者 Sles。
4. 若使用者傳送圖片，請分析圖片細節並結合內文進行解答。
5. 若要傳送貼圖，可在內文中包含 [STICKER:貼圖ID] 標記。`
        }]
    };
}

/**
 * 格式化與訊息長度截斷修飾
 */
export function polish(text, guild) {
    if (!text) return { content: '（沒有回覆內容）', stickerId: null };

    let cleanedText = text.trim();

    // 貼圖語法解析 [STICKER:12345678]
    let stickerId = null;
    const stickerMatch = cleanedText.match(/\[STICKER:(\d+)\]/i);
    if (stickerMatch) {
        stickerId = stickerMatch[1];
        cleanedText = cleanedText.replace(/\[STICKER:\d+\]/gi, '').trim();
    }

    // 超過 Discord 2000 字限制時的安全截斷 (保留安全裕度 1900 字)
    if (cleanedText.length > 1900) {
        cleanedText = cleanedText.slice(0, 1900) + '\n\n*(內容過長，已自動切斷剩餘文字)*';
    }

    return {
        content: cleanedText || '（沒有回覆內容）',
        stickerId
    };
}

// ==========================================
// 5. API 請求發送 (含 503 重試與 404 自動切換)
// ==========================================

async function callGeminiApiWithRetry(apiKey, body) {
    let lastError = null;

    for (const model of FALLBACK_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 單一模型最多重試 3 次（解決 503 高負載問題）
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (res.ok) {
                    const data = await res.json();
                    return { data, usedModel: model };
                }

                const errText = await res.text().catch(() => '');

                // HTTP 503: 伺服器繁忙 -> 等待 1.5 秒後重試
                if (res.status === 503) {
                    console.warn(`[AIChat] 模型 ${model} 伺服器繁忙 (503)，進行第 ${attempt} 次重試...`);
                    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
                    continue;
                }

                // HTTP 404: 模型下架或不支援 -> 切換至備援模型
                if (res.status === 404) {
                    console.warn(`[AIChat] 模型 ${model} 無法使用 (404)，切換至下一個備援模型...`);
                    break;
                }

                lastError = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
                break;
            } catch (err) {
                lastError = err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    throw lastError || new Error('所有 Gemini 備援模型均無法正常回應');
}

// ==========================================
// 6. 主對話進入點與 Discord 事件處理
// ==========================================

export async function askGemini(prompt, g, u, images = [], guild, client) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return {
            content: '❌ **設定錯誤**：環境變數 `process.env.GEMINI_API_KEY` 未設定，請檢查 `.env` 檔案。',
            stickerId: null
        };
    }

    const userText = prompt || '（傳送了一張圖片，請描述並回應）';
    const parts = [{ text: userText }];

    // 處理附件圖片
    if (Array.isArray(images) && images.length > 0) {
        for (const img of images) {
            const inlineData = await toInline(img);
            if (inlineData) parts.push(inlineData);
        }
    }

    // 整理對話紀錄
    const rawHist = getHist(g, u);
    const cleanHist = sanitizeHistory(rawHist);
    const contents = [...cleanHist, { role: 'user', parts }];

    const body = {
        contents,
        systemInstruction: systemInstr(guild),
        generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 800
        }
    };

    try {
        const { data, usedModel } = await callGeminiApiWithRetry(apiKey, body);
        const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有獲得回覆內容）';

        // 寫入記憶與觸發備份
        pushHist(g, u, 'user', userText);
        pushHist(g, u, 'model', outputText);
        queueBackup(client, g);

        return polish(outputText, guild);

    } catch (err) {
        console.error('[AIChat] 對話發生錯誤:', err);
        throw err;
    }
}

// 防洗版與鎖定管理
export function checkCooldown(userId, cooldownMs = 3000) {
    const now = Date.now();
    const last = cooldowns.get(userId) || 0;
    if (now - last < cooldownMs) {
        const remaining = ((cooldownMs - (now - last)) / 1000).toFixed(1);
        return { isCooling: true, remaining };
    }
    cooldowns.set(userId, now);
    return { isCooling: false, remaining: 0 };
}

/**
 * Discord Message 事件封裝對話觸發器
 */
export async function handleDiscordMessage(msg, client) {
    if (!msg || msg.author.bot) return;

    const guildId = msg.guild?.id || 'DM';
    const userId = msg.author.id;
    const content = msg.content.trim();

    // 指令：清除記憶
    if (content === '!clear' || content === '!forget' || content === '!清除記憶') {
        clearHist(guildId, userId);
        await msg.reply('🧹 已為您清除目前的對話歷史紀錄！').catch(() => {});
        return;
    }

    // 檢查冷卻
    const cd = checkCooldown(userId, 3000);
    if (cd.isCooling) {
        await msg.reply(`⏱️ 發送太快囉，請等待 ${cd.remaining} 秒後再試。`).catch(() => {});
        return;
    }

    // 防止單一使用者連續發送導致並行並發衝突
    if (activeLocks.has(userId)) {
        await msg.reply('⚠️ 上一個問題還在處理中，請稍候...').catch(() => {});
        return;
    }

    activeLocks.add(userId);

    try {
        // 篩選圖片附件
        const images = Array.from(msg.attachments.values()).filter(a => 
            a.contentType?.startsWith('image/')
        );

        // 顯示打字中
        if (typeof msg.channel.sendTyping === 'function') {
            await msg.channel.sendTyping().catch(() => {});
        }

        const replyData = await askGemini(content, guildId, userId, images, msg.guild, client);
        
        if (replyData.stickerId) {
            await msg.reply({ content: replyData.content, stickers: [replyData.stickerId] }).catch(() => {});
        } else {
            await msg.reply(replyData.content).catch(() => {});
        }

    } catch (err) {
        console.error('[AIChat] 處理訊息發生異常:', err);
        await msg.reply(`⚠️ API 請求失敗：${err.message || '未知錯誤'}`).catch(() => {});
    } finally {
        activeLocks.delete(userId);
    }
}
