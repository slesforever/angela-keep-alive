// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天系統:Gemini 視覺 + 伺服器 emoji/貼圖 + 每個使用者獨立記憶庫(Discord 頻道 txt 備份/還原)
'use strict';
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

// ─── 設定檔 ────────────────────────────────────────────────────
const CONFIG_PATH     = path.join(process.cwd(), 'data', 'ai-channel-config.json');
const MEM_CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-memory-config.json');
const MEM_DIR         = path.join(process.cwd(), 'data', 'ai-memory');
const MODEL           = 'gemini-2.0-flash';
const API_KEY         = process.env.GEMINI_API_KEY;
const COOLDOWN_MS     = 3000;
const MAX_EMOJI       = 150;

try { fs.mkdirSync(MEM_DIR, { recursive: true }); } catch {}

function readJson(p, fallback) {
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback; }
    catch { return fallback; }
}
function writeJson(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// AI 回覆頻道(沿用舊檔,向後相容)
function readConfig()        { return readJson(CONFIG_PATH, {}); }
function getChannelId(g)    { return readConfig()[g] || null; }
function setChannelId(g, c) {
    const d = readConfig();
    if (c) d[g] = c; else delete d[g];
    writeJson(CONFIG_PATH, d);
}

// AI 記憶庫頻道(每個伺服器一個,放記憶 txt 備份)
function readMemConfig()         { return readJson(MEM_CONFIG_PATH, {}); }
function getMemoryChannelId(g)  { return readMemConfig()[g] || null; }
function setMemoryChannelId(g, c) {
    const d = readMemConfig();
    if (c) d[g] = c; else delete d[g];
    writeJson(MEM_CONFIG_PATH, d);
}

// ─── 記憶體 + 磁碟記憶 ─────────────────────────────────────────
const histories = new Map();
const cooldowns = new Map();
const memBackupTimer     = new Map();
const memBackupInFlight  = new Set();

function memKey(guildId, userId) { return `${guildId}:${userId}`; }
function memFile(key) { return path.join(MEM_DIR, `${key.replace(/[:]/g, '_')}.json`); }

function loadHistoryFromDisk(guildId, userId) {
    try {
        const f = memFile(memKey(guildId, userId));
        if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { console.error('[AIChat] 讀記憶失敗:', e.message); }
    return [];
}
function saveHistoryToDisk(guildId, userId, arr) {
    try { fs.writeFileSync(memFile(memKey(guildId, userId)), JSON.stringify(arr, null, 2), 'utf8'); }
    catch (e) { console.error('[AIChat] 寫記憶失敗:', e.message); }
}

function getHistory(guildId, userId) {
    const key = memKey(guildId, userId);
    if (!histories.has(key)) histories.set(key, loadHistoryFromDisk(guildId, userId));
    return histories.get(key);
}
function pushHistory(guildId, userId, role, text) {
    const h = getHistory(guildId, userId);
    h.push({ role, parts: [{ text }] });
    if (h.length > 24) h.splice(0, h.length - 24);
    saveHistoryToDisk(guildId, userId, h);
}

// ─── Discord 頻道記憶備份 / 還原(同 PacksAndData 做法)─────────
function buildMemorySnapshotText(guildId) {
    const prefix = `${guildId}_`;
    const files = fs.existsSync(MEM_DIR)
        ? fs.readdirSync(MEM_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.json'))
        : [];
    const header = [
        `# Angela AI Memory Backup`,
        `# Guild: ${guildId}`,
        `# Generated: ${new Date().toISOString()}`,
        `# Users: ${files.length}`,
        ``,
    ].join('\n');
    const blocks = files.map(file => {
        const userId = file.slice(prefix.length, -5);
        try {
            const arr = JSON.parse(fs.readFileSync(path.join(MEM_DIR, file), 'utf8'));
            return [
                `==================================================`,
                `MEM KEY: ${guildId}:${userId}`,
                `UPDATED: ${new Date().toISOString()}`,
                `==================================================`,
                JSON.stringify(arr),
                ``,
            ].join('\n');
        } catch (e) {
            return `==================================================\nMEM KEY: ${guildId}:${userId}\nPARSE ERROR: ${e.message}\n==================================================\n`;
        }
    });
    return header + blocks.join('\n');
}

async function sendMemoryBackupToChannel(client, guildId) {
    const chId = getMemoryChannelId(guildId);
    if (!chId) return false;
    const channel = await client.channels.fetch(chId).catch(() => null);
    if (!channel) { console.error(`[AIChat] 找不到記憶庫頻道 ${chId}`); return false; }
    const text = buildMemorySnapshotText(guildId);
    if (!text.trim()) return false;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `aimemory_${guildId}_${stamp}.txt`;
    const att = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name });
    await channel.send({ content: `🧠 AI 記憶庫備份`, files: [att] });
    return true;
}

function queueMemoryBackup(client, guildId) {
    if (!getMemoryChannelId(guildId)) return;
    if (memBackupTimer.has(guildId)) clearTimeout(memBackupTimer.get(guildId));
    memBackupTimer.set(guildId, setTimeout(async () => {
        if (memBackupInFlight.has(guildId)) return;
        memBackupInFlight.add(guildId);
        try { await sendMemoryBackupToChannel(client, guildId); }
        catch (e) { console.error('[AIChat] 記憶備份失敗:', e.message); }
        finally { memBackupInFlight.delete(guildId); }
    }, 3000));
}

async function restoreMemoryFromChannel(client, guildId) {
    const chId = getMemoryChannelId(guildId);
    if (!chId) return 0;
    const channel = await client.channels.fetch(chId).catch(() => null);
    if (!channel) { console.error(`[AIChat] 還原失敗:找不到記憶庫頻道 ${chId}`); return 0; }
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages || !messages.size) return 0;

    let latest = null;
    for (const m of messages.values()) {
        for (const a of m.attachments.values()) {
            const match = a.name?.match(new RegExp(`^aimemory_${guildId}_(.+)\\.txt$`));
            if (match && (!latest || m.createdTimestamp > latest.ts)) {
                latest = { ts: m.createdTimestamp, url: a.url, name: a.name };
            }
        }
    }
    if (!latest) return 0;

    let text;
    try {
        const r = await fetch(latest.url);
        if (!r.ok) return 0;
        text = await r.text();
    } catch (e) { console.error('[AIChat] 下載記憶備份失敗:', e.message); return 0; }
    if (!text) return 0;

    const pattern =
        /==================================================\r?\nMEM KEY:\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nMEM KEY:|\s*$)/g;
    let restored = 0, match;
    while ((match = pattern.exec(text)) !== null) {
        const key = match[1].trim();
        const jsonText = match[2].trim();
        try {
            const arr = JSON.parse(jsonText);
            fs.writeFileSync(memFile(key), JSON.stringify(arr, null, 2), 'utf8');
            histories.set(key, arr);
            restored++;
        } catch (e) { console.error(`[AIChat] 解析記憶 ${key} 失敗:`, e.message); }
    }
    console.log(`✅ [AIChat] 從記憶庫頻道還原了 ${restored} 個使用者的記憶(guild ${guildId})`);
    return restored;
}

async function restoreAllMemory(client) {
    const guilds = Object.keys(readMemConfig());
    let total = 0;
    for (const g of guilds) {
        try { total += await restoreMemoryFromChannel(client, g); }
        catch (e) { console.error(`[AIChat] guild ${g} 記憶還原失敗:`, e.message); }
    }
    return total;
}

// ─── Gemini 視覺 + emoji/貼圖 ──────────────────────────────────
function buildSystemInstruction(guild) {
    const emojis = [...guild.emojis.cache.values()].slice(0, MAX_EMOJI).map(e => e.toString());
    const stickers = [...guild.stickers.cache.values()].map(s => s.name);
    const lines = [
        '你是 Angela,這個 Discord 伺服器的聊天夥伴。語氣自然親切,回覆簡短。',
        '可以使用伺服器自訂 emoji,直接輸出原始格式(例如 <:name:id> 或 <a:name:id>)。',
        '只能在以下清單挑選 emoji,絕不可捏造名稱或 ID:'
    ];
    lines.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
    lines.push('若要傳送伺服器貼圖,在回覆末尾單獨一行寫 [STICKER:貼圖名稱],只能用以下貼圖:');
    lines.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');
    lines.push('不要捏造貼圖名稱,一次最多一張。');
    return { text: lines.join('\n') };
}

async function attachmentToInline(att) {
    const res = await fetch(att.url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { inline_data: { mimeType: att.contentType || 'image/png', data: buf.toString('base64') } };
}

function postProcessReply(text, guild) {
    const validIds = new Set([...guild.emojis.cache.values()].map(e => e.id));
    text = text.replace(/<(a)?:(\w+):(\d+)>/g, (m, a, name, id) =>
        validIds.has(id) ? m : `:${name}:`
    );
    let stickerId = null;
    const stickerMap = new Map([...guild.stickers.cache.values()].map(s => [s.name, s.id]));
    const m = text.match(/\[STICKER:([^\]]+)\]/);
    if (m) {
        const name = m[1].trim();
        if (stickerMap.has(name)) stickerId = stickerMap.get(name);
        text = text.replace(/\[STICKER:[^\]]+\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    return { content: text.slice(0, 2000), stickerId };
}

async function askGemini(prompt, guildId, userId, images, guild, client) {
    if (!API_KEY) return { content: '⚠️ 尚未設定 GEMINI_API_KEY 環境變數。', stickerId: null };
    const userText = prompt || '（傳送了一張圖片）';
    const currentParts = [{ text: userText }];
    for (const att of images) {
        try { currentParts.push(await attachmentToInline(att)); }
        catch (e) { console.error('[AIChat] 圖片讀取失敗:', e.message); }
    }
    const contents = [...getHistory(guildId, userId), { role: 'user', parts: currentParts }];
    pushHistory(guildId, userId, 'user', userText);

    const body = {
        contents,
        systemInstruction: buildSystemInstruction(guild),
        generationConfig: { temperature: 0.9, maxOutputTokens: 800 }
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`); }
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回覆內容）';
    pushHistory(guildId, userId, 'model', out);
    queueMemoryBackup(client, guildId);
    return postProcessReply(out, guild);
}

// ─── 啟動 ──────────────────────────────────────────────────────
function init(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.guild) return;
        if (message.channelId !== getChannelId(message.guild.id)) return;
        const text = message.content.trim();
        const images = [...message.attachments.values()].filter(a =>
            (a.contentType && a.contentType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(a.url)
        );
        if (!text && !images.length) return;
        const now = Date.now();
        if (now - (cooldowns.get(message.author.id) || 0) < COOLDOWN_MS) return;
        cooldowns.set(message.author.id, now);

        try {
            await message.channel.sendTyping().catch(() => {});
            const { content, stickerId } = await askGemini(text, message.guild.id, message.author.id, images, message.guild, client);
            await message.reply({
                content,
                allowedMentions: { repliedUser: false },
                ...(stickerId ? { stickers: [stickerId] } : {})
            });
        } catch (err) {
            console.error('[AIChat] 回覆失敗:', err.message);
            await message.reply('⚠️ AI 回覆失敗,請稍後再試。').catch(() => {});
        }
    });
    console.log('[AIChat] 系統已載入(視覺 + emoji/貼圖 + 獨立記憶庫)');
}

module.exports = {
    init, askGemini,
    getChannelId, setChannelId,
    getMemoryChannelId, setMemoryChannelId,
    restoreAllMemory
};
