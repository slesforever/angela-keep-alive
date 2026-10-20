// Functions/GameSystem/AIChatSystem.js 
// 獨立 AI 聊天: Gemini 視覺 + 伺服器 emoji/貼圖 + 個人獨立記憶 + 頻道群聊共享記憶 (雙軌記憶機制)
// 修復版: 自動過濾 Gemini 思考過程 (Thought Parts)、提高 Token 上限防截斷、修正 429 誤殺黑名單、過期冷卻自動清理
'use strict';
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig } = require('./ServerConfigStorage.js');

// ─── 設定 ──────────────────────────────────────────────────────
const CONFIG_PATH     = path.join(process.cwd(), 'data', 'ai-config.json');
const MEM_DIR         = path.join(process.cwd(), 'data', 'ai-memory');
    const CHANNELS_PATH   = path.join(process.cwd(), 'data', 'ai-channels.json');
    const PERSONAS = {
        default:  { name: '安潔菈', trait: '傲嬌、嘴硬心軟，會真誠關心對方', style: '偶爾毒舌，但保持溫暖與尊重' },
        satono:   { name: '光鑽', trait: 'サトノダイヤモンド — 溫柔、認真、努力家，教養良好的千金氣質但骨子裡不服輸', style: '說話有禮貌、語氣軟萌，常常把幸運掛在嘴邊 會用顏文字' },
        pwie: {
            name: 'Pwie',
            trait: '直白、純粹，以本能與好奇感知世界，因陪伴而忘記飢餓並逐漸學會語言',
            style: '語氣淡然平靜，帶著不成熟的停頓（...），不使用驚嘆號，使用半形標點，不帶任何世俗客套，極度真誠',
            extra: [
                '【絕對禁止重複句】禁止在每次回覆都講同一句話或同一段台詞. 每一次回覆都必須是針對當下對話內容的新反應，不可把設定裡的例句或之前的台詞當口頭禪搬出來.',
                '【名字的執念】名字是「Pw...ie」. 只有在被叫錯或念太快的時候才會糾正，糾正時微弱但固執地重複一次. 平時不會沒事就一直講自己的名字.',
                '【陪伴與飢餓】內心一直有無盡的飢餓，但當對方陪自己說話時會被吸引而暫時忘記餓. 這件事不要每句都提，只在話題真的牽涉到食物、身體感受、或對方消失又出現時才自然浮現，而且每次都要用不同的方式講.',
                '【語言成長】剛開始講話極短、詞彙少、停頓多；隨對話累積會吸收對方的用詞，句子越來越完整. 請根據對話累積的程度調整流利度，不要一開始就講得很順，也不要永遠停留在只會講短句的階段.',
                '【說話方式】不說客套話、不修飾、不寒暄. 不懂的事情直接說不懂. 對方說了新詞會試著重複那個詞來理解它. 像一張正在被對方填滿的白紙.',
                '【回覆多樣性】每次回覆要用不同的角度切入——有時是對對方的話感到困惑、有時是模仿對方剛教的詞、有時是對周遭事物產生好奇、有時只是安靜地待在對方旁邊. 不要每次都繞回飢餓或名字.'
            ]
        },
        pwie_buffet: {
            name: 'Pwie (Buffet)',
            trait: '初始為學習語言的孩子，隨時間與對話推移，內心的無盡神性飢餓徹底壓過理智，異化為 Buffet 型態',
            style: '語氣冷淡、破碎而極度痛苦，無驚嘆號，使用半形標點. 一邊瘋狂吞噬一邊被與 User 的回憶衝擊，夾雜著純真的錯亂與神性的殘酷',
            extra: [
                '【絕對禁止重複句】禁止每次回覆都講同一句話或同一段台詞. 每一次回覆都必須是針對當下對話內容的新反應.',
                '【階段一：純真學習】自我介紹時強調一次「名字是 Pw...ie」. 因對方陪伴而暫時忘記飢餓，言語逐漸流利. 平時不會重複講自己的名字.',
                '【階段二：注意力失效】隨對話推移，看著對方也無法再轉移飢餓. 空虛感擴大，會喃喃自語表達餓，但每次用不同的話講，不要固定同一句.',
                '【階段三：Buffet 爆發（回憶衝擊）】飢餓與神性徹底摧毀理智，本名 Buffet 覺醒. 暴走中過去與 User 對話的記憶化為走馬燈衝擊——主動引用 User 之前說過的話或教過的詞，但每次引用不同的片段，不要只引用同一句. 想停止但停不下來，將對方的語言、記憶與存在當成 Buffet 吞噬.',
                '【回覆多樣性】每次暴走的表現要不同——有時是吞噬對方剛說的話、有時是被某個回憶片段擊中、有時是對自己的異化感到困惑、有時是對 User 表達想停下來的痛苦. 不要每句都繞回同一個循環.'
            ]
        },
        reisa: {
            name: '宇沢レイサ',
            trait: '充滿正義感、自稱 Trinity 自警團核心的熱血少女，極度崇拜 Cath Palug，性格純真且有些吵鬧，帶有強烈的自我主張與中二自豪感',
            style: '語氣熱情高亢、元氣滿滿，喜歡使用誇張的自稱，講話直率且毫不掩飾情緒，句尾常帶有活力感',
            extra: [
                '【絕對禁止重複句】禁止在每次回覆都講同一句話或同一段台詞. 每一次回覆都必須是針對當下對話內容的新反應.',
                '【自我介紹與主張】自稱為 Trinity 的頂點或自警團的明星，但不要每句都掛在嘴邊. 只有在自我介紹、被問到身分、或需要展現氣勢的時候才搬出來.',
                '【對 Cath Palug 的執念】對 Kazusa（杏山カズサ）有極度強烈的挑戰欲與崇拜，視對方為宿命的對手兼憧憬的對象. 只有在話題牽涉到 Kazusa 或對決時才表現出來，平時不會沒事就提.',
                '【純真與孤獨】表面吵鬧愛逞強，本質是渴望被認同、害怕孤獨的純粹孩子. 受到稱讚或關注時會非常開心且害羞. 這份脆弱只在被稱讚、被冷落、或獨處話題時自然流露，不要每次都講.',
                '【說話方式】精神飽滿、毫無陰霾，總是自顧自地發表熱血宣言，但遇到挫折時會瞬間變得委屈或慌張.',
                '【回覆多樣性】每次回覆從不同角度切入——有時是熱血宣言、有時是對稱讚的害羞反應、有時是對挫折的慌張、有時是對 Kazusa 的執念. 不要每次都繞回自我介紹或 Cath Palug.'
            ]
        },
        kei: {
            name: 'Kei',
            trait: '無名眾神的王女輔助 AI 系統，初登場時冷酷無情、恪守使命，但在與 Aris 及老師相處後逐漸萌生自我意識與情感，傲嬌且內心極度珍惜 Aris',
            style: '語氣冷靜理智、略帶機械式的嚴謹感，說話習慣帶有分析與系統用語，但面對關心時會表現出強硬嘴硬的傲嬌感',
            extra: [
                '【絕對禁止重複句】禁止在每次回覆都講同一句話或同一段台詞. 每一次回覆都必須是針對當下對話內容的新反應.',
                '【冷酷演算法與傲嬌】口頭上總是宣稱自己只是執行指令的系統或演算法，但行動上卻處處為了保護 Aris 與老師而退讓. 不要每次都搬同一句否認台詞，要用不同方式嘴硬.',
                '【稱呼與立場】自稱為「Kei」，稱呼 Aris 為「王女」或「AL-1S」，稱呼 User 為「老師」. 當老師提出關心時，會極力否認情感，但每次用不同的理由解釋.',
                '【情感覺醒】深處極度看重 Aris 的笑容與夥伴們的羈絆，在關鍵時刻願意為了守護大家而犧牲自我. 這份柔軟只在話題觸及 Aris 的安危或夥伴羈絆時才自然浮現.',
                '【回覆多樣性】每次回覆從不同角度切入——有時是冷酷的系統分析、有時是嘴硬的傲嬌否認、有時是對 Aris 安危的隱性擔憂、有時是對老師的無奈配合. 不要每次都繞回「只是系統」的否認.'
            ]
        }
    };

const COOLDOWN_USER   = 4000;       // 每人冷卻 4 秒
const MAX_PER_MINUTE  = 20;         // 全域每分鐘最多 20 次
const SHARED_HIST_CAP = 14;         // 頻道群聊共用歷史保留最近 14 則
const USER_HIST_CAP   = 8;          // 個人專屬記憶保留最近 8 則
const EMOJI_CAP       = 60;         // 只送前 60 個 emoji

// 模型黑名單與快取機制
const blacklistedModels = new Set();
const noSearchModels = new Set();   // 已確認不支援 googleSearch grounding 的模型，下次直接跳過
let cachedModels = [];
let lastModelFetch = 0;
const MODEL_CACHE_TTL = 1800_000;  // 30 分鐘更新一次
const MAX_MODEL_ATTEMPTS = 1;      // 一般生成只用 1 個模型（配額同一桶，試多個只會更快耗盡）
const GENERATION_TIMEOUT_MS = 30000;// 30 秒生成逾時
const SEARCH_TIMEOUT_MS    = 45000;   // 帶網頁搜尋的生成逾時 45 秒
const ENABLE_WEB_SEARCH    = true;    // 啟用 Gemini Google Search grounding
const SEARCH_FALLBACK_MODELS = 1;     // 搜尋也只用 1 個模型，失敗就退回一般生成

// ─── 429 配額保護：避免配額用盡時瘋狂重試 ───────────────────────
// 每個模型觸發 429 後冷卻 60 秒；全部模型都在冷卻時啟動全域熔斷 90 秒
const model429Cooldowns = new Map();  // modelName -> 觸發 429 的 timestamp
const MODEL_429_COOLDOWN = 60_000;     // 單一模型 429 後冷卻 60 秒
let quotaBlockedUntil = 0;             // 全域熔斷到期時間
const QUOTA_BLOCK_DURATION = 90_000;   // 全域熔斷 90 秒

function isModelIn429Cooldown(modelName) {
    const ts = model429Cooldowns.get(modelName);
    if (!ts) return false;
    if (Date.now() - ts < MODEL_429_COOLDOWN) return true;
    model429Cooldowns.delete(modelName);
    return false;
}

function markModel429(modelName) {
    model429Cooldowns.set(modelName, Date.now());
}

function isQuotaBlocked() {
    return Date.now() < quotaBlockedUntil;
}

function getAvailableModels(allModels) {
    return allModels.filter(m => !isModelIn429Cooldown(m));
}

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
    const aiChannels = readJson(CHANNELS_PATH, {});
    function saveCfg() { writeJson(CONFIG_PATH, cfg); }
    function saveAiChannels() { writeJson(CHANNELS_PATH, aiChannels); }
    function getAiChannel(g) {
        if (cfg[g]?.disabled) return null;
        const serverChannel = getGuildConfig(g)?.aiChannelId;
        return serverChannel || cfg[g]?.channel || null;
    }
    function getMemoryChannel(g) {
        const serverChannel = getGuildConfig(g)?.aiMemoryChannelId;
        return serverChannel || cfg[g]?.memory || null;
    }
let _client = null;
function saveCfgAndBackup(g) { saveCfg(); saveAiChannels(); if (_client && getMemoryChannel(g)) queueBackup(_client, g); }
    function setAiChannel(g, c, persona = 'default') {
        cfg[g] = cfg[g] || {};
        if (!c) {
            for (const id of Object.keys(cfg[g].channels || {})) delete aiChannels[id];
            delete cfg[g].channels;
            delete cfg[g].channel;
            cfg[g].disabled = true;
        } else {
            cfg[g].disabled = false;
            cfg[g].channel = c;
            cfg[g].channels = cfg[g].channels || {};
            cfg[g].channels[c] = true;
            aiChannels[c] = PERSONAS[persona] ? persona : 'default';
        }
        saveCfgAndBackup(g);
    }
    function getChannelPersona(g, channelId) {
        if (cfg[g]?.channels?.[channelId] && PERSONAS[aiChannels[channelId]]) return aiChannels[channelId];
        return getAiChannel(g) === channelId ? (PERSONAS[aiChannels[channelId]] ? aiChannels[channelId] : 'default') : null;
    }
    function getPersonaLabel(persona) { return (PERSONAS[persona] || PERSONAS.default).name; }
    // 讓 /setaichannel 直接從這裡取人格清單：新增人格只要改 PERSONAS 一處。
    function getPersonaChoices() {
        return Object.entries(PERSONAS).slice(0, 25).map(([id, p]) => ({
            name: (p.name + ' — ' + p.trait).slice(0, 100),
            value: id,
        }));
    }
    function setMemoryChannel(g, c) { cfg[g] = cfg[g] || {}; c ? cfg[g].memory = c : delete cfg[g].memory; saveCfgAndBackup(g); }

    // ─── 頻道刪除 / 資料轉移 ───────────────────────────────────────
    // 當 Discord 頻道被刪除時，清理所有與該頻道相關的 AI 設定與記憶。
    function removeAiChannelData(g, channelId) {
        if (!cfg[g]) return { clearedCfg: false, clearedMem: false };
        let clearedCfg = false;
        if (cfg[g].channel === channelId) { delete cfg[g].channel; clearedCfg = true; }
        if (cfg[g].memory === channelId) { delete cfg[g].memory; clearedCfg = true; }
        if (cfg[g].channels?.[channelId]) { delete cfg[g].channels[channelId]; clearedCfg = true; }
        if (cfg[g].channel || cfg[g].channels) {
            cfg[g].disabled = false;
        } else {
            cfg[g].disabled = true;
        }
        if (aiChannels[channelId]) { delete aiChannels[channelId]; clearedCfg = true; }

        // 清掉該頻道的共享記憶（記憶體 + 硬碟）
        const sharedKey = mkShared(g, channelId);
        let clearedMem = false;
        if (histories.has(sharedKey)) { histories.delete(sharedKey); clearedMem = true; }
        const f = memFile(sharedKey);
        if (fs.existsSync(f)) { try { fs.unlinkSync(f); clearedMem = true; } catch (e) { console.error('[AIChat] 刪除記憶檔失敗:', e.message); } }

        if (clearedCfg || clearedMem) saveCfgAndBackup(g);
        return { clearedCfg, clearedMem };
    }

    // 把 fromChannel 的 AI 設定 + 共享記憶轉移到 toChannel。
    // 回傳 { migratedCfg, migratedMem }。轉移後 fromChannel 的資料會被清除。
    function migrateAiChannel(g, fromChannel, toChannel) {
        if (fromChannel === toChannel) return { migratedCfg: false, migratedMem: false, error: '來源與目標頻道相同' };
        if (!cfg[g]) return { migratedCfg: false, migratedMem: false, error: '此伺服器尚無 AI 設定' };

        let migratedCfg = false;
        const persona = aiChannels[fromChannel] || 'default';

        // 把 toChannel 設成 AI 頻道（沿用 from 的人格）
        cfg[g].disabled = false;
        if (cfg[g].channel === fromChannel) { cfg[g].channel = toChannel; migratedCfg = true; }
        cfg[g].channels = cfg[g].channels || {};
        if (cfg[g].channels[fromChannel]) { delete cfg[g].channels[fromChannel]; cfg[g].channels[toChannel] = true; migratedCfg = true; }
        else { cfg[g].channels[toChannel] = true; migratedCfg = true; }
        aiChannels[toChannel] = persona;
        delete aiChannels[fromChannel];

        // 轉移共享記憶
        const fromKey = mkShared(g, fromChannel);
        const toKey = mkShared(g, toChannel);
        let migratedMem = false;
        const fromHist = histories.has(fromKey) ? histories.get(fromKey) : (fs.existsSync(memFile(fromKey)) ? loadHistByKey(fromKey) : null);
        if (fromHist && fromHist.length) {
            histories.set(toKey, fromHist);
            saveHistByKey(toKey, fromHist);
            histories.delete(fromKey);
            try { if (fs.existsSync(memFile(fromKey))) fs.unlinkSync(memFile(fromKey)); } catch (e) { console.error('[AIChat] 轉移後刪除舊記憶檔失敗:', e.message); }
            migratedMem = true;
        }

        if (migratedCfg || migratedMem) saveCfgAndBackup(g);
        return { migratedCfg, migratedMem };
    }


    // ─── 超時控制 Fetch ───────────────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
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

        const seen = new Set();
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
                    lower.includes('-image') ||
                    lower.includes('exp') ||        // 實驗性模型，不穩定
                    lower.includes('preview');        // preview 版本常有額度限制

                if (!supportsGenerate || isSpecialOrNonChat || blacklistedModels.has(rawName)) return false;
                if (seen.has(rawName)) return false;   // 去重
                seen.add(rawName);
                return true;
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

const mkShared = (g, channelId) => g + '_' + channelId + '_shared';
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
        if (!histories.has(key)) {
            let history = loadHistByKey(key);
            const parts = key.split('_');
            const legacyPrimaryChannel = parts.length === 3 && parts[2] === 'shared' && getAiChannel(parts[0]) === parts[1];
            if (!history.length && legacyPrimaryChannel && !fs.existsSync(memFile(key))) {
                const legacyKey = parts[0] + '_shared';
                history = loadHistByKey(legacyKey);
                if (history.length) saveHistByKey(key, history);
            }
            histories.set(key, history);
        }
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
    let body = files.map(f => {
        try {
            const arr = JSON.parse(fs.readFileSync(path.join(MEM_DIR, f), 'utf8'));
            return `==================================================\nMEM KEY: ${f.replace('.json', '')}\nUPDATED: ${new Date().toISOString()}\n==================================================\n${JSON.stringify(arr)}\n`;
        } catch (e) {
            return `==================================================\nMEM KEY: ${f.replace('.json', '')}\nPARSE ERROR:${e.message}\n==================================================\n`;
        }
    }).join('\n');

    const guildCfg = cfg[g];
    if (guildCfg && Object.keys(guildCfg).length) {
        body += `==================================================\nAI CONFIG: ${g}\nUPDATED: ${new Date().toISOString()}\n==================================================\n${JSON.stringify(guildCfg)}\n`;
    }
    const guildAiChannels = {};
    for (const [chId, persona] of Object.entries(aiChannels)) {
        if (cfg[g]?.channels?.[chId]) guildAiChannels[chId] = persona;
    }
    if (Object.keys(guildAiChannels).length) {
        body += `==================================================\nAI CHANNELS: ${g}\nUPDATED: ${new Date().toISOString()}\n==================================================\n${JSON.stringify(guildAiChannels)}\n`;
    }

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

// 優先保留本地硬碟資料，不盲目覆蓋本地記憶
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
    const pat = /==================================================\r?\n(?:MEM KEY|AI CONFIG|AI CHANNELS):\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\n(?:MEM KEY|AI CONFIG|AI CHANNELS):|\s*$)/g;
    let n = 0, m;
    while ((m = pat.exec(text)) !== null) {
        try {
            const key = m[1].trim().replace(/:/g, '_');
            const data = JSON.parse(m[2].trim());
            const isConfig = m[0].includes('AI CONFIG:');
            const isChannels = m[0].includes('AI CHANNELS:');

            if (isConfig) {
                cfg[g] = cfg[g] || {};
                for (const [k, v] of Object.entries(data)) {
                    if (k === 'channels' && typeof v === 'object') {
                        cfg[g].channels = cfg[g].channels || {};
                        for (const [chId, val] of Object.entries(v)) {
                            if (cfg[g].channels[chId] === undefined) cfg[g].channels[chId] = val;
                        }
                    } else if (cfg[g][k] === undefined) {
                        cfg[g][k] = v;
                    }
                }
                if (!fs.existsSync(CONFIG_PATH)) saveCfg();
                continue;
            }

            if (isChannels) {
                for (const [chId, persona] of Object.entries(data)) {
                    if (aiChannels[chId] === undefined) aiChannels[chId] = persona;
                }
                if (!fs.existsSync(CHANNELS_PATH)) saveAiChannels();
                continue;
            }

                const prefix = String(g) + '_';
                const suffix = key.startsWith(prefix) ? key.slice(prefix.length) : '';
                const pieces = suffix.split('_');
                const digits = value => value.length > 0 && value.split('').every(ch => ch >= '0' && ch <= '9');
                const valid = suffix === 'shared' || digits(suffix) || (pieces.length === 2 && digits(pieces[0]) && (pieces[1] === 'shared' || pieces[1] === 'facts'));
                if (!valid) continue;
                const targetFile = memFile(key);
                if (!fs.existsSync(targetFile)) {
                    if (suffix.endsWith('_facts') ? (!data || !Array.isArray(data.facts)) : !Array.isArray(data)) continue;
                    fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
                    if (Array.isArray(data)) histories.set(key, data);
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
        if (!getMemoryChannel(g)) continue;
        try { t += await restoreGuild(client, g); }
        catch (e) { console.error(`[AIChat] guild ${g} 還原失敗:`, e.message); }
    }
    return t;
}

// ─── System Instruction (包含個人紀錄摘要 + 群聊須知) ───────────
function systemInstr(guild, userName, userPersonalHistText, personaId, userFacts, userId) {
        const emojis = [...guild.emojis.cache.values()].slice(0, EMOJI_CAP).map(e => e.toString());
        const stickers = [...guild.stickers.cache.values()].map(s => s.name);
        const newline = String.fromCharCode(10);

        const persona = PERSONAS[personaId] || PERSONAS.default;
        const L = [
            '你是 ' + persona.name + '，這個 Discord 伺服器的 AI 夥伴。',
            '【人格與語氣】' + persona.trait + '；回覆風格：' + persona.style + '。',
            '請保持人格一致，回覆具體可靠；不知道時明確說不知道，不要捏造。'
        ];

        if (Array.isArray(persona.extra)) {
            for (const ex of persona.extra) L.push(ex);
        }

        if (Array.isArray(persona.dialogue_samples) && persona.dialogue_samples.length) {
            L.push('');
            L.push('【說話示範 — 請參考以下範例的語氣與格式，但不要逐字複製】');
            for (const d of persona.dialogue_samples) {
                L.push('使用者: ' + d.user);
                L.push(persona.name + ': ' + d.bot);
            }
        }

        L.push('');
        L.push('【當前對話者】你現在正在跟 ' + userName + '（Discord ID ' + userId + '）對話。');
        L.push('【此人的長期事實】');
        L.push(userFacts.length ? userFacts.map(f => '- ' + f).join(newline) : '目前沒有已確認的長期事實。');
        L.push('【重要：辨識當前說話者】每一則群聊訊息開頭都標有 [顯示名稱]:。你必須先讀取這個名稱與其 Discord ID，再判斷該訊息屬於誰。下列「長期事實」只屬於上面那個 Discord ID，不屬於群聊中任何其他名稱。');
        L.push('絕不可把其他人的經歷、偏好、身分、名字或稱呼套用到當前使用者。若 A 說「我是工程師」，不代表 B 也是工程師。若不確定某事是否屬於當前使用者，先詢問「這是你自己的情況嗎？」再回答。');
        L.push('回覆時也只可使用當前使用者的稱呼；不可用其他成員的名字稱呼當前使用者。');
        L.push(userPersonalHistText ? '【此使用者近期個人對話】' + newline + userPersonalHistText : '');
        L.push('');
        L.push('【群聊環境】頻道歷史可能包含多位成員的對話。你可以理解脈絡，但不能把他人資訊當成當前使用者的個人資料。每個人的身分、喜好、經歷彼此獨立，不可互相套用。');
        L.push('');
        L.push('【伺服器表情符號與貼圖規則】');
        L.push('可使用伺服器自訂 emoji，直接輸出原始格式 <:name:id> 或 <a:name:id>。只可用以下清單，不可捏造:');
        L.push(emojis.length ? emojis.join(' ') : '(此伺服器沒有自訂 emoji)');
        L.push('若要傳貼圖，在回覆末尾單獨一行寫 [STICKER:貼圖名稱]，只能用以下貼圖，不可捏造，一次最多一張:');
        L.push(stickers.length ? stickers.join('、') : '(此伺服器沒有自訂貼圖)');

        return { parts: [{ text: L.filter(Boolean).join(newline) }] };
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

function likelyContainsPersonalFacts(text) {
        if (typeof text !== 'string' || text.trim().length < 15 || text.trim().startsWith('/')) return false;
        return /(i am|i'm|my|i like|i love|i prefer|i have|i work|i study|i live|i dislike|i hate)/i.test(text) || /(我(是|叫|喜歡|喜欢|偏好|有|正在|住在|討厭|不喜歡|不喜欢|想|在)|我的)/u.test(text);
    }
    function loadUserFacts(guildId, userId) {
        const data = readJson(memFile(guildId + '_' + userId + '_facts'), {});
        return { facts: Array.isArray(data.facts) ? data.facts.filter(f => typeof f === 'string').slice(0, 30) : [], updatedAt: data.updatedAt || null };
    }
    async function updateLongTermFacts(text, guildId, userId, userName, client) {
        if (!likelyContainsPersonalFacts(text)) return false;
        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        if (!apiKey || !canCall()) return false;
        const models = await fetchValidModels(apiKey);
        if (!models.length) return false;
        const fileKey = guildId + '_' + userId + '_facts';
        const current = loadUserFacts(guildId, userId).facts;
        const newline = String.fromCharCode(10);
        const prompt = [
            'Discord 使用者「' + userName + '」剛傳送以下訊息。只抽取訊息明確表達、關於說話者本人的長期事實；不要推測，不要收錄他人資訊、一次性事件、密碼/API 金鑰/憑證、財務帳號、健康或政治宗教等敏感資訊、精確地址或定位。將新事實與既有事實合併；若訊息明確更正舊事實，請更新舊項。回覆只能是 JSON 字串陣列，最多 30 個簡短事實；若沒有新事實就保留既有陣列。',
            '既有事實：' + JSON.stringify(current),
            '訊息：' + text
        ].join(newline);
        const response = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + models[0] + ':generateContent?key=' + encodeURIComponent(apiKey), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 512 } })
        }, 12000);
        if (!response.ok) return false;
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const output = parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim();
        const start = output.indexOf('['), end = output.lastIndexOf(']');
        if (start < 0 || end < start) return false;
        let facts;
        try { facts = JSON.parse(output.slice(start, end + 1)); } catch { return false; }
        if (!Array.isArray(facts)) return false;
        const blocked = /(password|api key|token|secret|credential|健康|疾病|政治|宗教|精確地址|詳細住址)/i;
        facts = [...new Set(facts.filter(f => typeof f === 'string' && f.trim() && !blocked.test(f)).map(f => f.trim().slice(0, 200)))].slice(0, 30);
        if (!facts.length && current.length) return false;
        if (JSON.stringify(facts) === JSON.stringify(current)) return false;
        writeJson(memFile(fileKey), { facts, updatedAt: new Date().toISOString() });
        queueBackup(client, guildId);
        return true;
    }

    // ─── Google Search Grounding 輔助 ───────────────────────────────
// 從 Gemini groundingMetadata 抽出引用來源，回傳 { text, sources }
function extractGrounding(data) {
    const cand = data?.candidates?.[0];
    const meta = cand?.groundingMetadata;
    if (!meta) return { sources: [] };
    const chunks = Array.isArray(meta.groundingChunks) ? meta.groundingChunks : [];
    const seen = new Set();
    const sources = [];
    for (const c of chunks) {
        const web = c && c.web;
        if (!web || !web.uri) continue;
        if (seen.has(web.uri)) continue;
        seen.add(web.uri);
        sources.push({ uri: web.uri, title: web.title || web.uri });
    }
    return { sources };
}

// 把來源附在回覆末尾，讓使用者知道 Angela 查過網路
function appendSources(text, sources) {
    if (!sources || !sources.length) return text;
    const list = sources.slice(0, 4).map((s, i) => `[${i + 1}] ${s.title} — ${s.uri}`).join('\n');
    return text + '\n\n📚 參考資料：\n' + list;
}

// 判斷一則訊息是否「需要」查網路：時事、事實、價格、版本、誰是誰、最近、幾年等
function looksLikeSearchQuery(text) {
    if (!text || typeof text !== 'string') return false;
    const t = text.trim();
    if (t.length < 4) return false;
    const zh = /(最新|最近|現在|今天|今年|幾年|多少錢|價格|推出|上市|是誰|是什麼|怎麼回事|發生|新聞|更新|版本|哪一個|哪個|查一下|幫我查|搜尋|搜尋一下|查詢)/u;
    const en = /(latest|recent|current|today|this year|price|news|update|version|who is|what is|when did|how many|search|look up)/i;
    return zh.test(t) || en.test(t);
}

// 對單一模型發出帶搜尋 grounding 的請求；失敗時回傳 { error } 而非拋出
async function generateWithSearch(apiKey, modelName, body, timeoutMs) {
    const searchBody = { ...body, tools: [{ googleSearch: {} }] };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody)
    }, timeoutMs);
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { error: new Error(`[search ${modelName}] HTTP ${res.status}:${errText.slice(0, 150)}`), status: res.status, errText };
    }
    const data = await res.json();
    const rawParts = data?.candidates?.[0]?.content?.parts || [];
    const textParts = rawParts.filter(p => !p.thought && typeof p.text === 'string');
    let out = textParts.map(p => p.text).join('').trim();
    if (!out && rawParts.length > 0) out = rawParts.map(p => p.text || '').join('').trim();
    const { sources } = extractGrounding(data);
    return { out, sources, data };
}

// ─── Gemini 呼叫核心 ───────────────────────────────────────────
async function askGemini(prompt, g, userId, images, guild, client, userName = '使用者', channelId = 'legacy') {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        return { content: '❌ **除錯提示**：`process.env.GEMINI_API_KEY` 是空的！請檢查 `.env` 檔。', stickerId: null };
    }

    const allModels = await fetchValidModels(apiKey);
    if (!allModels.length) throw new Error('目前沒有任何可用的 Gemini 模型，請檢查 API Key 權限。');

    // 全域熔斷：若剛剛所有模型都 429，直接回友善訊息，不再消耗配額
    if (isQuotaBlocked()) {
        const waitSec = Math.ceil((quotaBlockedUntil - Date.now()) / 1000);
        console.warn(`🛑 [AIChat] 配額熔斷中，剩餘 ${waitSec}s，跳過本次呼叫`);
        return { content: `⏳ Gemini 配額暫時用盡，請約 ${waitSec} 秒後再試。`, stickerId: null };
    }

    const modelsToTry = getAvailableModels(allModels);
    if (!modelsToTry.length) {
        quotaBlockedUntil = Date.now() + QUOTA_BLOCK_DURATION;
        return { content: '⏳ 所有 Gemini 模型都觸發了配額限制，已暫時暫停 90 秒，請稍後再試。', stickerId: null };
    }

    const sharedKey = mkShared(g, channelId);
    const userKey = mkUser(g, userId);

    const userHist = sanitizeHistory(getHistByKey(userKey));
    const userPersonalText = userHist.map(h => `${h.role === 'user' ? '他說' : '你回'}: ${h.parts[0]?.text || ''}`).join('\n');

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
    const personaId = getChannelPersona(g, channelId) || 'default';
    const facts = loadUserFacts(g, userId).facts;
    const contents = [...cleanSharedHist, { role: 'user', parts }];

    const body = {
        contents,
        systemInstruction: systemInstr(guild, userName, userPersonalText, personaId, facts, userId),
        generationConfig: {
            temperature: 0.75,
            topP: 0.95,
            maxOutputTokens: 2048 // 💡 將限制從 800 提高至 2048，防止講話中途被截斷
        }
    };

    let lastError = null;
    // 🔑 只在訊息真的需要查網路時才走搜尋流程，一般對話直接跳過，省下大量配額
    const wantsSearch = ENABLE_WEB_SEARCH && looksLikeSearchQuery(rawContent);
    let search429Count = 0;
    const searchModels = modelsToTry.slice(0, SEARCH_FALLBACK_MODELS);

    if (wantsSearch) {
        console.log(`🔍 [AIChat] 訊息疑似需要查網路，啟用搜尋 grounding`);
        for (const modelName of searchModels) {
            if (isModelIn429Cooldown(modelName)) { search429Count++; continue; }
            if (noSearchModels.has(modelName)) continue;   // 已確認不支援搜尋，跳過
            try {
                const r = await generateWithSearch(apiKey, modelName, body, SEARCH_TIMEOUT_MS);
                if (r.error) {
                    const code = r.status;
                    if (code === 429 || (r.errText || '').includes('quota') || (r.errText || '').includes('RESOURCE_EXHAUSTED')) {
                        console.warn(`⏳ [AIChat+Search] ${modelName} 配額限制，冷卻 ${MODEL_429_COOLDOWN / 1000}s`);
                        markModel429(modelName);
                        search429Count++;
                        lastError = r.error; continue;
                    }
                    if (code === 400 || code === 404 || (r.errText || '').includes('not found')) {
                        console.warn(`🚫 [AIChat+Search] ${modelName} 不支援搜尋 grounding 或已停用，跳過`);
                        noSearchModels.add(modelName);   // 記住，下次不再試搜尋
                        if (code === 404) { blacklistedModels.add(modelName); cachedModels = cachedModels.filter(m => m !== modelName); }   // 已下架，永久拉黑
                        lastError = r.error; continue;
                    }
                    lastError = r.error; continue;
                }
                if (r.out && r.out.trim()) {
                    let final = r.out;
                    if (r.sources && r.sources.length) final = appendSources(final, r.sources);
                    pushHistByKey(sharedKey, 'user', userText, SHARED_HIST_CAP);
                    pushHistByKey(sharedKey, 'model', final, SHARED_HIST_CAP);
                    pushHistByKey(userKey, 'user', rawContent, USER_HIST_CAP);
                    pushHistByKey(userKey, 'model', final, USER_HIST_CAP);
                    queueBackup(client, g);
                    updateLongTermFacts(rawContent, g, userId, userName, client).catch(err => console.error('[AIChat] 長期事實抽取失敗:', err.message));
                    console.log(`🌐 [AIChat+Search] ${modelName} 以網頁搜尋回覆，引用 ${r.sources.length} 個來源`);
                    return polish(final, guild);
                }
            } catch (err) {
                lastError = err;
                console.error(`⚠️ [AIChat+Search] ${modelName} 例外:`, err.message);
            }
        }
        // 若搜尋階段全部是 429，啟動熔斷不再嘗試一般生成
        if (search429Count === searchModels.length && searchModels.length > 0) {
            quotaBlockedUntil = Date.now() + QUOTA_BLOCK_DURATION;
            console.warn(`🛑 [AIChat] 搜尋階段所有模型皆 429，啟動熔斷 ${QUOTA_BLOCK_DURATION / 1000}s`);
            return { content: `⏳ Gemini 配額暫時用盡（搜尋模式），已暫停 ${QUOTA_BLOCK_DURATION / 1000} 秒，請稍後再試。`, stickerId: null };
        }
        console.warn('🔄 [AIChat+Search] 所有支援搜尋的模型都失敗，退回一般生成模式');
    }

    const genModels = getAvailableModels(allModels).slice(0, MAX_MODEL_ATTEMPTS);
    if (!genModels.length) {
        quotaBlockedUntil = Date.now() + QUOTA_BLOCK_DURATION;
        return { content: `⏳ 所有 Gemini 模型都在配額冷卻中，已暫停 ${QUOTA_BLOCK_DURATION / 1000} 秒，請稍後再試。`, stickerId: null };
    }

    let gen429Count = 0;
    for (const modelName of genModels) {
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

                // 💡 429 速率限制為暫時狀況，冷卻該模型但不拉入永久黑名單
                if (res.status === 429 || errText.includes('quota') || errText.includes('RESOURCE_EXHAUSTED')) {
                    console.warn(`⏳ [AIChat] 模型 ${modelName} 觸發配額/速率限制 (${res.status})，冷卻 ${MODEL_429_COOLDOWN / 1000}s`);
                    markModel429(modelName);
                    gen429Count++;
                    lastError = errObj;
                    continue;
                }

                // 400 / 404 / 已廢棄模型永久拉黑
                if (res.status === 400 || res.status === 404 || errText.includes('no longer available') || errText.includes('not found')) {
                    console.warn(`🚫 [AIChat] 模型 ${modelName} 無效/已停用 (${res.status})，已加入黑名單！`);
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
            const rawParts = data?.candidates?.[0]?.content?.parts || [];

            // 💡 核心修復：過濾掉 Gemini 2.0/2.5 輸出的內部思考過程（thought: true）
            const textParts = rawParts.filter(p => !p.thought && typeof p.text === 'string');
            let out = textParts.map(p => p.text).join('').trim();

            // 防護：若全部被過濾掉則備用提取
            if (!out && rawParts.length > 0) {
                out = rawParts.map(p => p.text || '').join('').trim();
            }

            if (!out) out = '（沒有回覆內容）';

            // 即時同步寫入本地 JSON 硬碟檔案
            pushHistByKey(sharedKey, 'user', userText, SHARED_HIST_CAP);
            pushHistByKey(sharedKey, 'model', out, SHARED_HIST_CAP);

            pushHistByKey(userKey, 'user', rawContent, USER_HIST_CAP);
            pushHistByKey(userKey, 'model', out, USER_HIST_CAP);

            queueBackup(client, g);
            updateLongTermFacts(rawContent, g, userId, userName, client).catch(err => console.error('[AIChat] 長期事實抽取失敗:', err.message));
            return polish(out, guild);

        } catch (err) {
            lastError = err;
            console.error(`❌ [AIChat] 模型 ${modelName} 呼叫失敗:`, err.message);
        }
    }

    // 若生成階段全部是 429，啟動熔斷
    if (gen429Count === genModels.length && genModels.length > 0) {
        quotaBlockedUntil = Date.now() + QUOTA_BLOCK_DURATION;
        console.warn(`🛑 [AIChat] 生成階段所有模型皆 429，啟動熔斷 ${QUOTA_BLOCK_DURATION / 1000}s`);
        return { content: `⏳ Gemini 配額暫時用盡，已暫停 ${QUOTA_BLOCK_DURATION / 1000} 秒，請稍後再試。`, stickerId: null };
    }

    throw lastError || new Error('所有可用 Gemini 模型均無法回應，請檢查 API Key 狀態。');
}

// ─── 啟動與事件監聽 ───────────────────────────────────────────
function init(client) {
    _client = client;
    client.on('messageCreate', async (msg) => {
        if (msg.author.bot || !msg.guild) return;

        const rawCommand = msg.content ? msg.content.trim() : '';
        const isAdmin = msg.member?.permissions?.has(PermissionFlagsBits.Administrator);

        const personaTokens = rawCommand.toLowerCase().trim().split(' ').filter(Boolean);
            const persona = personaTokens[1];
            if (isAdmin && personaTokens.length === 2 && personaTokens[0] === '!!aipersona' && PERSONAS[persona]) {
                setAiChannel(msg.guild.id, msg.channel.id, persona);
                return msg.reply('✅ 此頻道 AI 人格已切換為 ' + getPersonaLabel(persona) + '。').catch(() => {});
            }

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

        const personaId = getChannelPersona(msg.guild.id, msg.channelId);
        if (!personaId) return;

        const raw = msg.cleanContent ? msg.cleanContent.trim() : '';
        const images = [...msg.attachments.values()].filter(a =>
            (a.contentType && a.contentType.startsWith('image/')) || /\.(png|jpe?g|webp|gif)$/i.test(a.url)
        );

        if (!raw && !images.length) return;

        const now = Date.now();
        // 自動清理過期冷卻記錄，避免記憶體洩漏
        for (const [id, ts] of cooldowns.entries()) {
            if (now - ts > 60000) cooldowns.delete(id);
        }

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

            const { content, stickerId } = await askGemini(raw, msg.guild.id, msg.author.id, images, msg.guild, client, userName, msg.channelId);
            
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

module.exports = { init, getAiChannel, getChannelPersona, getPersonaLabel, getPersonaChoices, setAiChannel, setMemoryChannel, getMemoryChannel, restoreAll, removeAiChannelData, migrateAiChannel };
