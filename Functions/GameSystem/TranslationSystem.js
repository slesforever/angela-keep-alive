// Functions/GameSystem/TranslationSystem.js
// 指定頻道自動翻譯：使用 Google Gemini API（免費、極穩定、不限流、高優質翻譯）
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// 🔑 請在此處填入你的 Gemini API Key (或設定在 .env 檔中)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE";

const CONFIG_PATH = path.join(process.cwd(), 'data', 'translation-config.json');

// --- 設定檔讀寫邏輯 ---
function readConfig() {
    try {
        return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {};
    } catch {
        return {};
    }
}

function writeConfig(data) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function setTranslationChannel(guildId, channelId) {
    const c = readConfig();
    c[guildId] = { ...(typeof c[guildId] === 'object' ? c[guildId] : {}), output: channelId };
    writeConfig(c);
}

function setTranslationOutput(guildId, channelId) {
    setTranslationChannel(guildId, channelId);
}

function setTranslationConfig(guildId, config = {}) {
    const c = readConfig();
    c[guildId] = {
        output: config.output ? String(config.output) : null,
        sources: Array.isArray(config.sources)
            ? [...new Set(config.sources.filter(Boolean).map(String))]
            : []
    };
    writeConfig(c);
}

function toggleTranslationSource(guildId, channelId) {
    const c = readConfig();
    const entry = typeof c[guildId] === 'object' ? c[guildId] : { output: c[guildId] || null };
    const sources = new Set(entry.sources || []);
    if (sources.has(channelId)) sources.delete(channelId); else sources.add(channelId);
    c[guildId] = { ...entry, sources: [...sources] };
    writeConfig(c);
    return sources.has(channelId);
}

function getTranslationConfig(guildId) {
    const value = readConfig()[guildId];
    return typeof value === 'object' ? value : { output: value || null, sources: [] };
}

function getTranslationChannel(guildId) {
    return getTranslationConfig(guildId).output || null;
}

// --- 快取機制 ---
const translationCache = new Map();

function rememberTranslation(key, value) {
    translationCache.set(key, value);
    if (translationCache.size > 1000) translationCache.delete(translationCache.keys().next().value);
}

// 核心翻譯：使用 Google Gemini API（一次生成繁中與英文，節省請求次數）
async function translateWithGemini(text) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        console.error('[Translation] 未設定 GEMINI_API_KEY！');
        return { zh: text, en: text };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const prompt = `You are a translator for a Discord bot. Translate the following user message into Traditional Chinese (zh-TW) and English (en).
Return ONLY a raw JSON object with keys "zh" and "en". Do not add Markdown code blocks, backticks, or any extra text.

Message to translate:
"${text}"`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            }),
            signal: controller.signal
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`HTTP ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        
        // 清理 AI 可能包裹的 markdown json 標籤
        const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        return {
            zh: parsed.zh || text,
            en: parsed.en || text
        };
    } catch (err) {
        console.error('[Translation Error]', err.message);
        return { zh: `${text} *(翻譯連線失敗)*`, en: `${text} *(Translation Failed)*` };
    } finally {
        clearTimeout(timer);
    }
}

// 雙語翻譯入口
async function translateBoth(text) {
    const clean = String(text || '').trim().slice(0, 1500);
    if (!clean) return { zh: '', en: '' };

    const cacheKey = `both:${clean}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    const result = await translateWithGemini(clean);
    rememberTranslation(cacheKey, result);
    return result;
}

// --- 訊息處理核心 logic ---
async function handleTranslationMessage(client, message) {
    if (!message?.guild || message.author?.bot || message.webhookId) return;

    const config = getTranslationConfig(message.guild.id);
    const targetId = config.output;
    const sources = Array.isArray(config.sources) ? config.sources : [];

    if (!targetId || targetId === message.channel.id || !sources.includes(message.channel.id)) return;

    const rawText = message.content || '';
    const attachments = [...(message.attachments?.values?.() || [])];
    const attachmentUrls = attachments.map(a => a.url);

    if (!rawText.trim() && attachmentUrls.length === 0) return;

    const targetChannel = await client.channels.fetch(targetId).catch(() => null);
    if (!targetChannel?.isTextBased?.()) return;

    const cleanRaw = rawText.trim();
    
    // 一次呼叫 Gemini 取得繁中與英文翻譯
    const translations = cleanRaw 
        ? await translateBoth(cleanRaw) 
        : { zh: '', en: '' };

    // Embed UI 打造
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
            name: `${message.author.displayName || message.author.username} (@${message.author.username})`,
            iconURL: message.author.displayAvatarURL({ dynamic: true }),
            url: message.url // 點擊發言者頭像/名字可跳轉
        })
        .setTitle('💬 點此前往原始訊息 / Jump to Message')
        .setURL(message.url) // 提供明確跳轉連結
        .setTimestamp(message.createdAt || new Date())
        .setFooter({
            text: `來自頻道 #${message.channel.name}`,
            iconURL: message.guild.iconURL({ dynamic: true })
        });

    // 1. 原始內容
    if (cleanRaw) {
        embed.addFields({
            name: '📝 原始訊息 / Original',
            value: cleanRaw.slice(0, 1024),
            inline: false
        });
    }

    // 2. 繁體中文欄位
    if (cleanRaw) {
        embed.addFields({
            name: '🇹🇼 繁體中文',
            value: translations.zh.slice(0, 1024),
            inline: false
        });
    }

    // 3. English 欄位
    if (cleanRaw) {
        embed.addFields({
            name: '🇺🇸 English',
            value: translations.en.slice(0, 1024),
            inline: false
        });
    }

    // 4. 附件與圖片處理
    if (attachmentUrls.length > 0) {
        const imageAttachment = attachments.find(a => a.contentType?.startsWith('image/'));
        if (imageAttachment) {
            embed.setImage(imageAttachment.url); // 自動預覽第一張圖片
        }

        const attachmentLinks = attachmentUrls.map((url, i) => `[附件 ${i + 1}](${url})`).join(' • ');
        embed.addFields({
            name: '📎 附件 / Attachments',
            value: attachmentLinks.slice(0, 1024),
            inline: false
        });
    }

    await targetChannel.send({ embeds: [embed] })
        .catch(err => console.error('[Translation] 發送失敗:', err.message));
}

module.exports = {
    setTranslationChannel,
    setTranslationOutput,
    setTranslationConfig,
    toggleTranslationSource,
    getTranslationConfig,
    getTranslationChannel,
    handleTranslationMessage
};
