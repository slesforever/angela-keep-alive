// Functions/GameSystem/TranslationSystem.js
// 指定頻道自動翻譯：同時輸出繁中與英文
'use strict';
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const CONFIG_PATH = path.join(process.cwd(), 'data', 'translation-config.json');
function readConfig() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
function writeConfig(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function setTranslationChannel(guildId, channelId) { const c = readConfig(); c[guildId] = { ...(typeof c[guildId] === 'object' ? c[guildId] : {}), output: channelId }; writeConfig(c); }
function setTranslationOutput(guildId, channelId) { setTranslationChannel(guildId, channelId); }
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
function getTranslationChannel(guildId) { return getTranslationConfig(guildId).output || null; }

async function translate(text, target) {
    const clean = String(text || '').trim().slice(0, 1500);
    if (!clean) return '（無文字內容）';
    const base = process.env.TRANSLATE_API_URL || 'https://api.mymemory.translated.net/get';
    const url = `${base}?q=${encodeURIComponent(clean)}&langpair=auto|${encodeURIComponent(target)}`;
    try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = await response.json();
        return data?.responseData?.translatedText || clean;
    } catch (err) {
        console.error('[Translation] 翻譯失敗:', err.message);
        return clean;
    }
}

async function handleTranslationMessage(client, message) {
    if (!message?.guild || message.author?.bot || message.webhookId) return;
    const config = getTranslationConfig(message.guild.id);
    const targetId = config.output;
    const sources = Array.isArray(config.sources) ? config.sources : [];
    if (!targetId || targetId === message.channel.id || !sources.includes(message.channel.id)) return;
    const text = message.content || '';
    const attachmentLines = [...(message.attachments?.values?.() || [])].map(a => a.url).join('\n');
    if (!text.trim() && !attachmentLines) return;
    const target = await client.channels.fetch(targetId).catch(() => null);
    if (!target?.isTextBased?.()) return;
    const [zh, en] = await Promise.all([translate(text, 'zh-TW'), translate(text, 'en')]);
    const embed = new EmbedBuilder()
        .setTitle('🌐 頻道翻譯 / Channel Translation')
        .setColor(0x5865f2)
        .addFields(
            { name: '中文（繁體）', value: zh.slice(0, 1024), inline: false },
            { name: 'English', value: en.slice(0, 1024), inline: false },
        )
        .setFooter({ text: `${message.author.tag} ｜ #${message.channel.name}` })
        .setTimestamp(message.createdAt || new Date());
    if (attachmentLines) embed.addFields({ name: '附件 / Attachments', value: attachmentLines.slice(0, 1024) });
    await target.send({ embeds: [embed] }).catch(err => console.error('[Translation] 發送失敗:', err.message));
}

module.exports = { setTranslationChannel, setTranslationOutput, toggleTranslationSource, getTranslationConfig, getTranslationChannel, handleTranslationMessage };
