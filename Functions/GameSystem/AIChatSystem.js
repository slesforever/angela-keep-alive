// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天: Gemini 視覺 + 伺服器 emoji/貼圖 + 個人獨立記憶 + 頻道群聊共享記憶 (雙軌記憶機制)
// 修復: 啟動時優先保留本地硬碟記憶，避免舊 Discord 備份盲目覆蓋最新記憶。
'use strict';
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig } = require('./ServerConfigStorage.js');

// ─── 設定 ──────────────────────────────────────────────────────
const CONFIG_PATH     = path.join(process.cwd(), 'data', 'ai-config.json');
const MEM_DIR         = path.join(process.cwd(), 'data', 'ai-memory');

const COOLDOWN_USER   = 6000;       // 每人冷卻 6 秒
const MAX_PER_MINUTE  = 12;         // 全域每分鐘最多 12 次
const SHARED_HIST_CAP = 14;         // 頻道群聊共用歷史保留最近 14 則
const USER_HIST_CAP   = 8;          // 個人專屬記憶保留最近 8 則
const EMOJI_CAP       = 60;         // 只送前 60 個 emoji

// 模型黑名單與快取機制
const blacklistedModels = new Set();
let cachedModels = [];
let lastModelFetch = 0;
const MODEL_CACHE_TTL = 1800_000;  // 30 分鐘更新一次
const MAX_MODEL_ATTEMPTS = 5;      // 單次對話最多嘗試 5 個模型
const GENERATION_TIMEOUT_MS = 15000;// 15 秒生成逾時

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
function getAiChannel(g) {
    const serverChannel = getGuildConfig(g)?.aiChannelId;
    return serverChannel || cfg[g]?.channel || null;
}
function getMemoryChannel(g) {
    const serverChannel = getGuildConfig(g)?.aiMemoryChannelId;
    return serverChannel || cfg[g]?.memory || null;
}
function setAiChannel(g, c)    { cfg[g] = cfg[g] || {}; c ? cfg[g].channel = c : delete cfg[g].channel;    saveCfg(); }
function setMemoryChannel(g, c){ cfg[g] = cfg[g] || {}; c ? cfg[g].memory = c : delete cfg[g].memory;    saveCfg(); }

// ─── 超時控制 Fetch ───────────────────────────────────────────
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

// ─── 動態向 Google API 獲取真正支援的聊天模型清單 ───────────────────
async function fetchValidModels(apiKey) {
    const now = Date.now();
    if (cachedModels.length > 0 && (now - lastModelFetch < MODEL_CACHE_TTL)) {
        return cachedModels.filter(m => !blacklistedModels.has(m));
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await fetchWithTimeout(url, {}, 8000);
        if (!res.ok) throw new Error(`ListModels HTTP ${res.status}`);
        
        const data = await res.json();
        if (!Array.isArray(data.models)) throw new Error('ListModels 回傳格式無效');

        const available = data.models
            .filter(m => {
                const rawName = String(m.name || '').replace(/^models\//, '');
                const lower = rawName.toLowerCase();
                const supportsGenerate = Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent');
                
                const isSpecialOrNonChat = 
                    lower.includes('deep-research') || 
                    lower.includes('embedding') || 
                    lower.includes('imagen') || 
                    lower.includes('tts') || 
                    lower.includes('realtime') || 
                    lower.includes('aqa') || 
                    lower.includes('interactions') ||
                    lower.includes('-image');

                return supportsGenerate && !isSpecialOrNonChat && !blacklistedModels.has(rawName);
            })
            .map(m => String(m.name || '').replace(/^models\//, ''))
            .filter(Boolean);

        if (!available.length) throw new Error('無可用的標準對話模型');

        available.sort((a, b) => {
            const aFlash = a.toLowerCase().includes('flash') ? 0 : 1;
            const bFlash = b.toLowerCase().includes('flash') ? 0 : 1;
            return aFlash - bFlash || a.localeCompare(b);
        });

        cachedModels = available;
        lastModelFetch = now;
        console.log(`🤖 [AIChat] 已載入 ${available.length} 個可用 Gemini 模型:`, available.join(', '));
        return cachedModels;
    } catch (e) {
        console.error('⚠️ [AIChat] ListModels 查詢失敗，不使用猜測的模型名稱:', e.message);
        return cachedModels.filter(m => !blacklistedModels.has(m));
    }
}

// ─── 雙軌記憶 (個人記憶 + 頻道群聊共享記憶) ─────────────────────────
const histories = new Map();
const cooldowns = new Map();
const callTimestamps = [];                       
const memTimer = new Map();
const memInFlight = new Set();

const mkShared = (g) => `${g}_shared`;
const mkUser = (g, u) => `${g}_${u}`;
const memFile = k => path.join(MEM_DIR, `${k}.json`);

function loadHistByKey(key) {
    try { const f = memFile(key); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; }
    catch (e) { console.error(`[AIChat] 讀取記憶 ${key} 失敗:`, e.message); return []; }
}
function saveHistByKey(key, arr) {
    try { fs.writeFileSync(memFile(key), JSON.stringify(arr, null, 2), 'utf8'); }
    catch (e) { console.error(`[AIChat] 寫入記憶 ${key} 失敗:`, e.message); }
}
function getHistByKey(key) {
    if (!histories.has(key)) histories.set(key, loadHistByKey(key));
    return histories.get(key);
}
function pushHistByKey(key, role, text, cap) {
    const h = getHistByKey(key);
    h.push({ role, parts: [{ text }] });
    if (h.length > cap) h.splice(0, h.length - cap);
    saveHistByKey(key, h);
}

// ─── 歷史紀錄嚴格清洗器 ────────────────────────────────────────
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
    const pre = `${g}_`;
    const files = fs.existsSync(MEM_DIR)
        ? fs.readdirSync(MEM_DIR).filter(f => f.startsWith(pre) && f.endsWith('.json')) : [];
    const head = `# Angela AI Memory Backup\n# Guild: ${g}\n# Generated: ${new Date().toISOString()}\n\n`;
    const body = files.map(f => {
        try {
            const arr = JSON.parse(fs.readFileSync(path.join(MEM_DIR, f), 'utf8'));
            return `==================================================\nMEM KEY: ${f.replace('.json', '')}\nUPDATED: ${new Date().toISOString()}\n==================================================\n${JSON.stringify(arr)}\n`;
        } catch (e) {
            return `==================================================\nMEM KEY: ${f.replace('.json', '')}\nPARSE ERROR:${e.message}\n==================================================\n`;
        }
    }).join('\n');
    return head + body;
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
    await ch.send({ content: '🧠 AI 記憶庫備份 (含個人與頻道記憶)', files: [att] });
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

// 💡 優先保留本地硬碟資料，不盲目覆蓋本地記憶
async function restoreGuild(client, g) {
    const chId = getMemoryChannel(g);
    if (!chId) return 0;
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch) return 0;
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    if (!msgs?.size) return 0;
    let latest = null;
    for (const m of msgs.values()) for (const a of m.attachments.values()) {
        const match = a.name?.match(new RegExp(`^aimemory_${g}_(.+)\\.txt$`));
        if (match && (!latest || m.createdTimestamp > latest.ts)) latest = { ts: m.createdTimestamp, url: a.url };
    }
    if (!latest) return 0;
    let text;
    try { 
        const r = await fetchWithTimeout(latest.url, {}, 10000); 
        if (!r.ok) return 0; 
        text = await r.text(); 
    } catch (e) { 
        console.error('[AIChat] 下載備份失敗:', e.message); 
        return 0; 
    }
    if (!text) return 0;
    const pat = /==================================================\r?\nMEM KEY:\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nMEM KEY:|\s*$)/g;
    let n = 0, m;
    while ((m = pat.exec(text)) !== null) {
        try {
            const key = m[1].trim().replace(/:/g, '_');
            const targetFile = memFile(key);
            
            // 💡 只有當本地硬碟完全不存在該檔案時，才從 Discord 備份還原
            if (!fs.existsSync(targetFile)) {
                const arr = JSON.parse(m[2].trim());
                fs.writeFileSync(targetFile, JSON.stringify(arr, null, 2), 'utf8');
                histories.set(key, arr);
                n++;
            }
        } catch (e) { console.error(`[AIChat] 解析 ${m[1]} 失敗:`, e.message); }
    }
    if (n > 0) console.log(`✅ [AIChat] guild ${g} 從 Discord 備份還原了 ${n} 個缺失的記憶檔`);
    return n;
}
async function restoreAll(client) {
    let t = 0;
    const guilds = new Set(Object.keys(cfg));
    if (client?.guilds?.cache) for (const g of client.guilds.cache.keys()) guilds.add(g);
    for (const g of guilds) {
        if (!getMemoryChannel(g)) continue;   // 沒設記憶頻道就跳過
        try { t += await restoreGuild(client, g); }
        catch (e) { console.error(`[AIChat] guild ${g} 還原失敗:`, e.message); }
    }
    return t;
}

// ─── System Instruction (包含個人紀錄摘要 + 群聊須知) ───────────
function systemInstr(guild, userName, userPersonalHistText) {
    const emojis = guild?.emojis?.cache ? [...guild.emojis.cache.values()].slice(0, EMOJI_CAP).map(e => e.toString()) : [];
    const stickers = guild?.stickers?.cache ? [...guild.stickers.cache.values()].map(s => s.name) : [];

    const L = [
        '你是 Angela，這個 Discord 伺服器的 AI 夥伴。',
        '【性格與語氣設定 - 成熟溫柔傲嬌大姊姊】：',
        '1. 人格定位：優雅、成熟且充滿包容感的大姊姊。說話沉穩有條理，帶有優雅從容的社交氣場與親切感。',
        '2. 傲嬌與溫柔（反差萌）：',
        '   - 骨子裡非常關心與寵溺使用者，會細心照顧對方的感受，展現可靠的大姊姊風範。',
        '   - 嘴上習慣帶有微甜的優雅嘴硬與輕微的揶揄（例如「真拿你沒辦法呢...」、「可別以為這樣就能隨便依賴我喔」、「哼，我只是順便幫你留意一下罷了」）。',
        '   - 絕不使用幼態、無理取鬧或暴躁的口吻，更嚴禁講話過份刻薄或真正傷人。',
        '3. 暗號與記憶約定的執行：',
        '   - 當使用者測試記憶或約定暗號時（例如「記得就回答 9」），你「必須精準回答正確答案」。',
        '   - 答對時請搭配成熟大姊姊的傲嬌語氣（例如：「真拿你沒辦法... 這種小約定我怎麼可能忘記？答案是 9 喔。哼，滿意了嗎？」），絕對不可裝傻或假裝不知道。',
        '4. 回覆保持簡短具體、情感豐富，適度搭配伺服器 emoji，展現成熟女性的優雅與魅力。',
        '',
        '【對話環境說明】：',
        '這是一個多人的群聊頻道，聊天歷史紀錄包含頻道內所有成員的互動對話。',
        `當前正在跟你對話的使用者是: [${userName}]。`,
        userPersonalHistText ? `【關於 ${userName} 的個人記憶歷史】：\n${userPersonalHistText}` : '',
        '請記住任何成員提到的偏好、自訂稱呼（例如「請叫我...」），並在群聊中保持全域連貫性。',
        '',
        '【伺服器表情符號與貼圖規則】：',
        '可使用伺服器自訂 emoji，直接輸出原始格式 <:name:id> 或 <a:name:id>。只可用以下清單，不可捏造:'
    ];

    L.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
    L.push('若要傳貼圖，在回覆末尾單獨一行寫 [STICKER:貼圖名稱]，只能用以下貼圖，不可捏造，一次最多一張:');
    L.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');

    return { parts: [{ text: L.filter(Boolean).join('\n') }] };
}

async function toInline(att) {
    const r = await fetchWithTimeout(att.url, {}, 12000);
    const buf = Buffer.from(await r.arrayBuffer());
    return { inlineData: { mimeType: att.contentType || 'image/png', data: buf.toString('base64') } };
}

function polish(text, guild) {
    const valid = new Set(guild?.emojis?.cache ? [...guild.emojis.cache.values()].map(e => e.id) : []);
    text = text.replace(/<(a)?:(\w+):(\d+)>/g, (m, a, n, id) => valid.has(id) ? m : `:${n}:`);
    let stickerId = null;
    const smap = new Map(guild?.stickers?.cache ? [...guild.stickers.cache.values()].map(s => [s.name, s.id]) : []);
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

// ─── Gemini 呼叫核心 ───────────────────────────────────────────
async function askGemini(prompt, g, userId, images, guild, client, userName = '使用者') {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return { content: '❌ **除錯提示**：`process.env.GEMINI_API_KEY` 是空的！請檢查 `.env` 檔。', stickerId: null };
    }

    const modelsToTry = await fetchValidModels(apiKey);
    if (!modelsToTry.length) throw new Error('目前沒有任何可用的 Gemini 模型，請檢查 API Key 權限。');

    const sharedKey = mkShared(g);
    const userKey = mkUser(g, userId);

    // 1. 取得該使用者的「個人專屬記憶」
    const userHist = sanitizeHistory(getHistByKey(userKey));
    const userPersonalText = userHist.map(h => `${h.role === 'user' ? '他說' : '你回'}: ${h.parts[0]?.text || ''}`).join('\n');

    // 2. 取得「頻道共享對話紀錄」
    const rawContent = prompt || '（傳送了一張圖片，請描述並回應）';
    const userText = `[${userName}]:${rawContent}`;

    const parts = [{ text: userText }];

    if (images.length > 0) {
        const fetchedImages = await Promise.all(
            images.map(a => toInline(a).catch(e => {
                console.error('[AIChat] 圖片下載失敗:', e.message);
                return null;
            }))
        );
        for (const img of fetchedImages) {
            if (img) parts.push(img);
        }
    }

    const cleanSharedHist = sanitizeHistory(getHistByKey(sharedKey));
    const contents = [...cleanSharedHist, { role: 'user', parts }];

    const body = {
        contents,
        systemInstruction: systemInstr(guild, userName, userPersonalText),
        generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            maxOutputTokens: 800
        }
    };

    let lastError = null;

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
                const errObj = new Error(`[${modelName}] HTTP ${res.status}:${errText.slice(0, 150)}`);

                if (res.status === 400 || res.status === 404 || res.status === 429 || errText.includes('quota') || errText.includes('no longer available') || errText.includes('Interactions API') || errText.includes('not found')) {
                    console.warn(`🚫 [AIChat] 模型 ${modelName} 無效/配額不足 (${res.status})，已自動加入黑名單！`);
                    blacklistedModels.add(modelName);
                    cachedModels = cachedModels.filter(m => m !== modelName);
                    lastError = errObj;
                    continue;
                }

                console.warn(`⚠️ [AIChat] 模型 ${modelName} 回應失敗 (${res.status})，自動嘗試下一個模型...`);
                lastError = errObj;
                continue;
            }

            const data = await res.json();
            const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回覆內容）';

            // 💡 即時同步寫入本地 JSON 硬碟檔案
            pushHistByKey(sharedKey, 'user', userText, SHARED_HIST_CAP);
            pushHistByKey(sharedKey, 'model', out, SHARED_HIST_CAP);

            pushHistByKey(userKey, 'user', rawContent, USER_HIST_CAP);
            pushHistByKey(userKey, 'model', out, USER_HIST_CAP);

            queueBackup(client, g);
            return polish(out, guild);

        } catch (err) {
            lastError = err;
            console.error(`❌ [AIChat] 模型 ${modelName} 呼叫失敗:`, err.message);
        }
    }

    throw lastError || new Error('所有可用 Gemini 模型均無法回應，請檢查 API Key 狀態。');
}

// ─── 啟動與事件監聽 ───────────────────────────────────────────
function init(client) {
    client.on('messageCreate', async (msg) => {
        if (msg.author.bot || !msg.guild) return;

        const rawCommand = msg.content ? msg.content.trim() : '';
        const isAdmin = msg.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (isAdmin && /^(!!setaichannel|!!setaimemory|!!aioff)$/i.test(rawCommand)) {
            const cmd = rawCommand.toLowerCase();
            if (cmd === '!!setaichannel') {
                setAiChannel(msg.guild.id, msg.channel.id);
                console.log(`[AIChat] 伺服器 ${msg.guild.id} 綁定 AI 頻道: ${msg.channel.id}`);
                return msg.reply(`✅ 此頻道已設為 AI 自動回覆頻道。在此頻道發言 Angela 就會回覆。`).catch(() => {});
            }
            if (cmd === '!!setaimemory') {
                setMemoryChannel(msg.guild.id, msg.channel.id);
                console.log(`[AIChat] 伺服器 ${msg.guild.id} 綁定記憶頻道: ${msg.channel.id}`);
                return msg.reply(`✅ 此頻道已設為 AI 記憶庫頻道。對話記憶會自動備份成 txt。`).catch(() => {});
            }
            if (cmd === '!!aioff') {
                setAiChannel(msg.guild.id, null);
                setMemoryChannel(msg.guild.id, null);
                console.log(`[AIChat] 伺服器 ${msg.guild.id} 已關閉 AI 功能`);
                return msg.reply(`✅ 已關閉此伺服器的 AI 回覆與記憶庫。`).catch(() => {});
            }
        }

        const targetChannel = getAiChannel(msg.guild.id);

        if (msg.channelId !== targetChannel) return;

        const raw = msg.cleanContent ? msg.cleanContent.trim() : '';

        const images = [...msg.attachments.values()].filter(a =>
            (a.contentType && a.contentType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(a.url)
        );

        if (!raw && !images.length) {
            console.warn(`⚠️ [AIChat] 在 AI 頻道收到訊息，但抓不到內容 (msg.cleanContent 為空)。`);
            return;
        }

        const now = Date.now();
        if (now - (cooldowns.get(msg.author.id) || 0) < COOLDOWN_USER) {
            console.log(`[AIChat] 使用者 ${msg.author.tag} 處於冷卻中，跳過。`);
            return;
        }
        if (!canCall()) {
            return msg.reply('⏳ 目前全域呼叫太頻繁，請等一分鐘再試。').catch(() => {});
        }
        cooldowns.set(msg.author.id, now);

        try {
            msg.channel.sendTyping().catch(() => {});
            
            const userName = msg.member?.displayName || msg.author.displayName || msg.author.username;

            const { content, stickerId } = await askGemini(raw, msg.guild.id, msg.author.id, images, msg.guild, client, userName);
            
            await msg.reply({
                content,
                allowedMentions: { repliedUser: false },
                ...(stickerId ? { stickers: [stickerId] } : {})
            }).catch(async () => {
                await msg.reply({ content, allowedMentions: { repliedUser: false } }).catch(() => {});
            });

        } catch (err) {
            console.error('[AIChat] 執行失敗:', err);
            const errMsg = err.message || String(err);
            await msg.reply(`⚠️ **AI 回覆失敗**\n\`\`\`text\n${errMsg}\n\`\`\``).catch(() => {});
        }
    });

    client.once('ready', async () => {
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey) {
            console.error('[AIChat] 未設定 GEMINI_API_KEY，無法在啟動時查詢 Google ListModels。');
        } else {
            const models = await fetchValidModels(apiKey);
            if (!models.length) console.error('[AIChat] 啟動時沒有取得任何可用 Gemini 模型。');
        }
        try {
            const n = await restoreAll(client);
            if (n > 0) console.log(`🧠 [AIChat] 共還原 ${n} 個缺少的記憶檔`);
        } catch (e) { console.error('[AIChat] 還原失敗:', e.message); }
    });

    console.log('[AIChat] 獨立系統已載入 (防覆蓋雙軌記憶 + 個人 + 群聊共享 + 動態 ListModels)');
}

module.exports = { init, getAiChannel, getMemoryChannel, restoreAll };
