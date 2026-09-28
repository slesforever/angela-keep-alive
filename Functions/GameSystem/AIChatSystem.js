// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天: Gemini 視覺 + 伺服器 emoji/貼圖 + 每人記憶庫(Discord 頻道 txt 備份/還原)
// 防濫用: 每人冷卻 + 每分鐘全域上限 + 歷史/emoji 精簡 + 自動 ListModels 動態智慧獲取/排序可用模型 + 故障秒切。
'use strict';
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { getGuildConfig } = require('./ServerConfigStorage.js');

// ─── 設定 ──────────────────────────────────────────────────────
const CONFIG_PATH     = path.join(process.cwd(), 'data', 'ai-config.json');
const MEM_DIR         = path.join(process.cwd(), 'data', 'ai-memory');

const COOLDOWN_USER   = 5000;      // 每人冷卻 5 秒
const MAX_PER_MINUTE  = 12;     // 全域每分鐘最多 12 次
const HISTORY_CAP     = 10;     // 每人保留最近 10 則乾淨歷史（避免 Context 膨脹）
const EMOJI_CAP       = 60;     // 只送前 60 個 emoji

// 快取經 ListModels API 驗證過的真實可用模型清單
let cachedModels = [];
let lastModelFetch = 0;
const MODEL_CACHE_TTL = 1800_000; // 30 分鐘重新對齊一次
const MAX_MODEL_ATTEMPTS = 3;
const GENERATION_TIMEOUT_MS = 15000; // 15 秒生成逾時，確保回應極速

// 現代極速 Gemini 模型優先級定義
const PREFERRED_MODEL_ORDER = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro'
];

try { fs.mkdirSync(MEM_DIR, { recursive: true }); } catch {}

function readJson(p, fb) {
    try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fb; }
    catch { return fb; }
}
function writeJson(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

const cfg = readJson(CONFIG_PATH, {});
function saveCfg() { writeJson(CONFIG_PATH, cfg); }
function getAiChannel(g) { return getGuildConfig(g)?.aiChannelId || cfg[g]?.channel || null; }
function getMemoryChannel(g) { return getGuildConfig(g)?.aiMemoryChannelId || cfg[g]?.memory || null; }

// ─── 帶有 AbortController 超時控制的 Fetch ──────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('請求逾時（' + (timeoutMs / 1000) + ' 秒）。');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// ─── 動態向 Google ListModels 獲取並「智慧排序」真正支援的模型 ────
async function fetchValidModels(apiKey) {
    const now = Date.now();
    if (cachedModels.length > 0 && (now - lastModelFetch < MODEL_CACHE_TTL)) return cachedModels;

    const fallbackModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

    try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
        const res = await fetchWithTimeout(url, {}, 8000);
        if (!res.ok) throw new Error('ListModels HTTP ' + res.status);
        
        const data = await res.json();
        if (!Array.isArray(data.models)) throw new Error('ListModels 回傳格式無效');

        // 過濾：支援 generateContent，且排除專用/非聊天模型（如 embedding, tts, imagen 等）
        const available = data.models
            .filter(m => {
                const name = String(m.name || '').toLowerCase();
                const supportsGenerate = Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent');
                const isNonChat = name.includes('embedding') || name.includes('tts') || name.includes('imagen') || name.includes('aqa') || name.includes('realtime');
                return supportsGenerate && !isNonChat;
            })
            .map(m => String(m.name || '').replace(/^models\//, ''))
            .filter(Boolean);

        if (!available.length) throw new Error('無可用的 generateContent 模型');

        // 智慧模型排序：高速度、高品質的 Flash 模型排前面
        available.sort((a, b) => {
            const scoreModel = (name) => {
                const lower = name.toLowerCase();
                for (let i = 0; i < PREFERRED_MODEL_ORDER.length; i++) {
                    if (lower === PREFERRED_MODEL_ORDER[i] || lower.startsWith(PREFERRED_MODEL_ORDER[i])) {
                        return i;
                    }
                }
                if (lower.includes('2.0-flash')) return 10;
                if (lower.includes('1.5-flash')) return 20;
                if (lower.includes('flash')) return 30;
                if (lower.includes('pro')) return 50;
                return 100;
            };

            const scoreA = scoreModel(a);
            const scoreB = scoreModel(b);

            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.localeCompare(b);
        });

        cachedModels = available;
        lastModelFetch = now;
        console.log(`🤖 [AIChat] 已從 ListModels 載入並排序 ${available.length} 個可用 Gemini 模型 (首選: ${available.slice(0, 3).join(', ')})`);
        return cachedModels;
    } catch (e) {
        console.error('⚠️ [AIChat] ListModels 查詢失敗，切換至快取或預設模型：', e.message);
        return cachedModels.length > 0 ? cachedModels : fallbackModels;
    }
}

// ─── 記憶體 + 磁碟管理 ─────────────────────────────────────────
const histories = new Map();
const cooldowns = new Map();
const callTimestamps = [];                       
const memTimer = new Map();
const memInFlight = new Set();
const channelHistories = new Map();

function channelFile(g, c) { return path.join(MEM_DIR, 'channel_' + g + '_' + c + '.json'); }
function getChannelHistory(g, c) { const k = 'channel:' + g + ':' + c; if (!channelHistories.has(k)) channelHistories.set(k, readJson(channelFile(g, c), [])); return channelHistories.get(k); }
function pushChannelHistory(g, c, item) { const h = getChannelHistory(g, c); h.push(item); if (h.length > 40) h.splice(0, h.length - 40); writeJson(channelFile(g, c), h); }

const mk = (g, u) => `${g}:${u}`;
const memFile = k => path.join(MEM_DIR, `${k.replace(/:/g, '_')}.json`);

function loadHist(g, u) {
    try { const f = memFile(mk(g, u)); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; }
    catch (e) { console.error('[AIChat] 讀記憶失敗:', e.message); return []; }
}
function saveHist(g, u, arr) {
    try { fs.writeFileSync(memFile(mk(g, u)), JSON.stringify(arr, null, 2), 'utf8'); }
    catch (e) { console.error('[AIChat] 寫記憶失敗:', e.message); }
}
function getHist(g, u) {
    const k = mk(g, u);
    if (!histories.has(k)) histories.set(k, loadHist(g, u));
    return histories.get(k);
}
function pushHist(g, u, role, text) {
    const h = getHist(g, u);
    h.push({ role, parts: [{ text }] });
    if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP);
    saveHist(g, u, h);
}

// ─── 歷史紀錄嚴格清洗器 (確保交替的 user/model 格式) ────────────
function sanitizeHistory(rawHist) {
    if (!Array.isArray(rawHist) || rawHist.length === 0) return [];
    const clean = [];
    let expectedRole = 'user';

    for (const item of rawHist) {
        if (!item || item.role !== expectedRole) continue;
        if (!item.parts || !Array.isArray(item.parts) || !item.parts[0]?.text) continue;
        clean.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }

    if (clean.length > 0 && clean[clean.length - 1].role === 'user') {
        clean.pop();
    }
    return clean;
}

// ─── 頻道記憶備份/還原 ─────────────────────────────────────────
function snapshotText(g) {
    const files = fs.existsSync(MEM_DIR) ? fs.readdirSync(MEM_DIR).filter(f => (f.startsWith(g + '_') || f.startsWith('channel_' + g + '_')) && f.endsWith('.json')) : [];
    const out = ['# Angela AI Memory Backup', '# Guild: ' + g, '# Generated: ' + new Date().toISOString(), '# Records: ' + files.length, ''];
    for (const file of files) {
        const isChannel = file.startsWith('channel_');
        const prefix = isChannel ? 'channel_' + g + '_' : g + '_';
        const id = file.slice(prefix.length, -5);
        let data = [];
        try { data = JSON.parse(fs.readFileSync(path.join(MEM_DIR, file), 'utf8')); } catch (e) { data = { error: e.message }; }
        out.push('==================================================', 'MEM KEY: ' + (isChannel ? 'channel:' : 'user:') + g + ':' + id, 'UPDATED: ' + new Date().toISOString(), '==================================================', JSON.stringify(data), '');
    }
    return out.join('\n');
}

async function sendBackup(client, g) {
    const chId = getMemoryChannel(g);
    if (!chId) return false;
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch) return false;
    const text = snapshotText(g);
    if (!text.trim()) return false;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const att = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `aimemory_${g}_${stamp}.txt` });
    await ch.send({ content: '🧠 AI 記憶庫備份', files: [att] });
    return true;
}

function queueBackup(client, g) {
    if (!getMemoryChannel(g)) return;
    if (memTimer.has(g)) clearTimeout(memTimer.get(g));
    memTimer.set(g, setTimeout(async () => {
        if (memInFlight.has(g)) return;
        memInFlight.add(g);
        try { await sendBackup(client, g); } catch (e) { console.error('[AIChat] 備份失敗:', e.message); }
        finally { memInFlight.delete(g); }
    }, 5000));
}

async function restoreGuild(client, g) {
    const chId = getMemoryChannel(g); if (!chId) return 0;
    const ch = await client.channels.fetch(chId).catch(() => null); if (!ch) return 0;
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null); if (!msgs?.size) return 0;
    let latest = null;
    for (const m of msgs.values()) for (const a of m.attachments.values()) {
        const prefix = 'aimemory_' + g + '_';
        if (a.name?.startsWith(prefix) && a.name.endsWith('.txt') && (!latest || m.createdTimestamp > latest.ts)) latest = { ts: m.createdTimestamp, url: a.url };
    }
    if (!latest) return 0;
    const response = await fetch(latest.url).catch(() => null); if (!response?.ok) return 0;
    const text = await response.text();
    const pattern = /==================================================\r?\nMEM KEY:\s*(user|channel):([^:\r\n]+):([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nMEM KEY:|\s*$)/g;
    let count = 0, match;
    while ((match = pattern.exec(text)) !== null) {
        try {
            const data = JSON.parse(match[4].trim()), type = match[1], id = match[3].trim();
            const file = type === 'channel' ? channelFile(g, id) : memFile(g + '_' + id);
            writeJson(file, data);
            (type === 'channel' ? channelHistories : histories).set(type === 'channel' ? 'channel:' + g + ':' + id : g + ':' + id, Array.isArray(data) ? data : []);
            count++;
        } catch (e) { console.warn('[AIChat] 記憶還原失敗:', e.message); }
    }
    return count;
}

async function restoreAll(client) {
    let t = 0;
    for (const g of client.guilds.cache.keys()) {
        try { t += await restoreGuild(client, g); }
        catch (e) { console.error(`[AIChat] guild ${g} 還原失敗:`, e.message); }
    }
    return t;
}

// ─── Gemini 系統設定與格式化 ───────────────────────────────────
function systemInstr(guild) {
    const emojis = [...guild.emojis.cache.values()].slice(0, EMOJI_CAP).map(e => e.toString());
    const stickers = [...guild.stickers.cache.values()].map(s => s.name);
    const L = [
        '你是 Angela，是這個 Discord 伺服器的聊天夥伴。請自然、連貫、簡潔具體地回應對話，不要空泛敷衍。',
        '配合使用者要求的角色扮演與情境設定，請保持友善活潑。',
        '可使用伺服器自訂 emoji，直接輸出原始格式 <:name:id> 或 <a:name:id>。只可用以下清單，不可捏造:'
    ];
    L.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
    L.push('若要傳貼圖,在回覆末尾單獨一行寫 [STICKER:貼圖名稱],只能用以下貼圖,不可捏造,一次最多一張:');
    L.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');

    return { parts: [{ text: L.join('\n') }] };
}

async function toInline(att) {
    const r = await fetchWithTimeout(att.url, {}, 12000);
    const buf = Buffer.from(await r.arrayBuffer());
    return { inlineData: { mimeType: att.contentType || 'image/png', data: buf.toString('base64') } };
}

function polish(text, guild) {
    const valid = new Set([...guild.emojis.cache.values()].map(e => e.id));
    text = text.replace(/<(a)?:(\w+):(\d+)>/g, (m, a, n, id) => valid.has(id) ? m : `:${n}:`);
    let stickerId = null;
    const smap = new Map([...guild.stickers.cache.values()].map(s => [s.name, s.id]));
    const m = text.match(/\[STICKER:([^\]]+)\]/);
    if (m) {
        const name = m[1].trim();
        if (smap.has(name)) stickerId = smap.get(name);
        text = text.replace(/\[STICKER:[^\]]+\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    return { content: text.slice(0, 2000), stickerId };
}

function canCall() {
    const now = Date.now();
    while (callTimestamps.length && now - callTimestamps[0] > 60_000) callTimestamps.shift();
    if (callTimestamps.length >= MAX_PER_MINUTE) return false;
    callTimestamps.push(now);
    return true;
}

// ─── Gemini 核心呼叫邏輯 ───────────────────────────────────────
async function askGeminiOnly(cleanUserText, fullPromptContext, g, u, images, guild, client, channelId, userName) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error('未設定 GEMINI_API_KEY');

    // 🤖 動態取得 ListModels 已排序的可用模型
    const modelsToTry = await fetchValidModels(apiKey);
    if (!modelsToTry.length) throw new Error('Google ListModels 沒有提供可用的 Gemini 模型，請檢查 API Key 狀態。');

    const promptText = fullPromptContext || '（傳送了一張圖片，請描述並回應）';
    const parts = [{ text: promptText }];
    for (const a of images) { 
        try { parts.push(await toInline(a)); } 
        catch (e) { console.error('[AIChat] 圖片下載失敗:', e.message); } 
    }

    const cleanHist = sanitizeHistory(getHist(g, u));
    const contents = [...cleanHist, { role: 'user', parts }];

    const body = {
        contents,
        systemInstruction: systemInstr(guild),
        generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            maxOutputTokens: 800
        }
    };

    let lastError = null;

    // 🔄 輪流嘗試 ListModels 篩選出最快的真實模型
    for (const modelName of modelsToTry.slice(0, MAX_MODEL_ATTEMPTS)) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, GENERATION_TIMEOUT_MS);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                const errObj = new Error(`[${modelName}] HTTP ${res.status}:${errText.slice(0, 200)}`);
                
                // 遇到過載 (503)、限流 (429)、未找到 (404) 或伺服器錯誤，立刻試下一個模型
                if ([404, 429, 500, 502, 503, 504].includes(res.status)) {
                    console.warn(`⚠️ [AIChat] 模型 ${modelName} 無法即時回應 (${res.status})，切換至下一個模型...`);
                    lastError = errObj;
                    continue; 
                } else {
                    throw errObj;
                }
            }

            const data = await res.json();
            const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回覆內容）';

            // 💡【核心修復】：歷史記憶只寫入乾淨的使用者對話，絕不寫入整包舊紀錄！
            const recordUserText = cleanUserText || '（傳送了圖片）';
            pushHist(g, u, 'user', recordUserText);
            pushHist(g, u, 'model', out);

            if (channelId) {
                pushChannelHistory(g, channelId, { role: 'user', authorId: u, authorName: userName || u, content: recordUserText });
                pushChannelHistory(g, channelId, { role: 'assistant', authorId: client.user?.id || 'bot', authorName: 'Angela', content: out });
            }

            queueBackup(client, g);
            return polish(out, guild);

        } catch (err) {
            lastError = err;
            console.error(`❌ [AIChat] 模型 ${modelName} 呼叫失敗:`, err.message);
        }
    }

    throw lastError || new Error('所有可用 Gemini 模型均無法回應，請檢查 API Key 權限或配額。');
}

const askGemini = askGeminiOnly;

// ─── 啟動與監聽 ──────────────────────────────────────────────
function init(client) {
    client.on('messageCreate', async (msg) => {
        if (msg.author.bot || !msg.guild) return;

        const raw = msg.content.trim();

        if (msg.channelId !== getAiChannel(msg.guild.id)) return;

        const text = raw;
        const images = [...msg.attachments.values()].filter(a =>
            (a.contentType && a.contentType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(a.url)
        );
        if (!text && !images.length) return;

        const now = Date.now();
        if (now - (cooldowns.get(msg.author.id) || 0) < COOLDOWN_USER) return;
        if (!canCall()) {
            return msg.reply('⏳ 目前聊天太頻繁，請等一分鐘再試喔。').catch(() => {});
        }
        cooldowns.set(msg.author.id, now);

        try {
            await msg.channel.sendTyping().catch(() => {});
            const recent = await msg.channel.messages.fetch({ limit: 8 }).catch(() => null);
            const context = recent 
                ? [...recent.values()].reverse().filter(m => !m.system && (m.content || m.attachments?.size)).map(m => '[' + (m.member?.displayName || m.author?.globalName || m.author?.username || 'unknown') + ']: ' + (m.content || '[圖片/附件]')).join('\n') 
                : '';
            
            const authorName = msg.member?.displayName || msg.author.globalName || msg.author.username;
            const fullPromptContext = `[近期頻道對話紀錄]\n${context}\n\n[當前對話者]: ${authorName} (ID: ${msg.author.id})\n[最新訊息]: ${text}`;

            // 第一個參數是使用者真實輸入（存入記憶），第二個參數包含頻道脈絡（給 API 當次參考）
            const { content, stickerId } = await askGemini(
                text, 
                fullPromptContext, 
                msg.guild.id, 
                msg.author.id, 
                images, 
                msg.guild, 
                client, 
                msg.channelId, 
                authorName
            );

            try {
                await msg.reply({
                    content,
                    allowedMentions: { repliedUser: false },
                    ...(stickerId ? { stickers: [stickerId] } : {})
                });
            } catch (sendErr) {
                await msg.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => {});
            }
        } catch (err) {
            console.error('[AIChat] 錯誤詳細資訊:', err);
            const errMsg = err.message || String(err);
            await msg.reply(`⚠️ **AI 回覆失敗**\n\`\`\`text\n${errMsg}\n\`\`\``).catch(() => {});
        }
    });

    client.once('ready', async () => {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
            console.error('[AIChat] 未設定 GEMINI_API_KEY，無法查詢 ListModels。');
        } else {
            const models = await fetchValidModels(apiKey);
            if (!models.length) console.error('[AIChat] 啟動時沒有取得任何可用 Gemini 模型。');
        }
        try {
            const n = await restoreAll(client);
            if (n > 0) console.log(`🧠 [AIChat] 共還原 ${n} 個使用者記憶檔`);
        } catch (e) { console.error('[AIChat] 還原失敗:', e.message); }
    });

    console.log('[AIChat] 獨立 AI 聊天系統已就緒 (ListModels 極速模型排序 + 輕量化記憶)');
}

module.exports = { init, getAiChannel, getMemoryChannel };
