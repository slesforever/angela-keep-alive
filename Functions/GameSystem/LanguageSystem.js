// Functions/GameSystem/LanguageSystem.js
// 每位玩家的中文/英文偏好，並對 Discord 指令回覆做保守的即時翻譯
'use strict';
const fs = require('fs');
const path = require('path');
const CONFIG_PATH = path.join(process.cwd(), 'data', 'language-preferences.json');

function read() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
function write(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function getLanguage(userId) { return read()[userId] || 'zh'; }
function setLanguage(userId, language) { const data = read(); data[userId] = language === 'en' ? 'en' : 'zh'; write(data); return data[userId]; }
function languageName(language) { return language === 'en' ? 'English' : '繁體中文'; }
function pick(language, zh, en) { return language === 'en' ? en : zh; }

const TRANSLATION_TIMEOUT_MS = 1200;
    const TRANSLATION_COOLDOWN_MS = 30_000;
    const translationCache = new Map();
    let translationDisabledUntil = 0;
    function rememberTranslation(key, value) {
      translationCache.set(key, value);
      if (translationCache.size > 300) translationCache.delete(translationCache.keys().next().value);
    }
    async function translateText(text) {
      const value = String(text ?? '');
      if (!value.trim() || value.length > 1500) return value;
      const key = value;
      if (translationCache.has(key) || Date.now() < translationDisabledUntil) return translationCache.get(key) || value;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
      try {
          const gRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(value)}`, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
          if (!gRes.ok) throw new Error(`HTTP ${gRes.status}`);
          const gData = await gRes.json();
          const segments = Array.isArray(gData?.[0]) ? gData[0] : [];
          const out = segments.map(s => (Array.isArray(s) ? s[0] : '')).join('').trim();
          if (!out) return value;
          rememberTranslation(key, out);
          translationDisabledUntil = 0;
          return out;
      } catch { translationDisabledUntil = Date.now() + TRANSLATION_COOLDOWN_MS; return value; }
      finally { clearTimeout(timer); }
    }

async function localizeEmbed(embed) {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : { ...embed };
    const result = { ...data };
    if (result.title) result.title = await translateText(result.title);
    if (result.description) result.description = await translateText(result.description);
    if (result.footer?.text) result.footer = { ...result.footer, text: await translateText(result.footer.text) };
    if (result.author?.name) result.author = { ...result.author, name: await translateText(result.author.name) };
    if (Array.isArray(result.fields)) result.fields = await Promise.all(result.fields.map(async field => ({ ...field, name: await translateText(field.name), value: await translateText(field.value) })));
    return result;
}

async function localizePayload(userId, payload) {
    if (getLanguage(userId) !== 'en' || payload == null) return payload;
    const result = typeof payload === 'string' ? { content: payload } : { ...payload };
    if (result.content) result.content = await translateText(result.content);
    if (Array.isArray(result.embeds)) result.embeds = await Promise.all(result.embeds.map(localizeEmbed));
    return typeof payload === 'string' ? result.content : result;
}

function localizeInteraction(interaction) {
    if (!interaction?.user?.id || interaction.__languageWrapped) return interaction;
    interaction.__languageWrapped = true;
    for (const method of ['reply', 'editReply', 'followUp']) {
        if (typeof interaction[method] !== 'function') continue;
        const original = interaction[method].bind(interaction);
          interaction[method] = async payload => {
              const translated = await Promise.race([
                  localizePayload(interaction.user.id, payload),
                  new Promise(resolve => setTimeout(() => resolve(payload), TRANSLATION_TIMEOUT_MS))
              ]);
              return original(translated);
          };
    }
    return interaction;
}

module.exports = { getLanguage, setLanguage, languageName, pick, translateText, localizePayload, localizeInteraction };
