from pathlib import Path

code = r"""// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天：Gemini 視覺 + 伺服器 emoji/貼圖 + 每人記憶庫（Discord 頻道 txt 備份/還原）
// 防濫用：每人冷卻 + 每分鐘全域上限 + 歷史/emoji 精簡，避免額度瞬爆。
'use strict';

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');

// ─── 設定 ──────────────────────────────────────────────────────
const CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-config.json');
const MEM_DIR = path.join(process.cwd(), 'data', 'ai-memory');

// 目前使用穩定的 Gemini Flash 多模態模型。
// API Key 不要寫進程式，Render 環境變數請設定 GEMINI_API_KEY。
const MODEL = 'gemini-3.8-flash';
const API_KEY = process.env.GEMINI_API_KEY;

const COOLDOWN_USER = 6000;   // 每人冷卻 6 秒
const MAX_PER_MINUTE = 8;     // 此 Bot 行程每分鐘最多 8 次 Gemini
const HISTORY_CAP = 12;       // 每人保留最近 12 則
const EMOJI_CAP = 60;         // 傳給 Gemini 的自訂 emoji 最多 60 個
const MAX_EMOJI_OUT = 150;    // 預留給輸出清理邏輯
const MAX_IMAGES = 4;         // 單次最多處理 4 張圖片
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 單張圖片最多 10 MB

try {
    fs.mkdirSync(MEM_DIR, { recursive: true });
} catch {}

function readJson(filePath, fallback) {
    try {
        return fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

const cfg = readJson(CONFIG_PATH, {});

function saveCfg() {
    writeJson(CONFIG_PATH, cfg);
}

function getAiChannel(guildId) {
    return cfg[guildId]?.channel || null;
}

function getMemoryChannel(guildId) {
    return cfg[guildId]?.memory || null;
}

function setAiChannel(guildId, channelId) {
    cfg[guildId] = cfg[guildId] || {};

    if (channelId) {
        cfg[guildId].channel = channelId;
    } else {
        delete cfg[guildId].channel;
    }

    if (!cfg[guildId].channel && !cfg[guildId].memory) {
        delete cfg[guildId];
    }

    saveCfg();
}

function setMemoryChannel(guildId, channelId) {
    cfg[guildId] = cfg[guildId] || {};

    if (channelId) {
        cfg[guildId].memory = channelId;
    } else {
        delete cfg[guildId].memory;
    }

    if (!cfg[guildId].channel && !cfg[guildId].memory) {
        delete cfg[guildId];
    }

    saveCfg();
}

// ─── 記憶體 + 磁碟 ─────────────────────────────────────────────
const histories = new Map();
const cooldowns = new Map();
const callTimestamps = [];
const memTimer = new Map();
const memInFlight = new Set();

const mk = (guildId, userId) => `${guildId}:${userId}`;
const memFile = key => path.join(MEM_DIR, `${key.replace(/:/g, '_')}.json`);

function loadHist(guildId, userId) {
    try {
        const file = memFile(mk(guildId, userId));

        if (!fs.existsSync(file)) {
            return [];
        }

        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error('[AIChat] 讀記憶失敗:', e.message);
        return [];
    }
}

function saveHist(guildId, userId, arr) {
    try {
        fs.writeFileSync(
            memFile(mk(guildId, userId)),
            JSON.stringify(arr, null, 2),
            'utf8'
        );
    } catch (e) {
        console.error('[AIChat] 寫記憶失敗:', e.message);
    }
}

function getHist(guildId, userId) {
    const key = mk(guildId, userId);

    if (!histories.has(key)) {
        histories.set(key, loadHist(guildId, userId));
    }

    return histories.get(key);
}

function pushHist(guildId, userId, role, text) {
    const history = getHist(guildId, userId);

    history.push({
        role,
        parts: [{ text: String(text ?? '') }]
    });

    if (history.length > HISTORY_CAP) {
        history.splice(0, history.length - HISTORY_CAP);
    }

    saveHist(guildId, userId, history);
}

function pushUserAndModelHist(guildId, userId, userText, modelText) {
    const history = getHist(guildId, userId);

    history.push({
        role: 'user',
        parts: [{ text: String(userText ?? '') }]
    });

    history.push({
        role: 'model',
        parts: [{ text: String(modelText ?? '') }]
    });

    if (history.length > HISTORY_CAP) {
        history.splice(0, history.length - HISTORY_CAP);
    }

    saveHist(guildId, userId, history);
}

// ─── 頻道記憶備份/還原 ─────────────────────────────────────────
function snapshotText(guildId) {
    const prefix = `${guildId}_`;

    const files = fs.existsSync(MEM_DIR)
        ? fs.readdirSync(MEM_DIR)
            .filter(file => file.startsWith(prefix) && file.endsWith('.json'))
        : [];

    const head =
        `# Angela AI Memory Backup\n` +
        `# Guild: ${guildId}\n` +
        `# Generated: ${new Date().toISOString()}\n` +
        `# Users: ${files.length}\n\n`;

    const body = files.map(file => {
        const userId = file.slice(prefix.length, -5);

        try {
            const arr = JSON.parse(
                fs.readFileSync(path.join(MEM_DIR, file), 'utf8')
            );

            return (
                `==================================================\n` +
                `MEM KEY: ${guildId}:${userId}\n` +
                `UPDATED: ${new Date().toISOString()}\n` +
                `==================================================\n` +
                `${JSON.stringify(arr)}\n`
            );
        } catch (e) {
            return (
                `==================================================\n` +
                `MEM KEY: ${guildId}:${userId}\n` +
                `PARSE ERROR: ${e.message}\n` +
                `==================================================\n`
            );
        }
    }).join('\n');

    return head + body;
}

async function sendBackup(client, guildId) {
    const channelId = getMemoryChannel(guildId);

    if (!channelId) {
        return false;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel) {
        return false;
    }

    const text = snapshotText(guildId);

    if (!text.trim()) {
        return false;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const attachment = new AttachmentBuilder(
        Buffer.from(text, 'utf8'),
        { name: `aimemory_${guildId}_${stamp}.txt` }
    );

    await channel.send({
        content: '🧠 AI 記憶庫備份',
        files: [attachment]
    });

    return true;
}

function queueBackup(client, guildId) {
    if (!getMemoryChannel(guildId)) {
        return;
    }

    if (memTimer.has(guildId)) {
        clearTimeout(memTimer.get(guildId));
    }

    memTimer.set(
        guildId,
        setTimeout(async () => {
            memTimer.delete(guildId);

            if (memInFlight.has(guildId)) {
                return;
            }

            memInFlight.add(guildId);

            try {
                await sendBackup(client, guildId);
            } catch (e) {
                console.error('[AIChat] 備份失敗:', e.message);
            } finally {
                memInFlight.delete(guildId);
            }
        }, 5000)
    );
}

async function restoreGuild(client, guildId) {
    const channelId = getMemoryChannel(guildId);

    if (!channelId) {
        return 0;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.messages) {
        return 0;
    }

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);

    if (!messages?.size) {
        return 0;
    }

    let latest = null;

    for (const message of messages.values()) {
        for (const attachment of message.attachments.values()) {
            const match = attachment.name?.match(
                new RegExp(`^aimemory_${guildId}_(.+)\\.txt$`)
            );

            if (
                match &&
                (!latest || message.createdTimestamp > latest.ts)
            ) {
                latest = {
                    ts: message.createdTimestamp,
                    url: attachment.url
                };
            }
        }
    }

    if (!latest) {
        return 0;
    }

    let text;

    try {
        const response = await fetch(latest.url);

        if (!response.ok) {
            return 0;
        }

        text = await response.text();
    } catch (e) {
        console.error('[AIChat] 下載備份失敗:', e.message);
        return 0;
    }

    if (!text) {
        return 0;
    }

    const pattern =
        /==================================================\r?\nMEM KEY:\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nMEM KEY:|\s*$)/g;

    let count = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        const key = match[1].trim();

        // 防止錯誤備份內容寫到奇怪的位置。
        if (!/^\d+:\d+$/.test(key)) {
            continue;
        }

        try {
            const arr = JSON.parse(match[2].trim());

            if (!Array.isArray(arr)) {
                continue;
            }

            const safeArr = arr.slice(-HISTORY_CAP);

            const file = memFile(key);
            fs.writeFileSync(
                file,
                JSON.stringify(safeArr, null, 2),
                'utf8'
            );

            histories.set(key, safeArr);
            count++;
        } catch (e) {
            console.error(`[AIChat] 解析 ${key} 失敗:`, e.message);
        }
    }

    console.log(`✅ [AIChat] guild ${guildId} 還原 ${count} 個使用者記憶`);
    return count;
}

async function restoreAll(client) {
    let total = 0;

    for (const guildId of Object.keys(cfg)) {
        try {
            total += await restoreGuild(client, guildId);
        } catch (e) {
            console.error(
                `[AIChat] guild ${guildId} 還原失敗:`,
                e.message
            );
        }
    }

    return total;
}

// ─── Gemini 視覺 + emoji/貼圖 ──────────────────────────────────
function systemInstr(guild) {
    const emojis = [...guild.emojis.cache.values()]
        .slice(0, EMOJI_CAP)
        .map(emoji => emoji.toString());

    const stickers = [...guild.stickers.cache.values()]
        .slice(0, MAX_EMOJI_OUT)
        .map(sticker => sticker.name);

    const lines = [
        '你是 Angela，這個 Discord 伺服器的聊天夥伴。',
        '語氣自然、親切，回覆簡短，通常 1～3 句。',
        '可使用伺服器自訂 emoji，直接輸出原始格式 <:name:id> 或 <a:name:id>。',
        '只可使用下面列出的 emoji，不可自己捏造 emoji。',
        emojis.length
            ? emojis.join(' ')
            : '（此伺服器沒有可用的自訂 emoji）',
        '若要傳貼圖，請在回覆末尾單獨一行寫 [STICKER:貼圖名稱]。',
        '只能使用下面列出的貼圖，不可捏造，一次最多一張。',
        stickers.length
            ? stickers.join('、')
            : '（此伺服器沒有可用的自訂貼圖）'
    ];

    return lines.join('\n');
}

function normalizeMimeType(contentType) {
    if (!contentType) {
        return 'image/png';
    }

    const mime = contentType.split(';')[0].trim().toLowerCase();

    const allowed = new Set([
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif'
    ]);

    return allowed.has(mime) ? mime : 'image/png';
}

async function toInline(attachment) {
    const response = await fetch(attachment.url);

    if (!response.ok) {
        throw new Error(`圖片下載失敗: HTTP ${response.status}`);
    }

    const contentLength = Number(
        response.headers.get('content-length') || 0
    );

    if (contentLength > MAX_IMAGE_BYTES) {
        throw new Error('圖片太大，已略過');
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error('圖片太大，已略過');
    }

    return {
        inline_data: {
            mimeType: normalizeMimeType(attachment.contentType),
            data: Buffer.from(arrayBuffer).toString('base64')
        }
    };
}

function polish(text, guild) {
    text = String(text ?? '').trim();

    const validEmojiIds = new Set(
        [...guild.emojis.cache.values()].map(emoji => emoji.id)
    );

    text = text.replace(
        /<(a)?:(\w+):(\d+)>/g,
        (match, animated, name, id) => {
            return validEmojiIds.has(id)
                ? match
                : `:${name}:`;
        }
    );

    let stickerId = null;

    const stickerMap = new Map(
        [...guild.stickers.cache.values()]
            .map(sticker => [sticker.name, sticker.id])
    );

    const stickerMatch = text.match(/\[STICKER:([^\]]+)\]/);

    if (stickerMatch) {
        const stickerName = stickerMatch[1].trim();

        if (stickerMap.has(stickerName)) {
            stickerId = stickerMap.get(stickerName);
        }

        text = text
            .replace(/\[STICKER:[^\]]+\]/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    return {
        content: text.slice(0, 2000) || '（沒有回覆內容）',
        stickerId
    };
}

function canCall() {
    const now = Date.now();

    while (
        callTimestamps.length &&
        now - callTimestamps[0] > 60_000
    ) {
        callTimestamps.shift();
    }

    if (callTimestamps.length >= MAX_PER_MINUTE) {
        return false;
    }

    callTimestamps.push(now);
    return true;
}

function cleanupOldHist(guildId, userId) {
    const history = getHist(guildId, userId);

    if (history.length > HISTORY_CAP) {
        history.splice(0, history.length - HISTORY_CAP);
        saveHist(guildId, userId, history);
    }
}

async function askGemini(
    prompt,
    guildId,
    userId,
    images,
    guild,
    client
) {
    if (!API_KEY) {
        return {
            content: '⚠️ 尚未設定 GEMINI_API_KEY 環境變數。',
            stickerId: null
        };
    }

    const userText = prompt || '（傳送了一張圖片，請描述並回應。）';

    const parts = [
        { text: userText }
    ];

    const selectedImages = images.slice(0, MAX_IMAGES);

    for (const attachment of selectedImages) {
        try {
            parts.push(await toInline(attachment));
        } catch (e) {
            console.error('[AIChat] 圖片處理失敗:', e.message);
        }
    }

    const history = getHist(guildId, userId)
        .filter(item =>
            item &&
            (item.role === 'user' || item.role === 'model') &&
            Array.isArray(item.parts)
        )
        .slice(-HISTORY_CAP);

    const contents = [
        ...history,
        {
            role: 'user',
            parts
        }
    ];

    const systemInstruction = systemInstr(guild);

    const body = {
        contents,
        systemInstruction: {
            parts: [
                { text: systemInstruction }
            ]
        },
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 600
        }
    };

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': API_KEY
        },
        body: JSON.stringify(body)
    });

    const rawResponse = await response.text();

    if (!response.ok) {
        let detail = rawResponse;

        try {
            const errorJson = JSON.parse(rawResponse);
            detail =
                errorJson?.error?.message ||
                errorJson?.error?.status ||
                rawResponse;
        } catch {}

        throw new Error(
            `Gemini ${response.status}: ${String(detail).slice(0, 500)}`
        );
    }

    let data;

    try {
        data = JSON.parse(rawResponse);
    } catch {
        throw new Error('Gemini 回傳了無法解析的 JSON。');
    }

    const output =
        data?.candidates?.[0]?.content?.parts
            ?.map(part => part?.text || '')
            .join('')
            .trim();

    if (!output) {
        const finishReason = data?.candidates?.[0]?.finishReason;
        throw new Error(
            finishReason
                ? `Gemini 沒有文字回覆，finishReason=${finishReason}`
                : 'Gemini 沒有回傳文字內容。'
        );
    }

    // 只有成功拿到模型回覆，才正式寫入記憶。
    // 避免 API 失敗時，把失敗訊息也塞進對話歷史。
    pushUserAndModelHist(
        guildId,
        userId,
        userText,
        output
    );

    cleanupOldHist(guildId, userId);
    queueBackup(client, guildId);

    return polish(output, guild);
}

// ─── 啟動（獨立，不動其他腳本）────────────────────────────────
function init(client) {
    if (!client || typeof client.on !== 'function') {
        throw new TypeError('[AIChat] init(client) 收到的 client 無效。');
    }

    // messageCreate：AI 主流程
    client.on('messageCreate', async message => {
        if (message.author?.bot || !message.guild) {
            return;
        }

        // ─── 文字設定指令（管理員專用） ────────────────────────
        const isAdmin = Boolean(
            message.member?.permissions?.has(
                PermissionFlagsBits.Administrator
            )
        );

        const raw = String(message.content || '').trim();

        if (
            isAdmin &&
            /^(!!setaichannel|!!setaimemory|!!aioff)$/i.test(raw)
        ) {
            const command = raw.toLowerCase();

            if (command === '!!setaichannel') {
                setAiChannel(
                    message.guild.id,
                    message.channel.id
                );

                return message.reply(
                    '✅ 此頻道已設為 AI 自動回覆頻道。在這裡發言（可附圖），Angela 就會回覆。'
                ).catch(() => {});
            }

            if (command === '!!setaimemory') {
                setMemoryChannel(
                    message.guild.id,
                    message.channel.id
                );

                return message.reply(
                    '✅ 此頻道已設為 AI 記憶庫頻道。對話記憶會備份成 txt，重啟後自動讀回。'
                ).catch(() => {});
            }

            if (command === '!!aioff') {
                setAiChannel(message.guild.id, null);
                setMemoryChannel(message.guild.id, null);

                return message.reply(
                    '✅ 已關閉此伺服器的 AI 回覆與記憶庫。'
                ).catch(() => {});
            }
        }

        // ─── 只在 AI 頻道回覆 ─────────────────────────────────
        if (
            message.channelId !==
            getAiChannel(message.guild.id)
        ) {
            return;
        }

        const images = [...message.attachments.values()]
            .filter(attachment => {
                const contentType = String(
                    attachment.contentType || ''
                ).toLowerCase();

                const url = String(attachment.url || '');

                return (
                    contentType.startsWith('image/') ||
                    /\.(png|jpe?g|webp|gif)(?:$|\?)/i.test(url)
                );
            });

        if (!raw && !images.length) {
            return;
        }

        const now = Date.now();
        const lastCall = cooldowns.get(message.author.id) || 0;

        if (now - lastCall < COOLDOWN_USER) {
            return;
        }

        if (!canCall()) {
            return message.reply(
                '⏳ 目前太頻繁，請等一分鐘再試。'
            ).catch(() => {});
        }

        cooldowns.set(message.author.id, now);

        try {
            await message.channel.sendTyping().catch(() => {});

            const result = await askGemini(
                raw,
                message.guild.id,
                message.author.id,
                images,
                message.guild,
                client
            );

            const payload = {
                content: result.content,
                allowedMentions: {
                    repliedUser: false
                }
            };

            if (result.stickerId) {
                payload.stickers = [result.stickerId];
            }

            await message.reply(payload);
        } catch (error) {
            console.error(
                '[AIChat] 回覆失敗:',
                error?.stack || error?.message || error
            );

            await message.reply(
                '⚠️ AI 回覆失敗，請稍後再試。'
            ).catch(() => {});
        }
    });

    // ─── 重啟還原記憶 ────────────────────────────────────────
    // clientReady 後頻道快取 / API 存取會比較穩定。
    client.once('clientReady', async () => {
        try {
            const count = await restoreAll(client);

            if (count > 0) {
                console.log(
                    `🧠 [AIChat] 共還原 ${count} 個使用者記憶`
                );
            }
        } catch (error) {
            console.error(
                '[AIChat] 還原失敗:',
                error?.stack || error?.message || error
            );
        }
    });

    console.log(
        `[AIChat] 獨立系統已載入（${MODEL} + 視覺 + emoji/貼圖 + 記憶庫 + 防濫用）`
    );

    if (!API_KEY) {
        console.warn(
            '[AIChat] ⚠️ GEMINI_API_KEY 尚未存在於目前的環境變數。'
        );
    }
}

module.exports = {
    init,
    getAiChannel,
    getMemoryChannel
};
"""

out = Path("/mnt/data/AIChatSystem_fixed.js")
out.write_text(code, encoding="utf-8")
print(f"已建立完整修復版：{out}")
print(f"行數：{len(code.splitlines())}")
