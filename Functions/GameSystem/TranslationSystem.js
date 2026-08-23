// Functions/GameSystem/TranslationSystem.js
// 指定頻道自動翻譯：同時輸出繁中與英文，附帶原訊息與跳轉連結
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'translation-config.json');

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

// 翻譯快取與流量控制配置
const TRANSLATION_TIMEOUT_MS = 3000;
const TRANSLATION_COOLDOWN_MS = 60_000;
const TRANSLATION_MAX_CONCURRENT = 4;
const translationCache = new Map();
let activeTranslations = 0;
let translationDisabledUntil = 0;

function rememberTranslation(key, value) {
    translationCache.set(key, value);
    if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
}

async function translate(text, target) {
    const clean = String(text || '').trim().slice(0, 1500);
    if (!clean) return '（無文字內容）';
    
    const key = `${target}:${clean}`;
    if (translationCache.has(key)) return translationCache.get(key);
    if (Date.now() < translationDisabledUntil || activeTranslations >= TRANSLATION_MAX_CONCURRENT) {
        return clean;
    }

    activeTranslations += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(clean)}`;
        const gRes = await fetch(url, { 
            signal: controller.signal, 
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } 
        });

        if (!gRes.ok) throw new Error(`HTTP ${gRes.status}`);
        const gData = await gRes.json();
        const segments = Array.isArray(gData?.[0]) ? gData[0] : [];
        const out = segments.map(s => (Array.isArray(s) ? s[0] : '')).join('').trim();
        
        if (!out) return clean;
        
        rememberTranslation(key, out); 
        translationDisabledUntil = 0; 
        return out;
    } catch { 
        translationDisabledUntil = Date.now() + TRANSLATION_COOLDOWN_MS; 
        return clean; 
    } finally { 
        clearTimeout(timer); 
        activeTranslations -= 1; 
    }
}

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

    // 並發進行多語言翻譯
    const [zhText, enText] = await Promise.all([
        rawText.trim() ? translate(rawText, 'zh-TW') : Promise.resolve(''),
        rawText.trim() ? translate(rawText, 'en') : Promise.resolve('')
    ]);

    // 建立 UI 體驗更佳的 Embed
    const embed = new EmbedBuilder()
        .setColor(0x5865F2) // Discord Blurple 主題色
        .setAuthor({
            name: `${message.author.displayName || message.author.username} (@${message.author.username})`,
            iconURL: message.author.displayAvatarURL({ dynamic: true }),
            url: message.url // 點擊作者也可跳轉
        })
        .setTitle('💬 點此前往原始訊息 / Jump to Original Message')
        .setURL(message.url) // 提供明確的跳轉連結
        .setTimestamp(message.createdAt || new Date())
        .setFooter({ 
            text: `來自頻道 #${message.channel.name}`, 
            iconURL: message.guild.iconURL({ dynamic: true }) 
        });

    // 1. 原始內容區塊
    if (rawText.trim()) {
        embed.addFields({ 
            name: '📝 原始訊息 / Original', 
            value: rawText.slice(0, 1024), 
            inline: false 
        });
    }

    // 2. 翻譯內容區塊（繁中與英文）
    if (zhText) {
        embed.addFields({ 
            name: '🇹🇼 繁體中文', 
            value: zhText.slice(0, 1024), 
            inline: false 
        });
    }

    if (enText) {
        embed.addFields({ 
            name: '🇺🇸 English', 
            value: enText.slice(0, 1024), 
            inline: false 
        });
    }

    // 3. 處理附件與圖片預覽
    if (attachmentUrls.length > 0) {
        // 若有圖片，自動將第一張設定為 Embed 的主圖
        const imageAttachment = attachments.find(a => a.contentType?.startsWith('image/'));
        if (imageAttachment) {
            embed.setImage(imageAttachment.url);
        }

        const attachmentText = attachmentUrls.map((url, i) => `[附件 ${i + 1}](${url})`).join(' • ');
        embed.addFields({ 
            name: '📎 附件連結 / Attachments', 
            value: attachmentText.slice(0, 1024), 
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
