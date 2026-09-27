import fs from 'fs';
import path from 'path';

// 取得專案根目錄下的 data 目錄 (相容性最佳寫法)
const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'ai_history.json');

// ==========================================
// 1. 模型與備援設定
// ==========================================
const FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash'
];

const chatHistory = new Map();
const cooldowns = new Map();
const activeLocks = new Set();
let backupTimer = null;

// ==========================================
// 2. 部署安全的磁碟寫入 (含唯讀環境退回機制)
// ==========================================

function ensureDirSafe() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        return true;
    } catch (err) {
        // 唯讀平台不拋出錯誤，僅警告並繼續以記憶體模式執行
        return false;
    }
}

export function loadHistDisk() {
    try {
        if (!ensureDirSafe()) return;
        if (fs.existsSync(HISTORY_FILE)) {
            const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
            const data = JSON.parse(raw);
            chatHistory.clear();
            for (const [key, val] of Object.entries(data)) {
                if (Array.isArray(val)) {
                    chatHistory.set(key, val);
                }
            }
            console.log(`[AIChat] 成功載入 ${chatHistory.size} 筆歷史紀錄。`);
        }
    } catch (err) {
        console.warn('[AIChat] 歷史紀錄載入跳過 (使用記憶體模式):', err.message);
    }
}

export function saveHistDisk() {
    try {
        if (!ensureDirSafe()) return;
        const obj = {};
        for (const [key, val] of chatHistory.entries()) {
            obj[key] = val;
        }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
        // 忽略寫檔失敗，維持記憶體內運作
    }
}

export function queueBackup(client, guildId) {
    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
        saveHistDisk();
    }, 5000);
}

// 安全啟動載入
loadHistDisk();

// ==========================================
// 3. 對話紀錄管理
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

    if (hist.length > 20) {
        hist.splice(0, hist.length - 20);
    }
}

export function clearHist(guildId, userId) {
    const key = `${guildId}_${userId}`;
    chatHistory.delete(key);
    saveHistDisk();
}

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

    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === 'user') {
        cleaned.pop();
    }

    return cleaned;
}

// ==========================================
// 4. 圖片處理與人設設定
// ==========================================

export async function toInline(attachment) {
    if (!attachment || !attachment.url) return null;

    try {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
        console.error('[AIChat] 圖片讀取失敗:', err.message);
        return null;
    }
}

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

export function polish(text, guild) {
    if (!text) return { content: '（沒有回覆內容）', stickerId: null };

    let cleanedText = text.trim();

    let stickerId = null;
    const stickerMatch = cleanedText.match(/\[STICKER:(\d+)\]/i);
    if (stickerMatch) {
        stickerId = stickerMatch[1];
        cleanedText = cleanedText.replace(/\[STICKER:\d+\]/gi, '').trim();
    }

    if (cleanedText.length > 1900) {
        cleanedText = cleanedText.slice(0, 1900) + '\n\n*(內容過長，已自動切斷剩餘文字)*';
    }

    return {
        content: cleanedText || '（沒有回覆內容）',
        stickerId
    };
}

// ==========================================
// 5. API 請求與自動備援機制
// ==========================================

async function callGeminiApiWithRetry(apiKey, body) {
    let lastError = null;

    for (const model of FALLBACK_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

                if (res.status === 503) {
                    console.warn(`[AIChat] ${model} 503 繁忙，嘗試第 ${attempt} 次重試...`);
                    await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
                    continue;
                }

                if (res.status === 404) {
                    console.warn(`[AIChat] ${model} 不可用 (404)，切換下一個模型...`);
                    break;
                }

                lastError = new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
                break;
            } catch (err) {
                lastError = err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    throw lastError || new Error('所有 Gemini 備援模型均無法回應');
}

// ==========================================
// 6. 主對話與訊息進入點
// ==========================================

export async function askGemini(prompt, g, u, images = [], guild, client) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return {
            content: '❌ **設定錯誤**：環境變數 `process.env.GEMINI_API_KEY` 未設定。',
            stickerId: null
        };
    }

    const userText = prompt || '（傳送了一張圖片，請描述並回應）';
    const parts = [{ text: userText }];

    if (Array.isArray(images) && images.length > 0) {
        for (const img of images) {
            const inlineData = await toInline(img);
            if (inlineData) parts.push(inlineData);
        }
    }

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
        const { data } = await callGeminiApiWithRetry(apiKey, body);
        const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有獲得回覆內容）';

        pushHist(g, u, 'user', userText);
        pushHist(g, u, 'model', outputText);
        queueBackup(client, g);

        return polish(outputText, guild);

    } catch (err) {
        console.error('[AIChat] 對話發生錯誤:', err);
        throw err;
    }
}

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

export async function handleDiscordMessage(msg, client) {
    if (!msg || msg.author.bot) return;

    const guildId = msg.guild?.id || 'DM';
    const userId = msg.author.id;
    const content = msg.content.trim();

    if (content === '!clear' || content === '!forget' || content === '!清除記憶') {
        clearHist(guildId, userId);
        await msg.reply('🧹 已為您清除目前的對話歷史紀錄！').catch(() => {});
        return;
    }

    const cd = checkCooldown(userId, 3000);
    if (cd.isCooling) {
        await msg.reply(`⏱️ 發送太快囉，請等待 ${cd.remaining} 秒後再試。`).catch(() => {});
        return;
    }

    if (activeLocks.has(userId)) {
        await msg.reply('⚠️ 上一個問題還在處理中，請稍候...').catch(() => {});
        return;
    }

    activeLocks.add(userId);

    try {
        const images = Array.from(msg.attachments.values()).filter(a => 
            a.contentType?.startsWith('image/')
        );

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
