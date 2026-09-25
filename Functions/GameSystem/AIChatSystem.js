// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天系統:Gemini 視覺回覆 + 伺服器 emoji/貼圖 + /setchannel 整合
'use strict';
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-channel-config.json');
const MODEL = 'gemini-2.0-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const COOLDOWN_MS = 3000;
const MAX_EMOJI = 150;

function readConfig() {
    try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; }
    catch { return {}; }
}
function writeConfig(data) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}
function getChannelId(guildId) { return readConfig()[guildId] || null; }
function setChannelId(guildId, channelId) {
    const c = readConfig();
    if (channelId) c[guildId] = channelId; else delete c[guildId];
    writeConfig(c);
}

const histories = new Map();
const cooldowns = new Map();
function getHistory(userId) { if (!histories.has(userId)) histories.set(userId, []); return histories.get(userId); }
function pushHistory(userId, role, text) {
    const h = getHistory(userId); h.push({ role, parts: [{ text }] });
    if (h.length > 16) h.splice(0, h.length - 16);
}

// 把伺服器現有 emoji / 貼圖清單塞給 Gemini,並規定只能用這些
function buildSystemInstruction(guild) {
    const emojis = [...guild.emojis.cache.values()].slice(0, MAX_EMOJI).map(e => e.toString());
    const stickers = [...guild.stickers.cache.values()].map(s => s.name);
    const lines = [
        '你是 Angela,這個 Discord 伺服器的聊天夥伴。語氣自然親切,回覆簡短。',
        '可以使用伺服器自訂 emoji,直接輸出原始格式(例如 <:name:id> 或 <a:name:id>)。',
        '只能在以下清單挑選 emoji,絕不可捏造名稱或 ID,也不可用不在清單中的自訂 emoji:'
    ];
    lines.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
    lines.push('若要傳送伺服器貼圖,在回覆末尾單獨一行寫 [STICKER:貼圖名稱],只能用以下貼圖:');
    lines.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');
    lines.push('不要捏造貼圖名稱,一次最多一張,也不要把 [STICKER:...] 當成普通文字解釋給使用者看。');
    return { text: lines.join('\n') };
}

async function attachmentToInline(att) {
    const res = await fetch(att.url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { inline_data: { mimeType: att.contentType || 'image/png', data: buf.toString('base64') } };
}

// 清理回覆:擋掉不存在的自訂 emoji、解析貼圖
function postProcessReply(text, guild) {
    const validEmojiIds = new Set([...guild.emojis.cache.values()].map(e => e.id));
    text = text.replace(/<(a)?:(\w+):(\d+)>/g, (m, a, name, id) =>
        validEmojiIds.has(id) ? m : `:${name}:`
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

async function askGemini(prompt, userId, images, guild) {
    if (!API_KEY) return { content: '⚠️ 尚未設定 GEMINI_API_KEY 環境變數。', stickerId: null };
    const userText = prompt || '（傳送了一張圖片）';
    const currentParts = [{ text: userText }];
    for (const att of images) {
        try { currentParts.push(await attachmentToInline(att)); }
        catch (e) { console.error('[AIChat] 圖片讀取失敗:', e.message); }
    }
    const contents = [...getHistory(userId), { role: 'user', parts: currentParts }];
    pushHistory(userId, 'user', userText);

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
    pushHistory(userId, 'model', out);
    return postProcessReply(out, guild);
}

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
            const { content, stickerId } = await askGemini(text, message.author.id, images, message.guild);
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
    console.log('[AIChat] 系統已載入(視覺 + emoji/貼圖)');
}

module.exports = { init, askGemini, getChannelId, setChannelId };
