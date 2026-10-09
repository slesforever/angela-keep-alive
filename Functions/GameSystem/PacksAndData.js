// Functions/GameSystem/PacksAndData.js
// 玩家資料存取（JSON 檔案 + Discord 頻道 txt 備份 + 重啟自動還原）+ LC 主頁風格 !pack UI
'use strict';

const fs = require('fs');
const path = require('path');
const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    AttachmentBuilder,
} = require('discord.js');

// ─── 資料目錄（支援環境變數持久化路徑，防止重啟歸零）─────────
const DATA_DIR = path.resolve(process.env.PLAYER_DATA_DIR || path.join(process.cwd(), 'data', 'players'));
const PERSISTENT_DATA_DIR = path.join(process.cwd(), 'data');
const SHOP_ITEMS_PATH = path.join(PERSISTENT_DATA_DIR, 'shop-items.json');
const SHOP_SALES_PATH = path.join(PERSISTENT_DATA_DIR, 'shop-sales.json');
const MARRIAGES_PATH = path.join(PERSISTENT_DATA_DIR, 'marriages.json');
const ANNIVERSARY_STATE_PATH = path.join(PERSISTENT_DATA_DIR, 'anniversary-state.json');
const { getLanguage, pick } = require('./LanguageSystem.js');
// ─── SinnersData（供 getIdentitySinnerKey 使用）─────────────────
const { SINNERS, SINNER_NAMES, UPTIE_COSTS, getSkillList } = require('./Data/SinnersData.js');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// Discord 備份頻道
const BACKUP_CHANNEL_ID = process.env.PLAYER_BACKUP_CHANNEL_ID || '1510947300212477972';

// 備份節流：避免連續存檔時狂洗頻道
let backupTimer = null;
let backupInFlight = false;
let backupQueuedReason = 'save';

// 以安全大小切分 txt，避免單檔過大
const MAX_TXT_BYTES = 7_500_000;
const MAX_ID_LEVEL = 65;

// ─── 稀有度設定 ───────────────────────────────────────────────
const RARITY_ORDER  = ['0','S1','00','S2','000','S3','0000','S4','Egos','EGOS','Special','Color Fixer','ABN_ZAYIN','ABN_TETH','ABN_HE','ABN_WAW','ABN_ALEPH','ABN_ANGELA'];
const RARITY_LABEL  = { '0':'★','S1':'★','00':'★★','S2':'★★','000':'★★★','S3':'★★★','0000':'★★★★','S4':'★★★★','Color Fixer':'👑CF','Egos':'🔮EGO','EGOS':'🔮EGO','Special':'🌀SP','ABN_ZAYIN':'⚪異ZAYIN','ABN_TETH':'🟡異TETH','ABN_HE':'🟢異HE','ABN_WAW':'🔵異WAW','ABN_ALEPH':'🟣異ALEPH','ABN_ANGELA':'🕊️[LC]安潔菈' };
const RARITY_COLOR  = { '0':0x57606f,'S1':0x57606f,'00':0x74b9ff,'S2':0x74b9ff,'000':0xffd166,'S3':0xffd166,'0000':0xff6b6b,'S4':0xff6b6b,'Color Fixer':0xffffff,'Egos':0xa55eea,'EGOS':0xa55eea,'Special':0x2ed573,'ABN_ZAYIN':0xbdc3c7,'ABN_TETH':0xf1c40f,'ABN_HE':0x2ecc71,'ABN_WAW':0x3498db,'ABN_ALEPH':0x9b59b6,'ABN_ANGELA':0xffffff };

// ─── 等級費用表 ───────────────────────────────────────────────
function calcLevelCost(curLv, steps = 1) {
    let frags = 0, scrolls = 0;
    for (let l = curLv; l < Math.min(curLv + steps, MAX_ID_LEVEL); l++) {
        if      (l <= 20) { frags += l * 5; }
        else if (l <= 40) { frags += l * 8;  scrolls += 1; }
        else              { frags += l * 12; scrolls += 3; }
    }
    return { frags, scrolls };
}

// 與 LevelSystem 相同的全域玩家等級公式；載入舊存檔時同步修正顯示用 level。
function getPlayerLevelFromXp(totalXp) {
    let level = 1;
    let remaining = Math.max(0, Number(totalXp) || 0);
    while (level < 100) {
        const needed = level * 150;
        if (remaining < needed) break;
        remaining -= needed;
        level++;
    }
    return level;
}

// ─── 工具 ─────────────────────────────────────────────────────
let identitiesData;
function getIdData() {
    if (!identitiesData) identitiesData = require('./Pulls/identitiesData.js');
    return identitiesData;
}

function findRarity(name) {
    const pool = getIdData().pool || {};
    for (const r of RARITY_ORDER) {
        if ((pool[r] || []).includes(name)) return r;
    }
    return '0';
}

function getShortName(name) {
    const s = String(name || '');
    const inner = s.match(/[［（（[](.+?)[］））)]]/);
    if (inner) {
        let content = inner[1].trim();
        const afterColon = content.match(/[：:]\s*(.+)/);
        if (afterColon) content = afterColon[1].trim();
        return content.slice(0, 12);
    }
    const lcb = s.match(/^LCB\s+\S+\s+(.+?)(?:\s*\/|$)/);
    if (lcb) return lcb[1].trim().slice(0, 12);
    const slash = s.indexOf('/');
    return (slash > 0 ? s.slice(0, slash) : s).trim().slice(0, 12);
}

function safeFileName(name) {
    return String(name || 'backup')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

function stripHtml(text) {
    return String(text || '').replace(/<\/?[^>]+(>|$)/g, '').trim();
}

function getIdentitySinnerKey(identityName) {
    if (!identityName) return null;
    const keys = Object.keys(SINNERS || {});
    return keys.find(k => String(identityName).includes(k)) || null;
}

function getOwnedSinners(player) {
    const owned = Array.isArray(player?.identities) ? player.identities : [];
    return [...new Set(owned.map(getIdentitySinnerKey).filter(Boolean))];
}

function skillLine(sk, label) {
    if (!sk) return `${label}：-`;
    const sn = sk.skillname || '—';
    return `${label}：${sn} ｜ 基礎:${sk.clashbase} 硬幣:${sk.coins}×+${sk.clashpower} 攻:${sk.attack} 防:${sk.defense}`;
}

function buildIdentityDetailText(name, data, rarity, lv, owned) {
    const skillText = data
        ? [skillLine(data.skill1, 'S1'), skillLine(data.skill2, 'S2'), skillLine(data.skill3, 'S3')].join('\n')
        : 'S1：-\nS2：-\nS3：-';

    const evadeText = data?.evade
        ? `迴避：${data.evade.skillname || '—'} ｜ 硬幣:${data.evade.coins}×+${data.evade.clashpower} 攻:${data.evade.attack} 防:${data.evade.defense}`
        : '迴避：-';

    const counterText = data?.counter?.length
        ? data.counter.map((c, i) =>
            `反擊${i + 1}：${c.skillname || '—'} ｜ ${c.canclash ? '可碰撞' : '不可碰撞'} ｜ 硬幣:${c.coins}×+${c.clashpower} 攻:${c.attack} 防:${c.defense}`
        ).join('\n')
        : '反擊：-';

    const passiveText = data?.passive?.length
        ? data.passive.map((p, i) => `被動${i + 1}：${p.skillname || '—'} ｜ ${stripHtml(p.description || p.desc || '') || '-'}`).join('\n')
        : '被動：-';

    const descText = data?.description
        ? `描述：${stripHtml(data.description)}`
        : '描述：-';

    return [
        `人格名稱：${name}`,
        `短名：${getShortName(name)}`,
        `稀有度：${rarity}`,
        `等級：${lv}`,
        `狀態：${owned ? '已持有' : '未持有'}`,
        '',
        '===== 技能 =====',
        skillText,
        '',
        '===== 迴避 / 反擊 =====',
        evadeText,
        counterText,
        '',
        '===== 被動 =====',
        passiveText,
        '',
        '===== 其他 =====',
        descText,
    ].join('\n');
}

function formatPlayerBlock(userId, data) {
    return [
        `==================================================`,
        `USER ID: ${userId}`,
        `USERNAME: ${data?.username ?? 'Unknown'}`,
        `UPDATED: ${new Date().toISOString()}`,
        `==================================================`,
        JSON.stringify(data, null, 2),
        '',
    ].join('\n');
}

function readAllPlayerFiles() {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => a.localeCompare(b));
}

function buildAllPlayersBackupText() {
    const files = readAllPlayerFiles();
    const header = [
        `# Angela Player Backup Snapshot`,
        `# Generated: ${new Date().toISOString()}`,
        `# Total Players: ${files.length}`,
        `# Source Folder: data/players`,
        ``,
    ].join('\n');

    const blocks = files.map(file => {
        const userId = file.replace(/\.json$/i, '');
        try {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const data = JSON.parse(raw);
            return formatPlayerBlock(userId, data);
        } catch (err) {
            return [
                `==================================================`,
                `USER ID: ${userId}`,
                `PARSE ERROR: ${err.message}`,
                `==================================================`,
                '',
            ].join('\n');
        }
    });

    const sections = [header + blocks.join('\n')];

    // 商城 & 婚姻資料不在 data/players/，一併放進玩家快照，避免重啟或部署後消失。
    for (const [label, file] of [
        ['SHOP_ITEMS', SHOP_ITEMS_PATH],
        ['SHOP_SALES', SHOP_SALES_PATH],
        ['MARRIAGES', MARRIAGES_PATH],
        ['ANNIVERSARY_STATE', ANNIVERSARY_STATE_PATH],
    ]) {
        if (!fs.existsSync(file)) continue;
        try {
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            sections.push([
                `# ${label}_JSON_BEGIN`,
                JSON.stringify(value, null, 2),
                `# ${label}_JSON_END`,
            ].join('\n'));
        } catch (err) {
            console.error(`[Pack] 讀取 ${label} 備份失敗:`, err.message);
        }
    }

    return sections.join('\n');
}

function splitTextIntoChunks(text, maxBytes = MAX_TXT_BYTES) {
    const lines = String(text || '').split('\n');
    const chunks = [];
    let current = [];
    let currentBytes = 0;

    const pushCurrent = () => {
        if (current.length) chunks.push(current.join('\n'));
        current = [];
        currentBytes = 0;
    };

    for (const line of lines) {
        const lineBytes = Buffer.byteLength(line, 'utf8');
        const nextBytes = current.length ? currentBytes + 1 + lineBytes : lineBytes;

        if (nextBytes <= maxBytes) {
            current.push(line);
            currentBytes = nextBytes;
            continue;
        }

        pushCurrent();

        if (lineBytes <= maxBytes) {
            current.push(line);
            currentBytes = lineBytes;
            continue;
        }

        // 單行就超過上限（幾乎不會發生）：直接硬切
        let remaining = line;
        while (remaining.length > 0) {
            let lo = 1;
            let hi = remaining.length;
            let best = 1;
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                if (Buffer.byteLength(remaining.slice(0, mid), 'utf8') <= maxBytes) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }
            chunks.push(remaining.slice(0, best));
            remaining = remaining.slice(best);
        }
    }

    pushCurrent();
    return chunks.filter(Boolean);
}

async function sendBackupTxtToChannel(client, reason = 'save') {
    if (!client) return false;

    const channel = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.error(`[Pack] 找不到備份頻道: ${BACKUP_CHANNEL_ID}`);
        return false;
    }

    const snapshot = buildAllPlayersBackupText();
    const chunks = splitTextIntoChunks(snapshot, MAX_TXT_BYTES);

    if (!chunks.length) {
        console.warn('[Pack] 備份內容為空，略過發送。');
        return false;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const totalParts = chunks.length;

    for (let i = 0; i < chunks.length; i++) {
        const partNo = String(i + 1).padStart(String(totalParts).length, '0');
        const fileName = `players_backup_${stamp}_part${partNo}_of_${totalParts}.txt`;

        const attachment = new AttachmentBuilder(Buffer.from(chunks[i], 'utf8'), {
            name: safeFileName(fileName),
        });

        await channel.send({
            content: totalParts > 1
                ? `📦 玩家資料備份（${reason}） Part ${i + 1}/${totalParts}`
                : `📦 玩家資料備份（${reason}）`,
            files: [attachment],
        });
    }

    return true;
}

function queueAllPlayersBackup(client, reason = 'save') {
    if (!client) return;

    backupQueuedReason = reason;

    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(async () => {
        if (backupInFlight) return;
        backupInFlight = true;

        try {
            await sendBackupTxtToChannel(client, backupQueuedReason);
        } catch (err) {
            console.error(`[Pack] 頻道備份失敗：${err.message}`);
        } finally {
            backupInFlight = false;
        }
    }, 2500);
}

// ─── 從 Discord 備份頻道還原玩家資料（重啟自動恢復）────────────
async function restoreFromBackupChannel(client) {
    if (!client) return 0;
    const channel = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
    if (!channel) {
        console.error(`[Pack] 還原失敗：找不到備份頻道 ${BACKUP_CHANNEL_ID}`);
        return 0;
    }

    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages || !messages.size) {
        console.warn('[Pack] 備份頻道沒有任何訊息，略過還原');
        return 0;
    }

    const backupAttachments = [];
    for (const message of messages.values()) {
        for (const attachment of message.attachments.values()) {
            const match = attachment.name?.match(/^players_backup_(.+?)_part(\d+)_of_(\d+)\.txt$/);
            if (match) {
                backupAttachments.push({
                    stamp: match[1],
                    partNo: Number(match[2]),
                    totalParts: Number(match[3]),
                    url: attachment.url,
                    name: attachment.name,
                    createdTimestamp: message.createdTimestamp,
                });
            }
        }
    }

    if (!backupAttachments.length) {
        console.warn('[Pack] 備份頻道沒有 txt 附件，略過還原');
        return 0;
    }

    // 找最新一批：同一次備份的檔名會共用相同時間戳。
    // 不依賴附件在訊息中的順序，避免最新訊息含有其他 txt 附件時誤判。
    backupAttachments.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const targetStamp = backupAttachments[0].stamp;
    const parts = backupAttachments
        .filter(part => part.stamp === targetStamp)
        .sort((a, b) => a.partNo - b.partNo);
    const expectedParts = parts[0]?.totalParts || 0;

    if (!parts.length) {
        console.warn('[Pack] 沒有找到任何備份檔案，略過還原');
        return 0;
    }

    if (expectedParts > 0 && parts.length < expectedParts) {
        console.error(`[Pack] 最新備份不完整：找到 ${parts.length}/${expectedParts} 個檔案，略過還原以避免覆蓋成不完整資料`);
        return 0;
    }

    const fetch = require('node-fetch');
    const textParts = [];
    for (const part of parts) {
        try {
            const r = await fetch(part.url);
            if (r.ok) {
                textParts.push(await r.text());
                console.log(`[Pack] 下載備份 ${part.name} OK`);
            } else {
                console.error(`[Pack] 下載 ${part.name} 失敗: HTTP ${r.status}`);
            }
        } catch (err) {
            console.error(`[Pack] 下載 ${part.name} 例外:`, err.message);
        }
    }

    // 每個 chunk 都可能剛好切在 JSON 的任意一行，補一個換行不會影響 JSON，
    // 但能避免兩個 chunk 的最後/第一行黏在一起造成解析失敗。
    const fullText = textParts.join('\n');
    if (!fullText.length) {
        console.error('[Pack] 所有備份檔案下載失敗');
        return 0;
    }

    // 解析完整玩家區塊：
    // ==================================================
    // USER ID: ...
    // USERNAME / UPDATED
    // ==================================================
    // { 完整 JSON }
    //
    // 不能直接用分隔線 split，因為每位玩家的區塊本身就有兩條分隔線。
    const playerBlockPattern =
        /==================================================\r?\nUSER ID:\s*([^\r\n]+)\r?\n[\s\S]*?\r?\n==================================================\r?\n([\s\S]*?)(?=\r?\n==================================================\r?\nUSER ID:|\r?\n# SHOP_(?:ITEMS|SALES)_JSON_BEGIN|\s*$)/g;
    let restored = 0;
    let match;
    while ((match = playerBlockPattern.exec(fullText)) !== null) {
        const userId = match[1].trim();
        const jsonText = match[2].trim();
        try {
            const data = JSON.parse(jsonText);
            const file = path.join(DATA_DIR, `${userId}.json`);
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
            restored++;
        } catch (err) {
            console.error(`[Pack] 解析玩家 ${userId} 資料失敗:`, err.message);
        }
    }

    // 還原商城商品與訂單。這些檔案位於 data/，不是玩家資料目錄。
    let restoredExtraFiles = 0;
    for (const [label, file] of [
        ['SHOP_ITEMS', SHOP_ITEMS_PATH],
        ['SHOP_SALES', SHOP_SALES_PATH],
        ['MARRIAGES', MARRIAGES_PATH],
        ['ANNIVERSARY_STATE', ANNIVERSARY_STATE_PATH],
    ]) {
        const sectionPattern = new RegExp(
            `# ${label}_JSON_BEGIN\\s*([\\s\\S]*?)\\s*# ${label}_JSON_END`
        );
        const section = fullText.match(sectionPattern);
        if (!section) continue;

        try {
            const value = JSON.parse(section[1].trim());
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
            restoredExtraFiles++;
        } catch (err) {
            console.error(`[Pack] 還原 ${label} 失敗:`, err.message);
        }
    }

    console.log(`✅ [Pack] 從備份頻道還原了 ${restored} 位玩家資料`);
    if (restoredExtraFiles > 0) {
        console.log(`✅ [Pack] 同步還原了 ${restoredExtraFiles} 份額外資料（商城/婚姻等）`);
    }
    return restored;
}

// ─── 玩家資料存取 ─────────────────────────────────────────────
function defaultPlayer(username) {
    const pool = getIdData().pool || {};
    const base = (pool['0'] || []).slice(0, 12);

    return {
        username,
        lightSeeds:     1300,
        starCoins:      0,
        bankStarCoins:  0,
        bankLastInterestAt: Date.now(),
        identities:     [...base],
        egos:           [],
        team:           [...base].slice(0, 4),
        identityLevels: {},
        fragments:      0,
        expScrolls:     0,
        thread:         0,
        sinners:        {},
        party:          [],
        totalPulls:     0,
        level:          1,
        exp:            0,
        stageProgress:  1,
        xp:             0,
        totalMessages:  0,
        totalVoiceMinutes: 0,
        currentVoiceMinutes: 0,
        longestVoiceSessionMinutes: 0,
        voiceSessionStartedAt: null,
        voiceSessionGuildId: null,
        dailyQuestStreak: 0,
        hourlyQuestCompletions: 0,
        achievements: { unlocked: [], claimed: [] },
    };
}

function loadPlayerData(_client, userId) {
    const file = path.join(DATA_DIR, `${userId}.json`);
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`[Pack] 讀取失敗 ${userId}:`, e.message);
    }
    return null;
}

function savePlayerData(client, userId, data) {
    const file = path.join(DATA_DIR, `${userId}.json`);
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        queueAllPlayersBackup(client, `save:${userId}`);
    } catch (e) {
        console.error(`[Pack] 儲存失敗 ${userId}:`, e.message);
    }
}

function getOrCreatePlayer(client, userId, username) {
    let p = loadPlayerData(client, userId);
    let needsSave = false;
    if (!p) {
        p = defaultPlayer(username || 'Player');
        savePlayerData(client, userId, p);
    }

    p.level          ??= 1;
    p.exp            ??= 0;
    p.thread         ??= 0;
    p.fragments      ??= 0;
    p.expScrolls     ??= 0;
    p.team           ??= [];
    p.egos           ??= [];
    p.identityLevels ??= {};
    p.sinners        ??= {};
    p.party          ??= [];
    p.totalPulls     ??= 0;
    p.identities     ??= [];
    if (p.lunacy !== undefined) {
        p.lightSeeds = (Number(p.lightSeeds) || 0) + (Number(p.lunacy) || 0);
        delete p.lunacy;
        needsSave = true;
    }
    p.lightSeeds     ??= 1300;
    p.starCoins      ??= p.starcoins ?? 0;
    p.bankStarCoins  ??= 0;
    p.bankLastInterestAt ??= Date.now();
    if (p.starcoins !== undefined) {
        delete p.starcoins;
        needsSave = true;
    }
    p.xp             ??= 0;
    const normalizedLevel = getPlayerLevelFromXp(
        Math.max(Number(p.xp) || 0, Number(p.exp) || 0)
    );
    if (p.level !== normalizedLevel) {
        p.level = normalizedLevel;
        needsSave = true;
    }
    if (!p.identities.length) {
        const pool = getIdData().pool || {};
        const base = (pool['0'] || pool['S1'] || []).slice(0, 12);
        if (base.length) { p.identities = [...base]; if (!p.team?.length) p.team = [...base].slice(0, 4); }
    }

    if (needsSave) savePlayerData(client, userId, p);
    return p;
}

function loadUserInventory(_client, userId) {
    return (loadPlayerData(null, userId) || {}).identities || [];
}

function saveUserInventory(client, userId, items) {
    const p = getOrCreatePlayer(client, userId, 'Player');
    p.identities = Array.isArray(items) ? items : [];
    savePlayerData(client, userId, p);
}

// ─── UI 元件 ──────────────────────────────────────────────────
function lobbyEmbed(player, lang) {
    const en = lang !== 'zh';
    const team = player.team.length
        ? player.team.map((n, i) => `${i + 1}. **${getShortName(n)}** Lv.${player.identityLevels[n] || 1}`).join('\n')
        : pick(lang, '_(尚未編成)_', '_(Not set up)_');

    return new EmbedBuilder()
        .setTitle(pick(lang, '\u200b🚂 LCB Manager Console\u200b', '\u200b🚂 LCB Manager Console\u200b'))
        .setColor(0x1a1a2e)
        .setDescription(
            `### ${player.username}\n` +
            `${pick(lang, `Lv.**${player.level}** ｜ Pulls: **${player.totalPulls || 0}** ｜ IDs: **${player.identities.length}** ｜ EGO: **${player.egos.length}**`,
                        `Lv.**${player.level}** ｜ Pulls: **${player.totalPulls || 0}** ｜ IDs: **${player.identities.length}** ｜ EGO: **${player.egos.length}**`)}`
        )
        .addFields(
            { name: '\u200b', value:
                `🌱 **LightSeeds**: ${Number(player.lightSeeds || 0).toLocaleString()}\n` +
                `🧵 **${pick(lang, '紡錘', 'Threads')}**: ${Number(player.thread || 0).toLocaleString()}\n` +
                `📦 **${pick(lang, '人格碎片', 'Fragments')}**: ${Number(player.fragments || 0).toLocaleString()}\n` +
                `📜 **${pick(lang, '經驗卷', 'Exp Scrolls')}**: ${Number(player.expScrolls || 0).toLocaleString()}`,
                inline: true },
            { name: '\u200b', value:
                `🌟 **StarCoins**: ${Number(player.starCoins || 0).toLocaleString()}\n` +
                `🏦 **${pick(lang, '銀行', 'Bank')}**: ${Number(player.bankStarCoins || 0).toLocaleString()}\n` +
                `\u200b\n\u200b`,
                inline: true },
            { name: `\u200b⚔️ ${pick(lang, '出擊編成', 'Battle Party')} (${player.team.length}/6)`, value: team, inline: false },
        )
        .setFooter({ text: pick(lang, '點擊下方按鈕操作', 'Click a button below to navigate') })
        .setTimestamp();
}

function lobbyRows(lang) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pk_lib').setLabel(pick(lang, '📋 人格庫', '📋 Identity Library')).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('pk_form').setLabel(pick(lang, '⚔️ 出擊編成', '⚔️ Battle Party')).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('pk_cult').setLabel(pick(lang, '🔼 人格培育', '🔼 Cultivation')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pk_ego').setLabel(pick(lang, '🔮 E.G.O', '🔮 E.G.O')).setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pk_sinner').setLabel(pick(lang, '👤 罪人總覽', '👤 Sinners')).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('pk_uptie').setLabel(pick(lang, '🔗 連結提升', '🔗 Uptie')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pk_equip').setLabel(pick(lang, '🔧 裝備人格', '🔧 Equip')).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pk_threads').setLabel(pick(lang, '🧵 資源查詢', '🧵 Resources')).setStyle(ButtonStyle.Secondary),
        ),
    ];
}

function backToLobbyRow(lang) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pk_home').setLabel(pick(lang, '🏠 返回主頁', '🏠 Home')).setStyle(ButtonStyle.Danger),
    );
}

function navRow(buttons, lang) {
    const row = new ActionRowBuilder();
    for (const btn of buttons) row.addComponents(btn);
    row.addComponents(backToLobbyRow(lang).components[0]);
    return row;
}

// ─── !pack 主路由 ──────────────────────────────────────────────
async function showPack(client, message) {
    const lang = getLanguage(message.author.id);
    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const reply  = await message.reply({ embeds: [lobbyEmbed(player, lang)], components: lobbyRows(lang) });

    const col = reply.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) {
                i.reply({ content: pick(lang, '❌ 這不是您的控制台。', '❌ This is not your console.'), ephemeral: true });
                return false;
            }
            return true;
        },
        time: 10 * 60_000,
    });

    function refresh() {
        return getOrCreatePlayer(client, message.author.id, message.author.username);
    }
    function save(p) { savePlayerData(client, message.author.id, p); }
    function curLang() { return getLanguage(message.author.id); }

    col.on('collect', async ix => {
        const id = ix.customId;
        const l = curLang();

        if (id === 'pk_home') {
            const p = refresh();
            return ix.update({ embeds: [lobbyEmbed(p, l)], components: lobbyRows(l) });
        }

        // ─── Identity Library ───────────────────────────────
        if (id === 'pk_lib') {
            const p = refresh();
            const sinnerOpts = SINNER_NAMES.map(sinnerName => {
                const ownedForSinner = (p.identities || []).filter(name => getIdentitySinnerKey(name) === sinnerName);
                return {
                    label: `${sinnerName} (${ownedForSinner.length})`,
                    description: ownedForSinner.length ? ownedForSinner.map(n => getShortName(n)).slice(0, 3).join(', ') : pick(l, '尚未持有', 'None owned'),
                    value: sinnerName,
                };
            });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_lib_sinner')
                .setPlaceholder(pick(l, '🔍 選擇罪人查看持有的人格...', '🔍 Select a sinner to view identities...'))
                .addOptions(sinnerOpts.slice(0, 25));

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '📋 人格庫 — 罪人選擇', '📋 Identity Library — Select Sinner'))
                    .setColor(0x3a0ca3)
                    .setDescription(
                        `${pick(l, '目前持有', 'You own')} **${p.identities.length}** ${pick(l, '件人格', 'identities')}\n\n` +
                        pick(l, '選擇罪人查看你持有的該罪人人格。', 'Select a sinner to view your identities for that character.')
                    )],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    navRow([], l),
                ],
            });
        }

        if (id === 'pk_lib_sinner') {
            const sinnerName = ix.values[0];
            const p = refresh();
            const ownedForSinner = (p.identities || []).filter(name => getIdentitySinnerKey(name) === sinnerName);

            if (!ownedForSinner.length) {
                return ix.update({
                    embeds: [new EmbedBuilder()
                        .setTitle(pick(l, `📋 ${sinnerName} — 未持有人格`, `📋 ${sinnerName} — No Identities`))
                        .setColor(0x57606f)
                        .setDescription(pick(l, '你尚未持有此罪人的人格。透過抽卡來獲取吧！', 'You do not own any identities for this sinner. Try pulling!'))],
                    components: [navRow([
                        new ButtonBuilder().setCustomId('pk_lib').setLabel(pick(l, '↩ 返回', '↩ Back')).setStyle(ButtonStyle.Secondary),
                    ], l)],
                });
            }

            const opts = ownedForSinner.slice(0, 25).map(name => {
                const lv = p.identityLevels[name] || 1;
                const rarity = findRarity(name);
                return {
                    label: `${getShortName(name).slice(0, 20)} (Lv.${lv}/${MAX_ID_LEVEL})`,
                    description: `${RARITY_LABEL[rarity]}`,
                    value: name.slice(0, 100),
                };
            });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_lib_id')
                .setPlaceholder(pick(l, `${sinnerName} 的人格列表...`, `${sinnerName} identities...`))
                .addOptions(opts);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, `📋 人格庫 — ${sinnerName}`, `📋 Identity Library — ${sinnerName}`))
                    .setColor(0x3a0ca3)
                    .setDescription(pick(l, `共持有 **${ownedForSinner.length}** 件 ${sinnerName} 人格`, `You own **${ownedForSinner.length}** ${sinnerName} identities`))],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    navRow([
                        new ButtonBuilder().setCustomId('pk_lib').setLabel(pick(l, '↩ 返回罪人列表', '↩ Back to sinners')).setStyle(ButtonStyle.Secondary),
                    ], l),
                ],
            });
        }

        if (id === 'pk_lib_id') {
            const name   = ix.values[0];
            const idData = getIdData();
            const data   = idData.getIdentityData ? idData.getIdentityData(name) : null;
            const rarity = findRarity(name);
            const p      = refresh();
            const lv     = p.identityLevels[name] || 1;
            const owned  = p.identities.includes(name);

            const fileText = buildIdentityDetailText(name, data, rarity, lv, owned);
            const fileName = `${safeFileName(getShortName(name))}.txt`;

            const detailEmbed = new EmbedBuilder()
                .setTitle(`${RARITY_LABEL[rarity]} ${getShortName(name)}`)
                .setColor(RARITY_COLOR[rarity])
                .setDescription(
                    `\`${name}\`\n\n` +
                    (owned ? pick(l, `已持有 ｜ Lv.${lv} / ${MAX_ID_LEVEL}`, `Owned ｜ Lv.${lv} / ${MAX_ID_LEVEL}`) : pick(l, '未持有', 'Not owned'))
                )
                .addFields(
                    { name: pick(l, '📊 狀態', '📊 Status'), value: owned ? pick(l, `已持有 ｜ Lv.${lv} / ${MAX_ID_LEVEL}`, `Owned ｜ Lv.${lv} / ${MAX_ID_LEVEL}`) : pick(l, '未持有', 'Not owned'), inline: true },
                    { name: pick(l, '📁 檔案', '📁 File'), value: `${fileName}`, inline: true },
                )
                .setFooter({ text: owned
                    ? pick(l, `升等費用 Lv${lv}→${lv + 1}: 碎片×${calcLevelCost(lv).frags} + 卷×${calcLevelCost(lv).scrolls}`, `Upgrade Lv${lv}→${lv + 1}: Frags×${calcLevelCost(lv).frags} + Scrolls×${calcLevelCost(lv).scrolls}`)
                    : pick(l, '透過 /pull 提取此人格', 'Use /pull to obtain this identity') });

            const actionBtns = [
                new ButtonBuilder().setCustomId('pk_lib').setLabel(pick(l, '↩ 返回', '↩ Back')).setStyle(ButtonStyle.Secondary),
            ];
            if (owned) {
                const lampBroken = p.identityLampBreaks && p.identityLampBreaks[name];
                actionBtns.push(
                    new ButtonBuilder().setCustomId(`pk_cult_do_${name.slice(0, 60)}`).setLabel(pick(l, '🔼 升等', '🔼 Upgrade')).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pk_lamp_${name.slice(0, 60)}`)
                        .setLabel(lampBroken ? pick(l, '💡 已破燈', '💡 Lamp On') : pick(l, '破燈', 'Lamp Break'))
                        .setStyle(lampBroken ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(lampBroken || lv < MAX_ID_LEVEL),
                );
            }

            try {
                await ix.update({
                    embeds: [detailEmbed],
                    components: [navRow(actionBtns, l)],
                });
            } catch (e) {
                console.error(`[Pack] Identity detail update failed: ${e.message}`);
            }

            try {
                const channel = message.channel;
                if (channel) {
                    const attachment = new AttachmentBuilder(Buffer.from(fileText, 'utf8'), { name: fileName });
                    await channel.send({
                        content: pick(l, `📄 **${message.author.username}** 的人格完整資料：**${name}**`, `📄 **${message.author.username}**'s identity details: **${name}**`),
                        files: [attachment],
                    });
                }
            } catch (e) {
                console.error(`[Pack] Failed to send identity txt: ${e.message}`);
            }

            return;
        }

        // ─── Battle Party ────────────────────────────────────
        if (id === 'pk_form') {
            const { showPartyUI } = require('./PartySystem.js');
            return showPartyUI(client, ix, message.author.id, message.author.username);
        }

        // ─── Cultivation ─────────────────────────────────────
        if (id === 'pk_cult') {
            const p   = refresh();
            const all = p.identities.slice(0, 25);
            if (!all.length) {
                return ix.update({
                    embeds: [new EmbedBuilder().setTitle(pick(l, '🔼 人格培育', '🔼 Cultivation')).setColor(0x57606f).setDescription(pick(l, '尚未持有任何人格。', 'You do not own any identities.'))],
                    components: [navRow([], l)],
                });
            }

            const opts = all.map(name => {
                const lv   = p.identityLevels[name] || 1;
                const cost = calcLevelCost(lv);
                return {
                    label:       `${getShortName(name).slice(0, 20)} (Lv.${lv}/${MAX_ID_LEVEL})`,
                    description: pick(l, `升1級需碎片×${cost.frags}${cost.scrolls ? ` + 卷×${cost.scrolls}` : ''}`, `+1 Lv: Frags×${cost.frags}${cost.scrolls ? ` + Scrolls×${cost.scrolls}` : ''}`),
                    value:       name.slice(0, 100),
                };
            });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_cult_select')
                .setPlaceholder(pick(l, '選擇要培育的人格...', 'Select an identity to cultivate...'))
                .addOptions(opts);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔼 人格培育', '🔼 Cultivation'))
                    .setColor(0xffd166)
                    .setDescription(
                        `📦 ${pick(l, '人格碎片', 'Fragments')}: **${p.fragments}** ｜ 📜 ${pick(l, '經驗卷', 'Exp Scrolls')}: **${p.expScrolls}**\n\n` +
                        pick(l, '選擇人格進行升等。', 'Select an identity to upgrade.')
                    )],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    navRow([], l),
                ],
            });
        }

        if (id === 'pk_cult_select' || id.startsWith('pk_cult_do_')) {
            const name = id.startsWith('pk_cult_do_') ? id.slice('pk_cult_do_'.length) : ix.values[0];
            return showCultivation(ix, name, refresh, save, l);
        }

        if (id.startsWith('pk_lvup_')) {
            const parts = id.split('_');
            const steps = parseInt(parts[2]) || 1;
            const name  = parts.slice(3).join('_');
            const p     = refresh();
            const lv    = p.identityLevels[name] || 1;

            if (lv >= MAX_ID_LEVEL) return ix.reply({ content: pick(l, `⛔ 已達最高等級 Lv.${MAX_ID_LEVEL}。`, `⛔ Already at max level Lv.${MAX_ID_LEVEL}.`), ephemeral: true });

            const realSteps = Math.min(steps, MAX_ID_LEVEL - lv);
            const cost = calcLevelCost(lv, realSteps);

            if (p.fragments < cost.frags) return ix.reply({ content: pick(l, `❌ 碎片不足！需要 ${cost.frags}，持有 ${p.fragments}。`, `❌ Not enough fragments! Need ${cost.frags}, have ${p.fragments}.`), ephemeral: true });
            if (p.expScrolls < cost.scrolls) return ix.reply({ content: pick(l, `❌ 經驗卷不足！需要 ${cost.scrolls}，持有 ${p.expScrolls}。`, `❌ Not enough scrolls! Need ${cost.scrolls}, have ${p.expScrolls}.`), ephemeral: true });

            p.fragments -= cost.frags;
            p.expScrolls -= cost.scrolls;
            p.identityLevels[name] = lv + realSteps;
            save(p);

            return showCultivation(ix, name, refresh, save, l);
        }

        if (id.startsWith('pk_lamp_')) {
            const name = id.slice('pk_lamp_'.length);
            const p = refresh();
            const lv = p.identityLevels[name] || 1;
            const owned = p.identities.includes(name);

            if (!owned) return ix.reply({ content: pick(l, '❌ 你未持有此人格。', '❌ You do not own this identity.'), ephemeral: true });
            if (lv < MAX_ID_LEVEL) return ix.reply({ content: pick(l, `⛔ 需先達到 Lv.${MAX_ID_LEVEL} 滿等才能破燈。`, `⛔ Must reach Lv.${MAX_ID_LEVEL} before lamp break.`), ephemeral: true });

            p.identityLampBreaks = p.identityLampBreaks || {};
            if (p.identityLampBreaks[name]) return ix.reply({ content: pick(l, '💡 此人格已破燈。', '💡 Lamp already broken.'), ephemeral: true });

            const lampCost = { frags: 200, scrolls: 10 };
            if (p.fragments < lampCost.frags) return ix.reply({ content: pick(l, `❌ 破燈需碎片×${lampCost.frags}，持有 ${p.fragments}。`, `❌ Lamp break needs Frags×${lampCost.frags}, have ${p.fragments}.`), ephemeral: true });
            if (p.expScrolls < lampCost.scrolls) return ix.reply({ content: pick(l, `❌ 破燈需經驗卷×${lampCost.scrolls}，持有 ${p.expScrolls}。`, `❌ Lamp break needs Scrolls×${lampCost.scrolls}, have ${p.expScrolls}.`), ephemeral: true });

            p.fragments -= lampCost.frags;
            p.expScrolls -= lampCost.scrolls;
            p.identityLampBreaks[name] = true;
            save(p);

            return ix.reply({ content: pick(l, `💡 **${getShortName(name)}** 已成功破燈！能力上限解放！`, `💡 **${getShortName(name)}** lamp broken! Power unleashed!`), ephemeral: false });
        }

        // ─── E.G.O Library ───────────────────────────────────
        if (id === 'pk_ego') {
            const p    = refresh();
            const desc = p.egos.length
                ? p.egos.map((e, i) => `${i + 1}. 🔮 ${e}`).join('\n')
                : pick(l, '您尚未持有任何 E.G.O。', 'You do not own any E.G.O.');

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔮 E.G.O 庫', '🔮 E.G.O Library'))
                    .setColor(0xa55eea)
                    .setDescription(desc)
                    .setFooter({ text: pick(l, `共 ${p.egos.length} 件 E.G.O`, `Total: ${p.egos.length} E.G.O`) })],
                components: [navRow([], l)],
            });
        }

        // ─── Sinners Overview ────────────────────────────────
        if (id === 'pk_sinner') {
            const p = refresh();
            const lines = SINNER_NAMES.map(n => {
                const sd = p.sinners?.[n] || {};
                const ut = sd.uptie || 1;
                const lv = p.identityLevels?.[`LCB ${n}`] || p.identityLevels?.[n] || 1;
                const stars = '◆'.repeat(ut) + '◇'.repeat(4 - ut);
                return `• **${n}** Lv.${lv} ｜ ${stars} T${ut} ｜ ${pick(l, '裝備', 'Equip')}: ${sd.equippedIdentity ? getShortName(sd.equippedIdentity) : `LCB ${n}`}`;
            });

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '👤 全罪人狀態', '👤 All Sinners'))
                    .setColor(0x74b9ff)
                    .setDescription(lines.join('\n'))
                    .addFields(
                        { name: '🧵 ' + pick(l, '紡錘', 'Threads'), value: `${p.thread || 0}`, inline: true },
                        { name: '📦 ' + pick(l, '人格碎片', 'Fragments'), value: `${p.fragments || 0}`, inline: true },
                        { name: '📜 ' + pick(l, '經驗卷', 'Scrolls'), value: `${p.expScrolls || 0}`, inline: true },
                    )
                    .setFooter({ text: pick(l, '選擇罪人查看詳細資料', 'Select a sinner for details') })
                    .setTimestamp()],
                components: [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pk_sinner_select')
                            .setPlaceholder(pick(l, '🔍 選擇罪人查看詳細...', '🔍 Select a sinner...'))
                            .addOptions(SINNER_NAMES.slice(0, 25).map(n => ({
                                label: n,
                                description: `T${p.sinners?.[n]?.uptie || 1} ｜ ${p.sinners?.[n]?.equippedIdentity?.slice(0, 30) || `LCB ${n}`}`,
                                value: n,
                            }))),
                    ),
                    navRow([], l),
                ],
            });
        }

        if (id === 'pk_sinner_select') {
            const name = ix.values[0];
            const p = refresh();
            const s = SINNERS[name];
            if (!s) return ix.reply({ content: pick(l, `❌ 找不到「${name}」`, `❌ Sinner "${name}" not found`), ephemeral: true });

            const sd = p.sinners?.[name] || { uptie: 1, equippedIdentity: `LCB ${name}` };
            const lv = p.identityLevels?.[`LCB ${name}`] || p.identityLevels?.[name] || 1;
            const ut = sd.uptie || 1;
            const stars = '◆'.repeat(ut) + '◇'.repeat(4 - ut);

            const skills = getSkillList(s);
            const skillLines = skills.map((sk, i) =>
                `**${i + 1}.${sk.name}** [${sk.type}/${sk.sin}]\n` +
                `　${pick(l, '基礎', 'Base')}:${sk.clashbase} ${pick(l, '硬幣', 'Coins')}:${sk.coins}×+${sk.clashpower} ${pick(l, '攻', 'Atk')}:${sk.attack}${sk.effect ? ` → ${sk.effect.name}×${sk.effect.stacks}` : ''}`
            ).join('\n');

            const uptieCost = ut < 4 ? UPTIE_COSTS[ut] : null;

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(`👤 ${s.name} / ${s.nameEn}`)
                    .setColor(0x5865f2)
                    .setDescription(
                        `${stars} **T${ut}** ｜ Lv.**${lv}**/${MAX_ID_LEVEL} ｜ ${pick(l, '裝備', 'Equip')}: ${sd.equippedIdentity || `LCB ${name}`}`
                    )
                    .addFields(
                        { name: '⚡ ' + pick(l, '速度', 'Speed'), value: `${s.minSpd}~${s.maxSpd}`, inline: true },
                        { name: '❤️ HP', value: `${s.hp}`, inline: true },
                        { name: '🛡️ ' + pick(l, '防禦等級', 'Def Level'), value: `${s.defLevel}`, inline: true },
                        { name: '✨ ' + pick(l, '主罪業', 'Primary Sin'), value: `${s.primarySin}`, inline: true },
                        { name: '⚔️ ' + pick(l, '主動技能', 'Active Skills'), value: skillLines || pick(l, '（無）', '(None)'), inline: false },
                        { name: '🌟 ' + pick(l, '被動', 'Passive'), value: `**${s.passive?.name || '—'}**：${s.passive?.desc || '—'}`, inline: false },
                        uptieCost
                            ? { name: '🔗 ' + pick(l, '下次連結提升', 'Next Uptie'), value: `🧵 ×${uptieCost}`, inline: true }
                            : { name: '🔗 ' + pick(l, '連結提升', 'Uptie'), value: pick(l, '已達最高 T4', 'Max T4'), inline: true },
                    )
                    .setFooter({ text: pick(l, '使用下方按鈕操作', 'Use the buttons below') })
                    .setTimestamp()],
                components: [navRow([
                    new ButtonBuilder().setCustomId('pk_uptie').setLabel(pick(l, '🔗 連結提升', '🔗 Uptie')).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('pk_equip').setLabel(pick(l, '🔧 裝備人格', '🔧 Equip')).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('pk_sinner').setLabel(pick(l, '↩ 返回罪人', '↩ Back')).setStyle(ButtonStyle.Secondary),
                ], l)],
            });
        }

        // ─── Uptie ───────────────────────────────────────────
        if (id === 'pk_uptie') {
            const p = refresh();
            const opts = SINNER_NAMES.slice(0, 25).map(n => {
                const sd = p.sinners?.[n] || { uptie: 1 };
                const ut = sd.uptie || 1;
                const cost = ut < 4 ? UPTIE_COSTS[ut] : null;
                return {
                    label: `${n} (T${ut}${cost ? ` → T${ut + 1}` : ' MAX'})`,
                    description: cost ? pick(l, `需要 🧵×${cost} ｜ 持有 🧵×${p.thread || 0}`, `Cost: 🧵×${cost} ｜ Have: 🧵×${p.thread || 0}`) : pick(l, '已達最高 T4', 'Max T4'),
                    value: n,
                };
            });

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔗 連結提升', '🔗 Uptie'))
                    .setColor(0xffd166)
                    .setDescription(
                        `🧵 ${pick(l, '持有紡錘', 'Threads')}: **${p.thread || 0}**\n\n` +
                        `**${pick(l, '連結提升費用', 'Uptie Costs')}**\n` +
                        `T1→T2: ×20 ｜ T2→T3: ×40 ｜ T3→T4: ×80`
                    )
                    .setFooter({ text: pick(l, '選擇罪人進行連結提升', 'Select a sinner to uptie') })],
                components: [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pk_uptie_select')
                            .setPlaceholder(pick(l, '🔍 選擇要連結提升的罪人...', '🔍 Select a sinner to uptie...'))
                            .addOptions(opts),
                    ),
                    navRow([], l),
                ],
            });
        }

        if (id === 'pk_uptie_select') {
            const name = ix.values[0];
            const p = refresh();
            if (!p.sinners) p.sinners = {};
            if (!p.sinners[name]) p.sinners[name] = { uptie: 1, equippedIdentity: `LCB ${name}` };
            const sd = p.sinners[name];
            const ut = sd.uptie || 1;

            if (ut >= 4) {
                return ix.reply({ content: pick(l, `「${name}」已達最高連結等級 T4。`, `${name} is already at max uptie T4.`), ephemeral: true });
            }

            const cost = UPTIE_COSTS[ut];
            if ((p.thread || 0) < cost) {
                return ix.reply({ content: pick(l, `❌ 紡錘不足！需要 🧵×${cost}，目前 🧵×${p.thread || 0}`, `❌ Not enough threads! Need 🧵×${cost}, have 🧵×${p.thread || 0}`), ephemeral: true });
            }

            p.thread = (p.thread || 0) - cost;
            sd.uptie = ut + 1;
            save(p);

            const stars = '◆'.repeat(sd.uptie) + '◇'.repeat(4 - sd.uptie);
            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔗 連結提升成功！', '🔗 Uptie Successful!'))
                    .setColor(0xffd166)
                    .setDescription(`**${name}** → T${sd.uptie} ${stars}\n${pick(l, '消耗', 'Cost')}: 🧵 ×${cost} ｜ ${pick(l, '剩餘', 'Left')}: 🧵 ×${p.thread || 0}`)
                    .setTimestamp()],
                components: [navRow([
                    new ButtonBuilder().setCustomId('pk_uptie').setLabel(pick(l, '↩ 返回連結提升', '↩ Back to uptie')).setStyle(ButtonStyle.Secondary),
                ], l)],
            });
        }

        // ─── Equip ───────────────────────────────────────────
        if (id === 'pk_equip') {
            const p = refresh();
            const opts = SINNER_NAMES.slice(0, 25).map(n => {
                const sd = p.sinners?.[n] || { equippedIdentity: `LCB ${n}` };
                const ownedForSinner = (p.identities || []).filter(name => getIdentitySinnerKey(name) === n);
                return {
                    label: `${n} (${ownedForSinner.length})`,
                    description: pick(l, `目前：${sd.equippedIdentity?.slice(0, 30) || `LCB ${n}`}`, `Current: ${sd.equippedIdentity?.slice(0, 30) || `LCB ${n}`}`),
                    value: n,
                };
            });

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔧 裝備人格', '🔧 Equip Identity'))
                    .setColor(0x2ed573)
                    .setDescription(pick(l, '選擇罪人後，再選擇要裝備的人格。', 'Select a sinner, then choose an identity to equip.'))
                    .setFooter({ text: pick(l, `持有 ${p.identities.length} 件人格`, `Owned: ${p.identities.length} identities`) })],
                components: [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pk_equip_sinner')
                            .setPlaceholder(pick(l, '🔍 選擇罪人...', '🔍 Select a sinner...'))
                            .addOptions(opts),
                    ),
                    navRow([], l),
                ],
            });
        }

        if (id === 'pk_equip_sinner') {
            const sinnerName = ix.values[0];
            const p = refresh();
            const ownedForSinner = (p.identities || []).filter(name => getIdentitySinnerKey(name) === sinnerName);
            const allOpts = [`LCB ${sinnerName}`, ...ownedForSinner];
            const opts = allOpts.slice(0, 25).map(name => ({
                label: getShortName(name).slice(0, 25),
                description: name === `LCB ${sinnerName}` ? pick(l, '預設人格', 'Default') : RARITY_LABEL[findRarity(name)],
                value: name.slice(0, 100),
            }));

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, `🔧 裝備人格 — ${sinnerName}`, `🔧 Equip — ${sinnerName}`))
                    .setColor(0x2ed573)
                    .setDescription(pick(l, '選擇要裝備的人格：', 'Choose an identity to equip:'))
                    .setFooter({ text: pick(l, `可選 ${allOpts.length} 件人格`, `${allOpts.length} options available`) })],
                components: [
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('pk_equip_select')
                            .setPlaceholder(pick(l, '選擇人格...', 'Select identity...'))
                            .addOptions(opts),
                    ),
                    navRow([
                        new ButtonBuilder().setCustomId('pk_equip').setLabel(pick(l, '↩ 返回罪人選擇', '↩ Back to sinners')).setStyle(ButtonStyle.Secondary),
                    ], l),
                ],
            });
        }

        if (id === 'pk_equip_select') {
            const identityName = ix.values[0];
            const p = refresh();
            const sinnerName = SINNER_NAMES.find(n => identityName === `LCB ${n}` || getIdentitySinnerKey(identityName) === n);
            if (!sinnerName) return ix.reply({ content: pick(l, '❌ 無法識別此人格對應的罪人。', '❌ Cannot identify the sinner for this identity.'), ephemeral: true });

            const owned = (p.identities || []).includes(identityName);
            const isDefault = identityName === `LCB ${sinnerName}`;
            if (!owned && !isDefault) {
                return ix.reply({ content: pick(l, `❌ 你沒有持有「${identityName}」，不能裝備。`, `❌ You do not own "${identityName}".`), ephemeral: true });
            }

            if (!p.sinners) p.sinners = {};
            if (!p.sinners[sinnerName]) p.sinners[sinnerName] = { uptie: 1, equippedIdentity: `LCB ${sinnerName}` };
            p.sinners[sinnerName].equippedIdentity = identityName;
            save(p);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🔧 裝備更新', '🔧 Equipment Updated'))
                    .setColor(0x2ed573)
                    .setDescription(pick(l, `**${sinnerName}** 現在裝備：\n${identityName}`, `**${sinnerName}** now equipped with:\n${identityName}`))
                    .setTimestamp()],
                components: [navRow([
                    new ButtonBuilder().setCustomId('pk_equip').setLabel(pick(l, '↩ 返回裝備', '↩ Back to equip')).setStyle(ButtonStyle.Secondary),
                ], l)],
            });
        }

        // ─── Resources ───────────────────────────────────────
        if (id === 'pk_threads') {
            const p = refresh();
            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(pick(l, '🧵 資源查詢', '🧵 Resources'))
                    .setColor(0xa55eea)
                    .setDescription(
                        `**${pick(l, '連結提升費用', 'Uptie Costs')}**\n` +
                        `T1→T2: ×20 ｜ T2→T3: ×40 ｜ T3→T4: ×80\n\n` +
                        `**${pick(l, '人格升等費用（每一級）', 'Identity Upgrade Cost (per level)')}**\n` +
                        `Lv1-20: ${pick(l, '碎片', 'Frags')}×(Lv×5)\n` +
                        `Lv21-40: ${pick(l, '碎片', 'Frags')}×(Lv×8) + ${pick(l, '卷', 'Scrolls')}×1\n` +
                        `Lv41-60: ${pick(l, '碎片', 'Frags')}×(Lv×12) + ${pick(l, '卷', 'Scrolls')}×3`
                    )
                    .addFields(
                        { name: '🧵 ' + pick(l, '紡錘', 'Threads'), value: `${p.thread || 0}`, inline: true },
                        { name: '📦 ' + pick(l, '人格碎片', 'Fragments'), value: `${p.fragments || 0}`, inline: true },
                        { name: '📜 ' + pick(l, '經驗卷', 'Exp Scrolls'), value: `${p.expScrolls || 0}`, inline: true },
                        { name: '🌱 LightSeeds', value: `${Number(p.lightSeeds || 0).toLocaleString()}`, inline: true },
                        { name: '🌟 StarCoins', value: `${Number(p.starCoins || 0).toLocaleString()}`, inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                    )
                    .setFooter({ text: pick(l, '在 📋 人格庫或 🔼 人格培育進行升等', 'Upgrade via 📋 Library or 🔼 Cultivation') })
                    .setTimestamp()],
                components: [navRow([], l)],
            });
        }
    });

    col.on('end', () => reply.edit({ components: [] }).catch(() => {}));
}

async function showCultivation(ix, name, refresh, save, lang) {
    const p     = refresh();
    const lv    = p.identityLevels[name] || 1;
    const cost1  = calcLevelCost(lv, 1);
    const cost10 = calcLevelCost(lv, 10);
    const maxCost = calcLevelCost(lv, MAX_ID_LEVEL - lv);
    const rarity  = findRarity(name);

    const embed = new EmbedBuilder()
        .setTitle(pick(lang, `🔼 人格培育 — ${getShortName(name)}`, `🔼 Cultivation — ${getShortName(name)}`))
        .setColor(RARITY_COLOR[rarity])
        .setDescription(
            `${RARITY_LABEL[rarity]} ｜ Lv.**${lv}** / ${MAX_ID_LEVEL}`
        )
        .addFields(
            { name: '📦 ' + pick(lang, '持有碎片', 'Fragments'), value: `${p.fragments}`, inline: true },
            { name: '📜 ' + pick(lang, '持有卷', 'Scrolls'), value: `${p.expScrolls}`, inline: true },
            lv < MAX_ID_LEVEL
                ? { name: '💰 +1 ' + pick(lang, '級費用', 'Lv Cost'), value: `${pick(lang, '碎片', 'Frags')}×${cost1.frags}${cost1.scrolls ? ` + ${pick(lang, '卷', 'Sc')}×${cost1.scrolls}` : ''}`, inline: true }
                : { name: '🏆 ' + pick(lang, '狀態', 'Status'), value: pick(lang, '**最高等級**', '**Max Level**'), inline: true },
            lv + 10 <= MAX_ID_LEVEL
                ? { name: '💰 +10 ' + pick(lang, '級費用', 'Lv Cost'), value: `${pick(lang, '碎片', 'Frags')}×${cost10.frags}${cost10.scrolls ? ` + ${pick(lang, '卷', 'Sc')}×${cost10.scrolls}` : ''}`, inline: true }
                : { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: pick(lang, `升到滿級需: 碎片×${maxCost.frags}${maxCost.scrolls ? ` + 卷×${maxCost.scrolls}` : ''}`, `Max upgrade cost: Frags×${maxCost.frags}${maxCost.scrolls ? ` + Sc×${maxCost.scrolls}` : ''}`) });

    const btnKey = name.slice(0, 55);
    const buttons = [
        new ButtonBuilder().setCustomId(`pk_lvup_1_${btnKey}`).setLabel(pick(lang, '+1 級', '+1 Lv')).setStyle(ButtonStyle.Primary).setDisabled(lv >= MAX_ID_LEVEL),
        new ButtonBuilder().setCustomId(`pk_lvup_10_${btnKey}`).setLabel(pick(lang, '+10 級', '+10 Lv')).setStyle(ButtonStyle.Primary).setDisabled(lv + 10 > MAX_ID_LEVEL),
        new ButtonBuilder().setCustomId('pk_cult').setLabel(pick(lang, '↩ 返回培育', '↩ Back')).setStyle(ButtonStyle.Secondary),
    ];

    return ix.update({ embeds: [embed], components: [navRow(buttons, lang)] });
}

// ─── !list（翻頁機率清單）─────────────────────────────────────
const BASE_RATES = {
    '0': 0.8359857,
    '00': 0.12,
    '000': 0.029,
    'Egos': 0.013,
    '0000': 0.001,
    'Special': 0.001,
    'Color Fixer': 0.0000143
};
const RATE_UP_MULT = 5;

function getListDisplayName(name, lang) {
    const s = String(name || '');
    if (lang === 'en') {
        const slash = s.lastIndexOf(' / ');
        if (slash >= 0) return s.slice(slash + 3).trim().slice(0, 40);
    }
    const m = s.match(/[［【\[](.+?)[］】\]]\s*([^/]+)/);
    if (m) {
        const bracket = m[1].trim();
        const sinner  = m[2].trim();
        return `［${bracket}］${sinner}`.slice(0, 40);
    }
    const lcb = s.match(/^LCB\s+\S+\s+(.+)/);
    if (lcb) return lcb[1];
    return s.split('/')[0].trim().slice(0, 40);
}

function buildListPages() {
    const pages = [];
    const pool = getIdData().pool || {};
    const up = getIdData().upTargets || {};

    pages.push({
        type: 'summary',
        title: '🗂️ 核心控制室 — 扭蛋池機率清單',
        desc: RARITY_ORDER.map(r => {
            const cnt = (pool[r] || []).length;
            const pct = ((BASE_RATES[r] || 0) * 100).toFixed(4);
            const upItems = up[r] || [];
            return `${RARITY_LABEL[r].padEnd(8)} 機率：\`${pct}%\` 共 \`${cnt}\` 件${upItems.length ? ` ⬆️ UP×${upItems.length}` : ''}`;
        }).join('\n')
    });

    for (const r of RARITY_ORDER) {
        const items = pool[r] || [];
        if (!items.length) continue;
        const upList = up[r] || [];
        const totalW = items.reduce((s, n) => s + (upList.includes(n) ? RATE_UP_MULT : 1), 0);
        const SZ = 12;
        for (let c = 0; c < items.length; c += SZ) {
            pages.push({
                type: 'pool',
                r,
                chunk: items.slice(c, c + SZ),
                ci: Math.floor(c / SZ),
                ct: Math.ceil(items.length / SZ),
                total: items.length,
                upList,
                totalW
            });
        }
    }
    return pages;
}

function renderPage(pages, idx, userId) {
    const p = pages[idx];
    const lang = userId ? getLanguage(userId) : 'zh';
    const foot = `分頁 ${idx + 1}/${pages.length}`;

    if (p.type === 'summary') {
        return new EmbedBuilder()
            .setTitle(p.title)
            .setColor(0x3a0ca3)
            .setDescription(p.desc)
            .setFooter({ text: foot });
    }

    const base = BASE_RATES[p.r] || 0;
    const lines = p.chunk.map(name => {
        const isUp = p.upList.includes(name);
        const pct = ((base * (isUp ? RATE_UP_MULT : 1) / p.totalW) * 100).toFixed(4);
        const displayName = getListDisplayName(name, lang);
        return `${isUp ? '📌' : '•'} **${displayName}** \`${pct}%\``;
    });

    return new EmbedBuilder()
        .setTitle('🗂️ 核心控制室 — 扭蛋池機率清單')
        .setColor(RARITY_COLOR[p.r])
        .setDescription(`### ${RARITY_LABEL[p.r]} (${p.ci + 1}/${p.ct})\n共 ${p.total} 件 ｜ 總機率 \`${(base * 100).toFixed(4)}%\`\n\n${lines.join('\n')}`)
        .setFooter({ text: foot });
}

async function showList(message) {
    const pages = buildListPages();
    let idx = 0;

    const navRow = (i) => [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ls_prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(i === 0),
        new ButtonBuilder().setCustomId('ls_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(i >= pages.length - 1),
    )];

    const rep = await message.reply({ embeds: [renderPage(pages, idx, message.author.id)], components: navRow(idx) });
    const col = rep.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120_000 });

    col.on('collect', async i => {
        if (i.customId === 'ls_prev') idx = Math.max(0, idx - 1);
        if (i.customId === 'ls_next') idx = Math.min(pages.length - 1, idx + 1);
        await i.update({ embeds: [renderPage(pages, idx, message.author.id)], components: navRow(idx) });
    });
    col.on('end', () => rep.edit({ components: [] }).catch(() => {}));
}

// ─── 主路由 ───────────────────────────────────────────────────
async function handleInventory(client, message) {
    const raw = message.content.trim();
    if (raw === '!list' || raw === '!rate' || raw === '!rates') {
        return showList(message);
    }
    if (raw === '!pack' || raw === '!p' || raw === '!inv' || raw === '!inventory') {
        return showPack(client, message);
    }
}

module.exports = {
    handleInventory,
    showPack,
    showList,
    getOrCreatePlayer,
    loadPlayerData,
    savePlayerData,
    loadUserInventory,
    saveUserInventory,
    getShortName,
    calcLevelCost,
    getIdentitySinnerKey,
    getOwnedSinners,
    queueAllPlayersBackup,
    restoreFromBackupChannel,
};
