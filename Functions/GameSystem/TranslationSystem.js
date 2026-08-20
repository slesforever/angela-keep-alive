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
function getTranslationChannel(guildId) { return getTranslationConfig(guildId).output || null; }

const TRANSLATION_TIMEOUT_MS = 2000;
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
      const key = target + ':' + clean;
      if (translationCache.has(key) || Date.now() < translationDisabledUntil || activeTranslations >= TRANSLATION_MAX_CONCURRENT) return translationCache.get(key) || clean;
      activeTranslations += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
      try {
          const gRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(clean)}`, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
          if (!gRes.ok) throw new Error(`HTTP ${gRes.status}`);
          const gData = await gRes.json();
          const segments = Array.isArray(gData?.[0]) ? gData[0] : [];
          const out = segments.map(s => (Array.isArray(s) ? s[0] : '')).join('').trim();
          if (!out) return clean;
          rememberTranslation(key, out); translationDisabledUntil = 0; return out;
      } catch { translationDisabledUntil = Date.now() + TRANSLATION_COOLDOWN_MS; return clean; }
      finally { clearTimeout(timer); activeTranslations -= 1; }
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

module.exports = { setTranslationChannel, setTranslationOutput, setTranslationConfig, toggleTranslationSource, getTranslationConfig, getTranslationChannel, handleTranslationMessage };
