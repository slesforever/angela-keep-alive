// Functions/GameSystem/TranslationSystem.js
// 指定頻道自動翻譯：雙備援翻譯機制（Lingva + Google）、跳轉連結、多媒體支援與 UI 優化
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

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

// --- 快取與流控 ---
const translationCache = new Map();

function rememberTranslation(key, value) {
    translationCache.set(key, value);
    if (translationCache.size > 1000) translationCache.delete(translationCache.keys().next().value);
}

// 核心翻譯 1：Lingva API (Google 免費開源替代代理，不易被 Ban)
async function translateLingva(text, target) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const url = `https://lingva.ml/api/v1/auto/${target}/${encodeURIComponent(text)}`;
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) throw new Error(`Lingva HTTP ${res.status}`);
        const data = await res.json();
        return data.translation?.trim() || null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// 核心翻譯 2：Google GTX API (備援機制)
async function translateGoogle(text, target) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
        const data = await res.json();
        const segments = Array.isArray(data?.[0]) ? data[0] : [];
        const result = segments.map(s => (Array.isArray(s) ? s[0] : '')).join('').trim();
        return result || null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// 雙備援翻譯主入口
async function translate(text, target) {
    const clean = String(text || '').trim().slice(0, 1500);
    if (!clean) return '';

    const cacheKey = `${target}:${clean}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    // 先用 Lingva，失敗自動降級到 Google GTX
    let result = await translateLingva(clean, target);
    if (!result) {
        result = await translateGoogle(clean, target);
    }

    // 若都失敗，回傳原文
    const finalResult = result || clean;
    rememberTranslation(cacheKey, finalResult);
    return finalResult;
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

    // 並發執行繁中與英文翻譯
    const [zhText, enText] = await Promise.all([
        rawText.trim() ? translate(rawText, 'zh-TW') : Promise.resolve(''),
        rawText.trim() ? translate(rawText, 'en') : Promise.resolve('')
    ]);

    const cleanRaw = rawText.trim();
    const cleanZh = zhText.trim() || cleanRaw;
    const cleanEn = enText.trim() || cleanRaw;

    // Embed UI 打造
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
            name: `${message.author.displayName || message.author.username} (@${message.author.username})`,
            iconURL: message.author.displayAvatarURL({ dynamic: true }),
            url: message.url // 點擊發言者可跳轉
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

    // 2. 繁體中文欄位（固定呈現）
    embed.addFields({
        name: '🇹🇼 繁體中文',
        value: cleanZh.slice(0, 1024),
        inline: false
    });

    // 3. English 欄位（固定呈現）
    embed.addFields({
        name: '🇺🇸 English',
        value: cleanEn.slice(0, 1024),
        inline: false
    });

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
