// Functions/GameSystem/PacksAndData.js
// 玩家資料存取（JSON 檔案 + Discord 頻道 txt 備份）+ LC 主頁風格 !pack UI
//update
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

// ─── 資料目錄 ─────────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), 'data', 'players');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// Discord 備份頻道
const BACKUP_CHANNEL_ID = process.env.PLAYER_BACKUP_CHANNEL_ID || '1510947300212477972';

// 備份節流：避免連續存檔時狂洗頻道
let backupTimer = null;
let backupInFlight = false;
let backupQueuedReason = 'save';

// 以安全大小切分 txt，避免單檔過大
const MAX_TXT_BYTES = 7_500_000; // 保守值，避免接近附件上限

// ─── 稀有度設定 ───────────────────────────────────────────────
const RARITY_ORDER  = ['0','S1','00','S2','000','S3','0000','S4','Egos','EGOS','Special','Color Fixer','ABN_ZAYIN','ABN_TETH','ABN_HE','ABN_WAW','ABN_ALEPH','ABN_ANGELA'];
const RARITY_LABEL  = { '0':'★','S1':'★','00':'★★','S2':'★★','000':'★★★','S3':'★★★','0000':'★★★★','S4':'★★★★','Color Fixer':'👑CF','Egos':'🔮EGO','EGOS':'🔮EGO','Special':'🌀SP','ABN_ZAYIN':'⚪異ZAYIN','ABN_TETH':'🟡異TETH','ABN_HE':'🟢異HE','ABN_WAW':'🔵異WAW','ABN_ALEPH':'🟣異ALEPH','ABN_ANGELA':'🕊️[LC]安潔菈' };
const RARITY_COLOR  = { '0':0x57606f,'S1':0x57606f,'00':0x74b9ff,'S2':0x74b9ff,'000':0xffd166,'S3':0xffd166,'0000':0xff6b6b,'S4':0xff6b6b,'Color Fixer':0xffffff,'Egos':0xa55eea,'EGOS':0xa55eea,'Special':0x2ed573,'ABN_ZAYIN':0xbdc3c7,'ABN_TETH':0xf1c40f,'ABN_HE':0x2ecc71,'ABN_WAW':0x3498db,'ABN_ALEPH':0x9b59b6,'ABN_ANGELA':0xffffff };

// ─── 等級費用表 ───────────────────────────────────────────────
// Lv 1-20: 碎片 lv×5
// Lv 21-40: 碎片 lv×8 + 經驗卷 ×1
// Lv 41-60: 碎片 lv×12 + 經驗卷 ×3
function calcLevelCost(curLv, steps = 1) {
    let frags = 0, scrolls = 0;
    for (let l = curLv; l < Math.min(curLv + steps, 60); l++) {
        if      (l <= 20) { frags += l * 5; }
        else if (l <= 40) { frags += l * 8;  scrolls += 1; }
        else              { frags += l * 12; scrolls += 3; }
    }
    return { frags, scrolls };
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

// \uFF3D = ） fullwidth right square bracket (used in ［…）names)
// \uFF09 = ） fullwidth right parenthesis (used in （…）names)
// \u005D = ] ASCII right square bracket
function getShortName(name) {
    const s = String(name || '');
    const m = s.match(/[］）]]([^［（[/(（[]+?)(?:s*/|$)/);
    if (m) return m[1].trim().slice(0, 12);
    const lcb = s.match(/^LCBs+S+s+(.+?)(?:s*/|$)/);
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

    return header + blocks.join('\n');
}

function splitTextIntoChunks(text, maxBytes = MAX_TXT_BYTES) {
    const lines = String(text || '').split('\n');
    const chunks = [];
    let current = '';

    const pushCurrent = () => {
        if (current.length > 0) chunks.push(current);
        current = '';
    };

    const appendLine = (line) => {
        const next = current ? `${current}\n${line}` : line;
        if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
            current = next;
            return;
        }

        if (current) pushCurrent();

        if (Buffer.byteLength(line, 'utf8') <= maxBytes) {
            current = line;
            return;
        }

        // 單行太大就硬切
        let remaining = line;
        while (remaining.length > 0) {
            let lo = 1;
            let hi = remaining.length;
            let best = 1;

            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const piece = remaining.slice(0, mid);
                if (Buffer.byteLength(piece, 'utf8') <= maxBytes) {
                    best = mid;
                    lo = mid + 1;
                } else {
                    hi = mid - 1;
                }
            }

            const piece = remaining.slice(0, best);
            chunks.push(piece);
            remaining = remaining.slice(best);
        }
    };

    for (const line of lines) appendLine(line);
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

// ─── 玩家資料存取 ─────────────────────────────────────────────
function defaultPlayer(username) {
    const pool = getIdData().pool || {};
    const base = (pool['0'] || []).slice(0, 12);

    return {
        username,
        lunacy:         1300,
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
    p.lunacy         ??= 1300;
    if (!p.identities.length) {
        const pool = getIdData().pool || {};
        const base = (pool['0'] || pool['S1'] || []).slice(0, 12);
        if (base.length) { p.identities = [...base]; if (!p.team?.length) p.team = [...base].slice(0, 4); }
    }

    return p;
}

// 向下相容（PullSystem / GiveAwaySystem 使用）
function loadUserInventory(_client, userId) {
    return (loadPlayerData(null, userId) || {}).identities || [];
}

function saveUserInventory(client, userId, items) {
    const p = getOrCreatePlayer(client, userId, 'Player');
    p.identities = Array.isArray(items) ? items : [];
    savePlayerData(client, userId, p);
}

// ─── UI 元件 ──────────────────────────────────────────────────
function lobbyEmbed(player) {
    const team = player.team.length
        ? player.team.map(n => `• **${getShortName(n)}** Lv.${player.identityLevels[n] || 1}`).join('\n')
        : '（尚未編成）';

    return new EmbedBuilder()
        .setTitle('🚂 腦葉公司邊獄巴士 — 管理員主控台')
        .setColor(0x1a1a2e)
        .addFields(
            { name: '👤 主管',     value: player.username, inline: true },
            { name: '⭐ 等級',     value: `Lv.${player.level}`, inline: true },
            { name: '🎰 提取次數', value: `${player.totalPulls || 0} 次`, inline: true },
            { name: '💎 狂氣',     value: `${player.lunacy}`, inline: true },
            { name: '🧵 紡錘',     value: `${player.thread}`, inline: true },
            { name: '\u200b',      value: '\u200b', inline: true },
            { name: '📦 人格碎片', value: `${player.fragments}`, inline: true },
            { name: '📜 經驗卷',   value: `${player.expScrolls}`, inline: true },
            { name: '\u200b',      value: '\u200b', inline: true },
            { name: `⚔️ 出擊編成 (${player.team.length}/6)`, value: team, inline: false },
        )
        .setFooter({ text: `持有人格：${player.identities.length} 件 ／ E.G.O：${player.egos.length} 件` })
        .setTimestamp();
}

function lobbyRows() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pk_lib').setLabel('📋 人格庫').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pk_form').setLabel('⚔️ 出擊編成').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pk_cult').setLabel('🔼 人格培育').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pk_ego').setLabel('🔮 E.G.O').setStyle(ButtonStyle.Secondary),
    )];
}

function backToLobbyRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pk_home').setLabel('🏠 返回主頁').setStyle(ButtonStyle.Danger),
    );
}

// ─── !pack 主路由 ──────────────────────────────────────────────
async function showPack(client, message) {
    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const reply  = await message.reply({ embeds: [lobbyEmbed(player)], components: lobbyRows() });

    const col = reply.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) {
                i.reply({ content: '❌ 這不是您的控制台。', ephemeral: true });
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

    col.on('collect', async ix => {
        const id = ix.customId;

        // ═══ 主頁 ════════════════════════════════════════════
        if (id === 'pk_home') {
            const p = refresh();
            return ix.update({ embeds: [lobbyEmbed(p)], components: lobbyRows() });
        }

        // ═══ 人格庫 ══════════════════════════════════════════
        if (id === 'pk_lib') {
            const pool = getIdData().pool || {};
            const rarityOpts = RARITY_ORDER
                .filter(r => (pool[r] || []).length > 0)
                .map(r => ({ label: `${RARITY_LABEL[r]} (${pool[r].length}件)`, value: r }));

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_lib_rarity')
                .setPlaceholder('🔍 選擇稀有度查詢人格...')
                .addOptions(rarityOpts);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle('📋 人格庫 — 稀有度選擇')
                    .setColor(0x3a0ca3)
                    .setDescription('請選擇稀有度，查看該稀有度的所有人格資料。')],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    new ActionRowBuilder().addComponents(backToLobbyRow().components),
                ],
            });
        }

        if (id === 'pk_lib_rarity') {
            const rarity = ix.values[0];
            const pool   = getIdData().pool || {};
            const items  = (pool[rarity] || []).slice(0, 25);
            const idData = getIdData();

            const opts = items.map(name => ({
                label: getShortName(name).padEnd(2) || name.slice(0, 25),
                description: `${RARITY_LABEL[rarity]} ${idData.getIdentityData ? (idData.getIdentityData(name)?.skill1?.skillname || '') : ''}`,
                value: name.slice(0, 100),
            }));

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_lib_id')
                .setPlaceholder(`${RARITY_LABEL[rarity]} 人格列表...`)
                .addOptions(opts);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋 人格庫 — ${RARITY_LABEL[rarity]}`)
                    .setColor(RARITY_COLOR[rarity])
                    .setDescription(`共 ${(pool[rarity] || []).length} 件人格（顯示前 25 件）`)],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('pk_lib').setLabel('↩ 返回稀有度').setStyle(ButtonStyle.Secondary),
                        backToLobbyRow().components[0],
                    ),
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
                    `${owned ? `已持有 ｜ Lv.${lv} / 60` : '未持有'}\n` +
                    `完整資料已另存為 txt 檔案並送到頻道。`
                )
                .addFields(
                    { name: '📊 狀態', value: owned ? `已持有 ｜ Lv.${lv} / 60` : '未持有', inline: true },
                    { name: '📁 檔案', value: `${fileName}`, inline: true },
                )
                .setFooter({ text: owned ? `升等費用 Lv${lv}→${lv + 1}: 碎片×${calcLevelCost(lv).frags} + 卷×${calcLevelCost(lv).scrolls}` : '透過 !pull 提取此人格' });

            const actionBtns = [
                new ButtonBuilder().setCustomId('pk_lib').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                backToLobbyRow().components[0],
            ];
            if (owned) {
                actionBtns.splice(1, 0,
                    new ButtonBuilder().setCustomId(`pk_cult_do_${name.slice(0, 60)}`).setLabel('🔼 升等此人格').setStyle(ButtonStyle.Primary),
                );
            }

            try {
                await ix.update({
                    embeds: [detailEmbed],
                    components: [new ActionRowBuilder().addComponents(actionBtns)],
                });
            } catch (e) {
                console.error(`[Pack] 更新人格資料卡失敗: ${e.message}`);
            }

            try {
                const channel = message.channel;
                if (channel) {
                    const attachment = new AttachmentBuilder(Buffer.from(fileText, 'utf8'), { name: fileName });
                    await channel.send({
                        content: `📄 **${message.author.username}** 的人格完整資料：**${name}**`,
                        files: [attachment],
                    });
                }
            } catch (e) {
                console.error(`[Pack] 發送人格 txt 失敗: ${e.message}`);
                try {
                    await message.channel.send(`❌ 發送 txt 檔案失敗：${e.message}`);
                } catch {}
            }

            return;
        }

        // ═══ 出擊編成（先選罪人，再選人格）══════════════════
        if (id === 'pk_form') {
            const { showPartyUI } = require('./PartySystem.js');
            return showPartyUI(client, ix, message.author.id, message.author.username);
        }

        // ═══ 人格培育 ════════════════════════════════════════
        if (id === 'pk_cult') {
            const p   = refresh();
            const all = p.identities.slice(0, 25);
            if (!all.length) {
                return ix.update({
                    embeds: [new EmbedBuilder().setTitle('🔼 人格培育').setColor(0x57606f).setDescription('尚未持有任何人格。')],
                    components: [new ActionRowBuilder().addComponents(backToLobbyRow().components)],
                });
            }

            const opts = all.map(name => {
                const lv   = p.identityLevels[name] || 1;
                const cost = calcLevelCost(lv);
                return {
                    label:       `${getShortName(name).slice(0, 20)} (Lv.${lv}/60)`,
                    description: `升一級需碎片×${cost.frags}${cost.scrolls ? ` + 卷×${cost.scrolls}` : ''}`,
                    value:       name.slice(0, 100),
                };
            });

            const menu = new StringSelectMenuBuilder()
                .setCustomId('pk_cult_select')
                .setPlaceholder('選擇要培育的人格...')
                .addOptions(opts);

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle('🔼 人格培育')
                    .setColor(0xffd166)
                    .setDescription(`📦 人格碎片：**${p.fragments}** ／ 📜 經驗卷：**${p.expScrolls}**`)],
                components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(backToLobbyRow().components)],
            });
        }

        if (id === 'pk_cult_select' || id.startsWith('pk_cult_do_')) {
            const name = id.startsWith('pk_cult_do_') ? id.slice('pk_cult_do_'.length) : ix.values[0];
            return showCultivation(ix, name, refresh, save);
        }

        if (id.startsWith('pk_lvup_')) {
            const parts = id.split('_');
            const steps = parseInt(parts[2]) || 1;
            const name  = parts.slice(3).join('_');
            const p     = refresh();
            const lv    = p.identityLevels[name] || 1;

            if (lv >= 60) return ix.reply({ content: '⛔ 已達最高等級 Lv.60。', ephemeral: true });

            const realSteps = Math.min(steps, 60 - lv);
            const cost = calcLevelCost(lv, realSteps);

            if (p.fragments < cost.frags) return ix.reply({ content: `❌ 碎片不足！需要 ${cost.frags}，持有 ${p.fragments}。`, ephemeral: true });
            if (p.expScrolls < cost.scrolls) return ix.reply({ content: `❌ 經驗卷不足！需要 ${cost.scrolls}，持有 ${p.expScrolls}。`, ephemeral: true });

            p.fragments -= cost.frags;
            p.expScrolls -= cost.scrolls;
            p.identityLevels[name] = lv + realSteps;
            save(p);

            return showCultivation(ix, name, refresh, save);
        }

        // ═══ E.G.O ═══════════════════════════════════════════
        if (id === 'pk_ego') {
            const p   = refresh();
            const desc = p.egos.length
                ? p.egos.map((e, i) => `${i + 1}. 🔮 ${e}`).join('\n')
                : '您尚未持有任何 E.G.O。';

            return ix.update({
                embeds: [new EmbedBuilder()
                    .setTitle('🔮 E.G.O 庫')
                    .setColor(0xa55eea)
                    .setDescription(desc)
                    .setFooter({ text: `共 ${p.egos.length} 件 E.G.O` })],
                components: [new ActionRowBuilder().addComponents(backToLobbyRow().components)],
            });
        }
    });

    col.on('end', () => reply.edit({ components: [] }).catch(() => {}));
}

async function showCultivation(ix, name, refresh, save) {
    const p    = refresh();
    const lv   = p.identityLevels[name] || 1;
    const cost1  = calcLevelCost(lv, 1);
    const cost10 = calcLevelCost(lv, 10);
    const maxCost = calcLevelCost(lv, 60 - lv);
    const rarity  = findRarity(name);

    const embed = new EmbedBuilder()
        .setTitle(`🔼 人格培育 — ${getShortName(name)}`)
        .setColor(RARITY_COLOR[rarity])
        .addFields(
            { name: '📊 等級', value: `Lv.**${lv}** / 60`, inline: true },
            { name: '📦 持有碎片', value: `${p.fragments}`, inline: true },
            { name: '📜 持有卷', value: `${p.expScrolls}`, inline: true },
            lv < 60
                ? { name: '💰 升1級費用', value: `碎片×${cost1.frags}${cost1.scrolls ? ` + 卷×${cost1.scrolls}` : ''}`, inline: true }
                : { name: '🏆 狀態', value: '**最高等級**', inline: true },
            lv + 10 <= 60
                ? { name: '💰 升10級費用', value: `碎片×${cost10.frags}${cost10.scrolls ? ` + 卷×${cost10.scrolls}` : ''}`, inline: true }
                : { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `${RARITY_LABEL[rarity]} ｜ 升到滿級需: 碎片×${maxCost.frags}${maxCost.scrolls ? ` + 卷×${maxCost.scrolls}` : ''}` });

    const btnKey = name.slice(0, 55);
    const buttons = [
        new ButtonBuilder().setCustomId(`pk_lvup_1_${btnKey}`).setLabel('+1 級').setStyle(ButtonStyle.Primary).setDisabled(lv >= 60),
        new ButtonBuilder().setCustomId(`pk_lvup_10_${btnKey}`).setLabel('+10 級').setStyle(ButtonStyle.Primary).setDisabled(lv + 10 > 60),
        new ButtonBuilder().setCustomId('pk_cult').setLabel('↩ 返回培育').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pk_home').setLabel('🏠 主頁').setStyle(ButtonStyle.Danger),
    ];

    return ix.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] });
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

function renderPage(pages, idx) {
    const p = pages[idx];
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
        return `\`${isUp ? '🔼 ' : '• '}${getShortName(name).padEnd(14)} .....[${pct}%]\``;
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

    const rep = await message.reply({ embeds: [renderPage(pages, idx)], components: navRow(idx) });
    const col = rep.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120_000 });

    col.on('collect', async i => {
        if (i.customId === 'ls_prev') idx = Math.max(0, idx - 1);
        if (i.customId === 'ls_next') idx = Math.min(pages.length - 1, idx + 1);
        await i.update({ embeds: [renderPage(pages, idx)], components: navRow(idx) });
    });
    col.on('end', () => rep.edit({ components: [] }).catch(() => {}));
}

// ─── 主路由 ───────────────────────────────────────────────────
async function handleInventory(client, message) {
    const raw = message.content.trim();
    if (raw === '!list' || raw === '!清單') return showList(message);
    return showPack(client, message);
}

module.exports = {
    handleInventory,
    loadPlayerData,
    savePlayerData,
    getOrCreatePlayer,
    loadUserInventory,
    saveUserInventory,
    findRarity,
    calcLevelCost,
    // 需要手動強制同步時可以從外部呼叫
    sendBackupTxtToChannel,
};
