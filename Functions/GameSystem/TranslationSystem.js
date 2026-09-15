// Functions/GameSystem/TranslationSystem.js
    // 免費公開翻譯端點；翻譯失敗時保留原文，不阻塞 Discord
    'use strict';
    const fs = require('fs');
    const path = require('path');
    const { EmbedBuilder } = require('discord.js');
    const CONFIG_PATH = path.join(process.cwd(), 'data', 'translation-config.json');
    const TIMEOUT_MS = 5000;
    const COOLDOWN_MS = 30000;
    const cache = new Map();
    let disabledUntil = 0;
    function readConfig() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
    function writeConfig(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
    function setTranslationChannel(guildId, channelId) { const c = readConfig(); c[guildId] = { ...(typeof c[guildId] === 'object' ? c[guildId] : {}), output: channelId }; writeConfig(c); }
    function setTranslationOutput(guildId, channelId) { setTranslationChannel(guildId, channelId); }
    function setTranslationConfig(guildId, config = {}) { const c = readConfig(); c[guildId] = { output: config.output ? String(config.output) : null, sources: Array.isArray(config.sources) ? [...new Set(config.sources.filter(Boolean).map(String))] : [] }; writeConfig(c); }
    function toggleTranslationSource(guildId, channelId) { const c = readConfig(); const entry = typeof c[guildId] === 'object' ? c[guildId] : { output: c[guildId] || null }; const sources = new Set(entry.sources || []); if (sources.has(channelId)) sources.delete(channelId); else sources.add(channelId); c[guildId] = { ...entry, sources: [...sources] }; writeConfig(c); return sources.has(channelId); }
    function getTranslationConfig(guildId) { const value = readConfig()[guildId]; return typeof value === 'object' ? value : { output: value || null, sources: [] }; }
    function getTranslationChannel(guildId) { return getTranslationConfig(guildId).output || null; }
    function remember(key, value) { cache.set(key, value); if (cache.size > 1000) cache.delete(cache.keys().next().value); }
    async function translateOne(text, target) {
      const clean = String(text || '').trim().slice(0, 1500); if (!clean) return '';
      const key = target + ':' + clean; if (cache.has(key)) return cache.get(key); if (Date.now() < disabledUntil) return clean;
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
          const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(clean);
          const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json(); const out = (Array.isArray(data?.[0]) ? data[0] : []).map(s => Array.isArray(s) ? s[0] : '').join('').trim();
          if (!out) return clean; remember(key, out); disabledUntil = 0; return out;
      } catch { disabledUntil = Date.now() + COOLDOWN_MS; return clean; } finally { clearTimeout(timer); }
    }
    async function translateBoth(text) { const clean = String(text || '').trim().slice(0, 1500); if (!clean) return { zh: '', en: '' }; return { zh: await translateOne(clean, 'zh-TW'), en: await translateOne(clean, 'en') }; }
    async function handleTranslationMessage(client, message) {
      if (!message?.guild || message.author?.bot || message.webhookId) return;
      const config = getTranslationConfig(message.guild.id); const targetId = config.output; const sources = Array.isArray(config.sources) ? config.sources : [];
      if (!targetId || targetId === message.channel.id || !sources.includes(message.channel.id)) return;
      const raw = message.content || ''; const attachments = [...(message.attachments?.values?.() || [])]; const urls = attachments.map(a => a.url); if (!raw.trim() && !urls.length) return;
      const channel = await client.channels.fetch(targetId).catch(() => null); if (!channel?.isTextBased?.()) return;
      const translations = raw.trim() ? await translateBoth(raw) : { zh: '', en: '' };
      const embed = new EmbedBuilder().setColor(0x5865f2).setAuthor({ name: (message.author.displayName || message.author.username) + ' (@' + message.author.username + ')', iconURL: message.author.displayAvatarURL({ dynamic: true }), url: message.url }).setTitle('💬 原始訊息 / Translation').setURL(message.url).setTimestamp(message.createdAt || new Date()).setFooter({ text: '來自頻道 #' + message.channel.name, iconURL: message.guild.iconURL({ dynamic: true }) });
      if (raw.trim()) embed.addFields({ name: '📝 原始訊息 / Original', value: raw.trim().slice(0, 1024), inline: false }, { name: '🇹🇼 繁體中文', value: translations.zh.slice(0, 1024), inline: false }, { name: '🇺🇸 English', value: translations.en.slice(0, 1024), inline: false });
      if (urls.length) { const image = attachments.find(a => a.contentType?.startsWith('image/')); if (image) embed.setImage(image.url); embed.addFields({ name: '📎 附件 / Attachments', value: urls.map((u, i) => '[附件 ' + (i + 1) + '](' + u + ')').join(' • ').slice(0, 1024), inline: false }); }
      await channel.send({ embeds: [embed] }).catch(err => console.error('[Translation] 發送失敗:', err.message));
    }
    module.exports = { setTranslationChannel, setTranslationOutput, setTranslationConfig, toggleTranslationSource, getTranslationConfig, getTranslationChannel, handleTranslationMessage, translateBoth };
    