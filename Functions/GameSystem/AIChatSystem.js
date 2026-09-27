// Functions/GameSystem/AIChatSystem.js
// 獨立 AI 聊天:Gemini 視覺 + 伺服器 emoji/貼圖 + 每人記憶庫(Discord 頻道 txt 備份/還原)
// 防濫用:每人冷卻 + 每分鐘全域上限 + 歷史/emoji 精簡,避免額度瞬爆。
'use strict';
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');

// ─── 設定 ──────────────────────────────────────────────────────
const CONFIG_PATH     = path.join(process.cwd(), 'data', 'ai-config.json');
const MEM_DIR         = path.join(process.cwd(), 'data', 'ai-memory');
const MODEL           = 'gemini-3.8-flash';

const COOLDOWN_USER   = 6000;   // 每人冷卻 6 秒
const MAX_PER_MINUTE  = 8;      // 全域每分鐘最多 8 次
const HISTORY_CAP     = 12;     // 每人保留最近 12 則
const EMOJI_CAP       = 60;     // 只送前 60 個 emoji

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
function getAiChannel(g)     { return cfg[g]?.channel  || null; }
function getMemoryChannel(g) { return cfg[g]?.memory  || null; }
function setAiChannel(g, c)    { cfg[g] = cfg[g] || {}; c ? cfg[g].channel = c : delete cfg[g].channel;    saveCfg(); }
function setMemoryChannel(g, c){ cfg[g] = cfg[g] || {}; c ? cfg[g].memory = c : delete cfg[g].memory;    saveCfg(); }

// ─── 記憶體 + 磁碟 ─────────────────────────────────────────────
const histories = new Map();
const cooldowns = new Map();
const callTimestamps = [];                       
const memTimer = new Map();
const memInFlight = new Set();

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
    const head = `# Angela AI Memory Backup\n# Guild: ${g}\n# Generated: ${new Date().toISOString()}\n# Users: ${files.length}\n\n`;
    const body = files.map(f => {
        const u = f.slice(pre.length, -5);
        try {
            const arr = JSON.parse(fs.readFileSync(path.join(MEM_DIR, f), 'utf8'));
            return `==================================================\nMEM KEY: ${g}:${u}\nUPDATED: ${new Date().toISOString()}\n==================================================\n${JSON.stringify(arr)}\n`;
        } catch (e) {
            return `==================================================\nMEM KEY: ${g}:${u}\nPARSE ERROR:${e.message}\n==================================================\n`;
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
    try { const r = await fetch(latest.url); if (!r.ok) return 0; text = await r.text(); }
    catch (e) { console.error('[AIChat] 下載備份失敗:', e.message); return 0; }
    if (!text) return 0;
    const pat = /==================================================\r?\nMEM KEY:\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nMEM KEY:|\s*$)/g;
    let n = 0, m;
    while ((m = pat.exec(text)) !== null) {
        try {
            const arr = JSON.parse(m[2].trim());
            fs.writeFileSync(memFile(m[1].trim()), JSON.stringify(arr, null, 2), 'utf8');
            histories.set(m[1].trim(), arr);
            n++;
        } catch (e) { console.error(`[AIChat] 解析 ${m[1]} 失敗:`, e.message); }
    }
    console.log(`✅ [AIChat] guild ${g} 還原 ${n} 個使用者記憶`);
    return n;
}
async function restoreAll(client) {
    let t = 0;
    for (const g of Object.keys(cfg)) {
        try { t += await restoreGuild(client, g); }
        catch (e) { console.error(`[AIChat] guild ${g} 還原失敗:`, e.message); }
    }
    return t;
}

// ─── Gemini 視覺 + emoji/貼圖 ──────────────────────────────────
function systemInstr(guild) {
    const emojis = [...guild.emojis.cache.values()].slice(0, EMOJI_CAP).map(e => e.toString());
    const stickers = [...guild.stickers.cache.values()].map(s => s.name);
    const L = [
        '你是 Angela,這個 Discord 伺服器的聊天夥伴。語氣自然親切,回覆簡短(通常 1~3 句)。',
        '可使用伺服器自訂 emoji,直接輸出原始格式 <:name:id> 或 <a:name:id>。只可用以下清單,不可捏造:'
    ];
    L.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
    L.push('若要傳貼圖,在回覆末尾單獨一行寫 [STICKER:貼圖名稱],只能用以下貼圖,不可捏造,一次最多一張:');
    L.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');

    return { parts: [{ text: L.join('\n') }] };
}

async function toInline(att) {
    const r = await fetch(att.url);
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

async function askGemini(prompt, g, u, images, guild, client) {
    // 【修復】改為動態讀取，防止 dotenv 比 require 晚執行的問題
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return { content: '❌ **除錯提示**：`process.env.GEMINI_API_KEY` 是空的！請檢查 `.env` 檔或環境變數名稱是否拼錯。', stickerId: null };
    }

    const userText = prompt || '（傳送了一張圖片,請描述並回應）';
    const parts = [{ text: userText }];
    for (const a of images) { try { parts.push(await toInline(a)); } catch (e) { console.error('[AIChat] 圖片下載失敗:', e.message); } }

    const cleanHist = sanitizeHistory(getHist(g, u));
    const contents = [...cleanHist, { role: 'user', parts }];

    const body = {
        contents,
        systemInstruction: systemInstr(guild),
        generationConfig: { temperature: 0.9, maxOutputTokens: 600 }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    
    const res = await fetch(url, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // 拋出詳細錯誤給外部捕獲
        throw new Error(`API 請求失敗 [HTTP ${res.status}]:${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '（沒有回覆內容）';

    pushHist(g, u, 'user', userText);
    pushHist(g, u, 'model', out);

    queueBackup(client, g);
    return polish(out, guild);
}

// ─── 啟動(獨立,不動其他腳本)──────────────────────────────────
function init(client) {
    client.on('messageCreate', async (msg) => {
        if (msg.author.bot || !msg.guild) return;

        const isAdmin = msg.member?.permissions?.has(PermissionFlagsBits.Administrator);
        const raw = msg.content.trim();
        if (isAdmin && /^(!!setaichannel|!!setaimemory|!!aioff)$/i.test(raw)) {
            const cmd = raw.toLowerCase();
            if (cmd === '!!setaichannel') {
                setAiChannel(msg.guild.id, msg.channel.id);
                return msg.reply(`✅ 此頻道設為 AI 自動回覆頻道。在這裡發言(可附圖)Angela 就會回覆。`).catch(() => {});
            }
            if (cmd === '!!setaimemory') {
                setMemoryChannel(msg.guild.id, msg.channel.id);
                return msg.reply(`✅ 此頻道設為 AI 記憶庫頻道。對話記憶會備份成 txt,重啟自動讀回。`).catch(() => {});
            }
            if (cmd === '!!aioff') {
                setAiChannel(msg.guild.id, null);
                setMemoryChannel(msg.guild.id, null);
                return msg.reply(`✅ 已關閉此伺服器的 AI 回覆與記憶庫。`).catch(() => {});
            }
        }

        if (msg.channelId !== getAiChannel(msg.guild.id)) return;

        const text = raw;
        const images = [...msg.attachments.values()].filter(a =>
            (a.contentType && a.contentType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(a.url)
        );
        if (!text && !images.length) return;

        const now = Date.now();
        if (now - (cooldowns.get(msg.author.id) || 0) < COOLDOWN_USER) return;
        if (!canCall()) {
            return msg.reply('⏳ 目前太頻繁,請等一分鐘再試。').catch(() => {});
        }
        cooldowns.set(msg.author.id, now);

        try {
            await msg.channel.sendTyping().catch(() => {});
            const { content, stickerId } = await askGemini(text, msg.guild.id, msg.author.id, images, msg.guild, client);
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
            // 【關鍵】直接把真正的錯誤原因噴在 Discord 頻道上！
            const errMsg = err.message || String(err);
            await msg.reply(`⚠️ **AI 回覆失敗**\n\`\`\`text\n${errMsg}\n\`\`\``).catch(() => {});
        }
    });

    client.once('ready', async () => {
        try {
            const n = await restoreAll(client);
            if (n > 0) console.log(`🧠 [AIChat] 共還原 ${n} 個使用者記憶`);
        } catch (e) { console.error('[AIChat] 還原失敗:', e.message); }
    });

    console.log('[AIChat] 獨立系統已載入(視覺 + emoji/貼圖 + 記憶庫 + 防濫用)');
}

module.exports = { init, getAiChannel, getMemoryChannel };
