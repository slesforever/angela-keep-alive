// Functions/GameSystem/LanguageSystem.js
// Per-user language preferences and Discord response localization.
'use strict';
const fs = require('fs');
const path = require('path');
const { Message } = require('discord.js');
const CONFIG_PATH = path.join(process.cwd(), 'data', 'language-preferences.json');
const COMMAND_TRANSLATIONS_PATH = path.join(process.cwd(), 'data', 'command-translations.json');
const DEFAULT_LANGUAGE = 'en';

function read() { try { return fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}; } catch { return {}; } }
function write(data) { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function readCommandTranslations() { try { return fs.existsSync(COMMAND_TRANSLATIONS_PATH) ? JSON.parse(fs.readFileSync(COMMAND_TRANSLATIONS_PATH, 'utf8')) : {}; } catch { return {}; } }
function writeCommandTranslations(data) { fs.mkdirSync(path.dirname(COMMAND_TRANSLATIONS_PATH), { recursive: true }); fs.writeFileSync(COMMAND_TRANSLATIONS_PATH, JSON.stringify(data, null, 2), 'utf8'); }
function getLanguage(userId) { const language = read()[userId]; return language === 'zh' ? 'zh' : DEFAULT_LANGUAGE; }
function setLanguage(userId, language) { const data = read(); data[userId] = language === 'zh' ? 'zh' : 'en'; write(data); return data[userId]; }
function languageName(language) { return language === 'en' ? 'English' : '繁體中文'; }
function pick(language, zh, en) { return language === 'en' ? en : zh; }

const TRANSLATION_TIMEOUT_MS = 2200;
const translationCache = new Map();
const inFlightTranslations = new Map();
const commandTranslations = readCommandTranslations();
const HAN_PATTERN = /\p{Script=Han}/u;
const LOCALIZABLE_KEYS = new Set(['title', 'label', 'description', 'placeholder']);

function rememberTranslation(key, value) {
    translationCache.set(key, value);
    if (translationCache.size > 1000) translationCache.delete(translationCache.keys().next().value);
}

function splitText(value, maxLength = 1200) {
    const chunks = [];
    let remaining = value;
    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt < maxLength / 2) splitAt = remaining.lastIndexOf(' ', maxLength);
        if (splitAt < maxLength / 2) splitAt = maxLength;
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

function protectLiteralTokens(value) {
    const tokens = [];
    const protectedText = value.replace(
        /```[\s\S]*?```|`[^`\n]+`|https?:\/\/\S+|<@!?\d+>|<@&\d+>|<#\d+>|<a?:[A-Za-z0-9_]+:\d+>/g,
        token => {
            const marker = `ZXQPROTECTED${tokens.length}QXZ`;
            tokens.push(token);
            return marker;
        }
    );
    return {
        text: protectedText,
        restore(translated) {
            return translated.replace(/ZXQPROTECTED(\d+)QXZ/g, (match, index) => tokens[Number(index)] ?? match);
        }
    };
}

async function translateChunk(value) {
    const key = `en:${value}`;
    if (translationCache.has(key)) return translationCache.get(key);
    if (inFlightTranslations.has(key)) return inFlightTranslations.get(key);

    const pending = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);
        try {
            let out = '';
            if (process.env.DEEPL_API_KEY) {
                const res = await fetch('https://api-free.deepl.com/v2/translate', {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: `text=${encodeURIComponent(value)}&target_lang=EN`
                });
                if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
                const data = await res.json();
                out = Array.isArray(data?.translations) ? data.translations.map(t => t.text).join('').trim() : '';
            } else {
                const gRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(value)}`, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }
                });
                if (!gRes.ok) throw new Error(`Google HTTP ${gRes.status}`);
                const gData = await gRes.json();
                const segments = Array.isArray(gData?.[0]) ? gData[0] : [];
                out = segments.map(s => (Array.isArray(s) ? s[0] : '')).join('').trim();
            }
            if (!out) return value;
            rememberTranslation(key, out);
            return out;
        } catch {
            return value;
        } finally {
            clearTimeout(timer);
        }
    })();

    inFlightTranslations.set(key, pending);
    try {
        return await pending;
    } finally {
        if (inFlightTranslations.get(key) === pending) inFlightTranslations.delete(key);
    }
}

async function translateText(text) {
    const value = String(text ?? '');
    if (!value.trim() || !HAN_PATTERN.test(value)) return value;

    const protectedValue = protectLiteralTokens(value);
    const chunks = splitText(protectedValue.text);
    const translated = await Promise.all(chunks.map(translateChunk));
    return protectedValue.restore(translated.join(''));
}

async function localizeEmbed(embed) {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : { ...embed };
    const result = { ...data };
    if (result.title) result.title = (await translateText(result.title)).slice(0, 256);
    if (result.description) result.description = (await translateText(result.description)).slice(0, 4096);
    if (result.footer?.text) result.footer = { ...result.footer, text: (await translateText(result.footer.text)).slice(0, 2048) };
    if (result.author?.name) result.author = { ...result.author, name: (await translateText(result.author.name)).slice(0, 256) };
    if (Array.isArray(result.fields)) result.fields = await Promise.all(result.fields.map(async field => ({
        ...field,
        name: (await translateText(field.name)).slice(0, 256),
        value: (await translateText(field.value)).slice(0, 1024)
    })));
    return result;
}

async function localizeComponents(value, parentKey = '') {
    if (Array.isArray(value)) return Promise.all(value.map(item => localizeComponents(item, parentKey)));
    if (!value || typeof value !== 'object') return value;

    const data = typeof value.toJSON === 'function' ? value.toJSON() : value;
    if (Array.isArray(data)) return localizeComponents(data, parentKey);

    const result = {};
    await Promise.all(Object.entries(data).map(async ([key, child]) => {
        if (typeof child === 'string' && (LOCALIZABLE_KEYS.has(key) || (parentKey === 'choices' && key === 'name'))) {
            const translated = await translateText(child);
            const limit = key === 'label' ? 80 : (key === 'description' || key === 'placeholder' ? 100 : 45);
            result[key] = translated.slice(0, limit);
        } else {
            result[key] = await localizeComponents(child, key);
        }
    }));
    return result;
}

async function localizePayload(userId, payload) {
    if (getLanguage(userId) !== 'en' || payload == null) return payload;
    if (Array.isArray(payload)) return localizeComponents(payload, 'choices');
    const isString = typeof payload === 'string';
    const payloadData = isString
        ? { content: payload }
        : (typeof payload.toJSON === 'function' ? payload.toJSON() : payload);
    const result = { ...payloadData };
    if (result.content) result.content = (await translateText(result.content)).slice(0, 2000);
    if (Array.isArray(result.embeds)) result.embeds = await Promise.all(result.embeds.map(localizeEmbed));
    if (Array.isArray(result.components)) result.components = await localizeComponents(result.components);
    if (result.title) result.title = (await translateText(result.title)).slice(0, 45);
    if (Array.isArray(result.choices)) result.choices = await localizeComponents(result.choices, 'choices');
    return isString ? result.content : result;
}

async function localizeCommandData(value) {
    const data = typeof value?.toJSON === 'function' ? value.toJSON() : value;
    const texts = new Set();

    function collect(node, parentKey = '') {
        if (Array.isArray(node)) {
            for (const item of node) collect(item, parentKey);
        } else if (node && typeof node === 'object') {
            for (const [key, child] of Object.entries(node)) {
                if (typeof child === 'string' && (key === 'description' || (parentKey === 'choices' && key === 'name')) && HAN_PATTERN.test(child)) {
                    texts.add(child);
                } else {
                    collect(child, key);
                }
            }
        }
    }

    collect(data);
    const uniqueTexts = [...texts];
    const translatedTexts = new Map();
    const missingTexts = uniqueTexts.filter(text => !Object.prototype.hasOwnProperty.call(commandTranslations, text));
    for (const text of uniqueTexts.filter(item => Object.prototype.hasOwnProperty.call(commandTranslations, item))) {
        translatedTexts.set(text, commandTranslations[text]);
        rememberTranslation(`en:${text}`, commandTranslations[text]);
    }
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(8, missingTexts.length) }, async () => {
        while (nextIndex < missingTexts.length) {
            const index = nextIndex++;
            const text = missingTexts[index];
            translatedTexts.set(text, await translateText(text));
        }
    });
    await Promise.all(workers);
    let cacheChanged = false;
    for (const [source, translated] of translatedTexts) {
        if (typeof translated === 'string' && !HAN_PATTERN.test(translated) && commandTranslations[source] !== translated) {
            commandTranslations[source] = translated;
            cacheChanged = true;
        }
    }
    if (cacheChanged) {
        try { writeCommandTranslations(commandTranslations); }
        catch (error) { console.warn('[Language] Could not save command translations:', error.message); }
    }

    function replace(node, parentKey = '') {
        if (Array.isArray(node)) return node.map(item => replace(item, parentKey));
        if (!node || typeof node !== 'object') return node;
        const result = {};
        for (const [key, child] of Object.entries(node)) {
            if (typeof child === 'string' && (key === 'description' || (parentKey === 'choices' && key === 'name')) && translatedTexts.has(child)) {
                result[key] = translatedTexts.get(child).slice(0, 100);
            } else {
                result[key] = replace(child, key);
            }
        }
        return result;
    }

    return replace(data);
}

function localizeInteraction(interaction) {
    if (!interaction?.user?.id || interaction.__languageWrapped) return interaction;
    interaction.__languageWrapped = true;
    for (const method of ['reply', 'editReply', 'followUp', 'update', 'showModal', 'respond']) {
        if (typeof interaction[method] !== 'function') continue;
        const original = interaction[method].bind(interaction);
        interaction[method] = async (...args) => {
            const [payload, ...rest] = args;
            try {
                const translated = await Promise.race([
                    localizePayload(interaction.user.id, payload),
                    new Promise(resolve => setTimeout(() => resolve(payload), 2400))
                ]);
                return original(translated, ...rest);
            } catch {
                return original(payload, ...rest);
            }
        };
    }
    return interaction;
}

if (Message?.prototype?.reply && !Message.prototype.reply.__languageLocalized) {
    const originalReply = Message.prototype.reply;
    const localizedReply = async function (payload, ...args) {
        if (!this.author?.id || getLanguage(this.author.id) !== 'en') {
            return originalReply.call(this, payload, ...args);
        }
        try {
            const translated = await Promise.race([
                localizePayload(this.author.id, payload),
                new Promise(resolve => setTimeout(() => resolve(payload), 2400))
            ]);
            return originalReply.call(this, translated, ...args);
        } catch {
            return originalReply.call(this, payload, ...args);
        }
    };
    localizedReply.__languageLocalized = true;
    Message.prototype.reply = localizedReply;
}

module.exports = { getLanguage, setLanguage, languageName, pick, translateText, localizePayload, localizeCommandData, localizeInteraction };
