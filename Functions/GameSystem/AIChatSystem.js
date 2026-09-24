// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天系統：Gemini 自動回覆、Discord 圖片理解與頻道設定
'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'ai-channel-config.json');
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const COOLDOWN_MS = 3000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DISCORD_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net', 'cdn.discord.com']);

const setAIChannelCommand = new SlashCommandBuilder()
    .setName('setaichannel')
    .setDescription('設定或關閉 AI 自動回覆頻道')
    .addChannelOption(o => o.setName('channel').setDescription('設為 AI 回覆頻道;不填則關閉').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function readConfig() {
    try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; }
    catch (err) { console.error('[AIChat] 讀取頻道設定失敗:', err.message); return {}; }
}
function writeConfig(data) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const tempPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, CONFIG_PATH);
}
function getChannelId(guildId) { return readConfig()[guildId] || null; }
function setChannelId(guildId, channelId) {
    const config = readConfig();
    if (channelId) config[guildId] = channelId;
    else delete config[guildId];
    writeConfig(config);
}

// 每個使用者保留最多 16 則文字對話記憶。圖片只傳本次請求，避免在記憶體長期保留大檔。
const histories = new Map();
const cooldowns = new Map();
function getHistory(userId) { if (!histories.has(userId)) histories.set(userId, []); return histories.get(userId); }
function pushHistory(userId, role, text) {
    const history = getHistory(userId);
    history.push({ role, parts: [{ text }] });
    if (history.length > 16) history.splice(0, history.length - 16);
}

function inferImageMimeType(attachment) {
    const declared = String(attachment.contentType || '').split(';')[0].trim().toLowerCase();
    if (SUPPORTED_IMAGE_TYPES.has(declared)) return declared;
    const ext = path.extname(attachment.name || '').toLowerCase();
    return ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] || null;
}

async function downloadDiscordImages(attachments = []) {
    const imageAttachments = [...attachments].filter(item => inferImageMimeType(item));
    if (!imageAttachments.length) return [];
    if (imageAttachments.length > MAX_IMAGE_COUNT) {
        throw new Error(`一次最多分析 ${MAX_IMAGE_COUNT} 張圖片。`);
    }

    const result = [];
    let totalBytes = 0;
    for (const attachment of imageAttachments) {
        let url;
        try { url = new URL(attachment.url); }
        catch { throw new Error('圖片附件網址無效。'); }
        if (url.protocol !== 'https:' || !DISCORD_CDN_HOSTS.has(url.hostname)) {
            throw new Error('圖片附件來源不是 Discord CDN，已拒絕下載。');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url.toString(), { signal: controller.signal, redirect: 'follow' });
            if (!response.ok) throw new Error(`圖片下載失敗（HTTP ${response.status}）。`);
            const mimeType = String(response.headers?.get?.('content-type') || inferImageMimeType(attachment) || '')
                .split(';')[0].trim().toLowerCase();
            if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) throw new Error(`不支援的圖片格式：${mimeType || '未知'}。請使用 JPG、PNG、WEBP 或 GIF。`);
            const declaredLength = Number(response.headers?.get?.('content-length') || 0);
            if (declaredLength && declaredLength + totalBytes > MAX_IMAGE_BYTES) {
                throw new Error('圖片總大小超過 8MB，請縮小圖片後再傳。');
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.length + totalBytes > MAX_IMAGE_BYTES) {
                throw new Error('圖片總大小超過 8MB，請縮小圖片後再傳。');
            }
            if (!buffer.length) throw new Error('圖片檔案是空的，請重新上傳。');
            totalBytes += buffer.length;
            result.push({ inline_data: { mime_type: mimeType, data: buffer.toString('base64') } });
        } catch (err) {
            if (err.name === 'AbortError') throw new Error('下載圖片逾時，請稍後再試。');
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }
    return result;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function retryDelay(response, attempt) {
    const retryAfter = Number(response?.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5000);
    return Math.min(800 * (2 ** attempt), 4000);
}

async function requestGemini(contents) {
    if (!API_KEY) throw new Error('尚未設定 GEMINI_API_KEY 環境變數。');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`;
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);
    let lastError;

    for (let attempt = 0; attempt < 4; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
                signal: controller.signal,
            });
            if (response.ok) return await response.json();

            const text = await response.text().catch(() => '');
            const safeText = text.replaceAll(API_KEY, '[redacted]').slice(0, 300);
            lastError = new Error(`Gemini HTTP ${response.status}${safeText ? `: ${safeText}` : ''}`);
            if (!retryableStatuses.has(response.status) || attempt === 3) throw lastError;
        } catch (err) {
            if (err.name === 'AbortError') lastError = new Error(`Gemini 請求逾時（${REQUEST_TIMEOUT_MS / 1000} 秒）。`);
            else if (err.message?.startsWith('Gemini HTTP ')) lastError = err;
            else lastError = new Error(`Gemini 網路請求失敗：${err.message}`);
            const status = response?.status;
            if ((status && !retryableStatuses.has(status)) || attempt === 3) throw lastError;
        } finally {
            clearTimeout(timer);
        }

        await sleep(retryDelay(response, attempt));
    }
    throw lastError || new Error('Gemini 請求失敗。');
}

async function askGemini(prompt, userId, attachments = []) {
    const text = String(prompt || '').trim();
    const imageParts = await downloadDiscordImages(attachments);
    if (!text && !imageParts.length) return '請輸入訊息或附上一張圖片。';

    const userParts = [{ text: text || '請仔細描述並分析這張圖片。' }, ...imageParts];
    const contents = [...getHistory(userId), { role: 'user', parts: userParts }];
    const data = await requestGemini(contents);
    const out = (data?.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || '')
        .filter(Boolean)
        .join('\n') || '（沒有回覆內容）';

    // API 成功後才更新對話，避免 503 時留下不完整的 user turn。
    pushHistory(userId, 'user', text || '（使用者傳送了一張圖片）');
    pushHistory(userId, 'model', out);
    return out;
}

function getFriendlyError(err) {
    if (/Gemini HTTP 503/.test(err.message)) return '⚠️ Gemini 目前暫時無法服務（HTTP 503），已自動重試仍未成功，請稍後再傳一次。';
    if (/Gemini HTTP 429/.test(err.message)) return '⚠️ Gemini 目前請求量較大（HTTP 429），系統已重試，請稍後再傳一次。';
    if (/GEMINI_API_KEY/.test(err.message)) return '⚠️ AI 尚未設定完成，請管理員確認 Gemini API 設定。';
    if (/圖片|JPG|PNG|WEBP|GIF/.test(err.message)) return `⚠️ ${err.message}`;
    return '⚠️ AI 回覆失敗，請稍後再試。';
}

function init(client) {
    client.on('messageCreate', async (message) => {
        if (message.author?.bot || !message.guild) return;
        if (message.channelId !== getChannelId(message.guild.id)) return;
        const content = String(message.content || '').trim();
        const attachments = [...(message.attachments?.values?.() || [])];
        if (!content && !attachments.some(item => inferImageMimeType(item))) return;

        const now = Date.now();
        if (now - (cooldowns.get(message.author.id) || 0) < COOLDOWN_MS) return;
        cooldowns.set(message.author.id, now);
        let typingTimer;
        try {
            await message.channel.sendTyping().catch(() => {});
            typingTimer = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
            const reply = await askGemini(content, message.author.id, attachments);
            await message.reply({ content: reply.slice(0, 2000), allowedMentions: { repliedUser: false } });
        } catch (err) {
            console.error('[AIChat] 回覆失敗:', err.message);
            await message.reply(getFriendlyError(err)).catch(() => {});
        } finally {
            if (typingTimer) clearInterval(typingTimer);
        }
    });

    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand() || interaction.commandName !== 'setaichannel') return;
        const ch = interaction.options.getChannel('channel');
        if (!ch) {
            setChannelId(interaction.guild.id, null);
            return interaction.reply({ content: '已關閉 AI 自動回覆。', ephemeral: true });
        }
        setChannelId(interaction.guild.id, ch.id);
        return interaction.reply({ content: `已將 AI 回覆頻道設為 ${ch}。在該頻道發言我就會回覆。`, ephemeral: true });
    });

    console.log('[AIChat] 系統已載入');
}

module.exports = { init, askGemini, command: setAIChannelCommand };
