// Functions/GameSystem/PacksAndData.js
// !pack（背包 + 隊伍 + 升等 UI）/ !list（翻頁機率清單）
const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const identitiesData = require('./Pulls/identitiesData.js');

const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID || '1510947300212477972';

// ── 機率常數（與 PullSystem 保持一致）─────────────────────────
const BASE_RATES = {
    '0':           0.8359857,
    '00':          0.12,
    '000':         0.029,
    'Egos':        0.013,
    '0000':        0.001,
    'Special':     0.001,
    'Color Fixer': 0.0000143,
};
const RATE_UP_MULT = 5;

// ── !list 顯示順序 ─────────────────────────────────────────────
const RARITY_ORDER = ['0', '00', '000', '0000', 'Color Fixer', 'Special', 'Egos'];

// ─── 背包快取 ─────────────────────────────────────────────────
const invCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// ── 輔助：反查稀有度 ──────────────────────────────────────────
function findRarity(name) {
    const pool = identitiesData.pool || identitiesData.identities || {};
    for (const r of Object.keys(pool)) {
        if ((pool[r] || []).includes(name)) return r;
    }
    return '0';
}

function rarityLabel(r) {
    return ({ '0': '★', '00': '★★', '000': '★★★', '0000': '★★★★', 'Color Fixer': '👑 CF', 'Special': '🌀 SP', 'Egos': '🔮 EGO' })[r] || r;
}

function rarityColor(r) {
    return ({ '0': 0x57606f, '00': 0x74b9ff, '000': 0xffd166, '0000': 0xff6b6b, 'Color Fixer': 0xffffff, 'Special': 0x2ed573, 'Egos': 0xa55eea })[r] || 0x5865f2;
}

function normalizeUpList(r) {
    const src = identitiesData.upTargets || identitiesData.rateUpIds || {};
    const v = src[r];
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') return [v];
    if (v?.names) return v.names.filter(Boolean);
    return [];
}

// ─── Discord 頻道存取 ──────────────────────────────────────────
async function loadPlayerData(client, userId) {
    const cached = invCache.get(userId);
    if (cached && Date.now() - cached.time < CACHE_TTL) return JSON.parse(JSON.stringify(cached.data));
    try {
        const ch = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!ch) return null;
        const msgs = await ch.messages.fetch({ limit: 100 });
        const found = msgs.find(m => m.author.bot && m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`));
        if (found) {
            const data = JSON.parse(found.content.split(' || ')[2]);
            invCache.set(userId, { data, time: Date.now() });
            return JSON.parse(JSON.stringify(data));
        }
    } catch (e) {
        console.error(`[PacksAndData] 讀取失敗 ${userId}:`, e.message);
    }
    return null;
}

async function savePlayerData(client, userId, data) {
    invCache.set(userId, { data: JSON.parse(JSON.stringify(data)), time: Date.now() });
    try {
        const ch = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (ch) await ch.send(`📥 DATA_SAVE || ${userId} || ${JSON.stringify(data)}`);
    } catch (e) {
        console.error(`[PacksAndData] 儲存失敗 ${userId}:`, e.message);
    }
}

function defaultPlayer(username) {
    const pool = identitiesData.pool || identitiesData.identities || {};
    const base = (pool['0'] || []).slice(0, 4);
    return {
        username,
        lunacy: 1300,
        identities: [...base],
        egos: [],
        team: [...base],
        level: 1, exp: 0, thread: 0,
        stageProgress: 1,
        identityLevels: {},
    };
}

async function getOrCreatePlayer(client, userId, username) {
    let p = await loadPlayerData(client, userId);
    if (!p) { p = defaultPlayer(username); await savePlayerData(client, userId, p); }
    p.level             ??= 1;
    p.exp               ??= 0;
    p.thread            ??= 0;
    p.team              ??= [];
    p.egos              ??= [];
    p.identityLevels    ??= {};
    p.stageProgress     ??= 1;
    return p;
}

// ─── !pack ────────────────────────────────────────────────────
async function showPack(client, message) {
    const waitMsg = await message.reply('「主管，正在遠端對齊您的個人收容數據...」');
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);

    const allItems = [
        ...player.identities,
        ...player.egos.map(e => `[E.G.O] ${e}`),
    ];
    const PAGE_SIZE = 8;
    const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
    let page = 0;

    function makeEmbed(p) {
        const start = p * PAGE_SIZE;
        const slice = allItems.slice(start, start + PAGE_SIZE);

        const teamLines = (player.team || []).map(name => {
            const r = findRarity(name);
            const lv = player.identityLevels[name] || 1;
            return `• **${name}** Lv.${lv} [${rarityLabel(r)}]`;
        }).join('\n') || '（尚未編制隊伍）';

        const itemLines = slice.map((v, i) => {
            const isEgo = v.startsWith('[E.G.O] ');
            const clean = isEgo ? v.replace('[E.G.O] ', '') : v;
            const r = findRarity(clean);
            const lv = player.identityLevels[clean] || 1;
            const lvStr = isEgo ? '' : ` Lv.${lv}`;
            return `**${start + i + 1}.** ${v}${lvStr} \`[${rarityLabel(r)}]\``;
        }).join('\n') || '背包空空如一，請執行 `!pull` 提取人格。';

        return new EmbedBuilder()
            .setTitle(`🎒 ${message.author.username} 的收容倉庫`)
            .setColor(0x4cc9f0)
            .addFields(
                { name: '💎 狂氣',    value: `${player.lunacy}`,      inline: true },
                { name: '🧵 紡錘',    value: `${player.thread}`,      inline: true },
                { name: '⭐ 核心等級', value: `Lv.${player.level}`,  inline: true },
                { name: '👥 當前出擊隊伍', value: teamLines, inline: false },
            )
            .setDescription(`### 持有清單 (${start + 1}~${Math.min(start + PAGE_SIZE, allItems.length)} / ${allItems.length} 件)\n${itemLines}`)
            .setFooter({ text: `分頁 ${p + 1}/${totalPages}` });
    }

    function makeRow(p) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pack_prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(p === 0),
            new ButtonBuilder().setCustomId('pack_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(p >= totalPages - 1),
            new ButtonBuilder().setCustomId('pack_team').setLabel('👥 編制隊伍').setStyle(ButtonStyle.Success).setDisabled(!player.identities.length),
            new ButtonBuilder().setCustomId('pack_upgrade').setLabel('🔼 人格升等').setStyle(ButtonStyle.Secondary).setDisabled(!player.identities.length),
        )];
    }

    const packMsg = await waitMsg.edit({ content: null, embeds: [makeEmbed(page)], components: makeRow(page) });
    const col = packMsg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 90_000 });

    col.on('collect', async interaction => {
        // 翻頁
        if (interaction.customId === 'pack_prev') { page = Math.max(0, page - 1); return interaction.update({ embeds: [makeEmbed(page)], components: makeRow(page) }); }
        if (interaction.customId === 'pack_next') { page = Math.min(totalPages - 1, page + 1); return interaction.update({ embeds: [makeEmbed(page)], components: makeRow(page) }); }

        // 編制隊伍
        if (interaction.customId === 'pack_team') {
            const opts = player.identities.slice(0, 25).map(name => ({
                label: `${name.slice(0, 25)} (Lv.${player.identityLevels[name] || 1})`,
                description: `星等：${rarityLabel(findRarity(name))}`,
                value: name,
            }));
            const menu = new StringSelectMenuBuilder()
                .setCustomId('team_select')
                .setPlaceholder('選擇出擊隊伍（最多 7 人）...')
                .setMinValues(1).setMaxValues(Math.min(7, opts.length))
                .addOptions(opts);
            return interaction.update({
                content: '💡 請選擇出擊隊伍成員（最多 7 人）：',
                embeds: [],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pack_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary)),
                ],
            });
        }

        // 人格升等
        if (interaction.customId === 'pack_upgrade') {
            const opts = player.identities.slice(0, 25).map(name => {
                const lv   = player.identityLevels[name] || 1;
                const cost = lv * 10;
                return {
                    label:       `${name.slice(0, 25)} (當前 Lv.${lv})`,
                    description: `${rarityLabel(findRarity(name))} | 升級費用：紡錘 ×${cost}`,
                    value:       name,
                };
            });
            const menu = new StringSelectMenuBuilder()
                .setCustomId('upgrade_select')
                .setPlaceholder('選擇要升等的人格...')
                .addOptions(opts);
            return interaction.update({
                content: `🔼 **人格升等模組**\n持有紡錘：**${player.thread}** 個\n請選擇目標：`,
                embeds: [],
                components: [
                    new ActionRowBuilder().addComponents(menu),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pack_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary)),
                ],
            });
        }

        // 隊伍選擇確認
        if (interaction.customId === 'team_select') {
            player.team = interaction.values;
            await savePlayerData(client, message.author.id, player);
            return interaction.update({ content: '✅ **隊伍編制完成！**', embeds: [makeEmbed(page)], components: makeRow(page) });
        }

        // 升等確認
        if (interaction.customId === 'upgrade_select') {
            const target = interaction.values[0];
            const lv     = player.identityLevels[target] || 1;
            const cost   = lv * 10;
            if (player.thread < cost) {
                return interaction.reply({ content: `❌ 升等 \`${target}\` 需要紡錘 ×${cost}，目前持有 ×${player.thread}。`, ephemeral: true });
            }
            player.thread -= cost;
            player.identityLevels[target] = lv + 1;
            await savePlayerData(client, message.author.id, player);

            // 重新整理選單讓使用者繼續升等
            const newOpts = player.identities.slice(0, 25).map(name => {
                const l = player.identityLevels[name] || 1;
                return { label: `${name.slice(0, 25)} (當前 Lv.${l})`, description: `${rarityLabel(findRarity(name))} | 費用：×${l * 10}`, value: name };
            });
            const newMenu = new StringSelectMenuBuilder().setCustomId('upgrade_select').setPlaceholder('繼續升等...').addOptions(newOpts);
            return interaction.update({
                content: `🎉 **${target}** 晉升至 **Lv.${lv + 1}**！消耗紡錘 ×${cost}，剩餘 ×${player.thread}。`,
                components: [
                    new ActionRowBuilder().addComponents(newMenu),
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pack_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary)),
                ],
            });
        }

        // 返回
        if (interaction.customId === 'pack_back') {
            return interaction.update({ content: null, embeds: [makeEmbed(page)], components: makeRow(page) });
        }
    });

    col.on('end', () => {
        packMsg.edit({ components: [] }).catch(() => {});
    });
}

// ─── !list（翻頁 + 每項個別機率）────────────────────────────────
const ITEMS_PER_PAGE = 12;

function buildListPages() {
    const pages = [];
    const pool = identitiesData.pool || identitiesData.identities || {};

    // 第 0 頁：機率總覽
    const overview = RARITY_ORDER.map(r => {
        const count = (pool[r] || []).length;
        const pct   = ((BASE_RATES[r] || 0) * 100).toFixed(4);
        const up    = normalizeUpList(r);
        return `${rarityLabel(r).padEnd(12)} 機率：\`${pct}%\` 共 ${count} 項${up.length ? ` ⬆️ UP×${up.length}` : ''}`;
    });
    pages.push({ type: 'summary', title: '🗂️ 核心控制室 — 扭蛋池機率清單', color: 0x3a0ca3, desc: overview.join('\n') });

    // 各稀有度分頁（依指定順序）
    for (const r of RARITY_ORDER) {
        const items = pool[r] || [];
        if (!items.length) continue;

        const upList = normalizeUpList(r);
        let totalWeight = items.reduce((s, n) => s + (upList.includes(n) ? RATE_UP_MULT : 1), 0);

        const chunks = [];
        for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) chunks.push(items.slice(i, i + ITEMS_PER_PAGE));

        chunks.forEach((chunk, ci) => {
            pages.push({ type: 'pool', r, chunk, ci, ct: chunks.length, total: items.length, upList, totalWeight });
        });
    }
    return pages;
}

function renderListPage(pages, idx) {
    const p = pages[idx];
    const foot = `總分頁：${idx + 1}/${pages.length} | 120秒後按鈕失效`;

    if (p.type === 'summary') {
        return new EmbedBuilder().setTitle(p.title).setColor(p.color).setDescription(p.desc).setFooter({ text: foot });
    }

    const base = BASE_RATES[p.r] || 0;
    const lines = p.chunk.map(name => {
        const isUp  = p.upList.includes(name);
        const w     = isUp ? RATE_UP_MULT : 1;
        const pct   = ((base * (w / p.totalWeight)) * 100).toFixed(4);
        const prefix = isUp ? `🔼 [UP] ${name}` : `• ${name}`;
        // 視覺對齊（全形2、半形1）
        let vw = 0;
        for (const c of prefix) vw += c.charCodeAt(0) > 128 ? 2 : 1;
        const dots = '.'.repeat(Math.max(2, 50 - vw));
        return `\`${prefix} ${dots} [${pct}%]\``;
    });

    const header = `• 階級總機率：\`${(base * 100).toFixed(4)}%\`  • 總計：\`${p.total}\` 項\n\n`;

    return new EmbedBuilder()
        .setTitle(`🗂️ 核心控制室 — 扭蛋池機率清單`)
        .setColor(rarityColor(p.r))
        .setDescription(`### ${rarityLabel(p.r)} (${p.ci + 1}/${p.ct} 頁)\n${header}${lines.join('\n')}`)
        .setFooter({ text: foot });
}

function makeNavRow(idx, total, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('list_first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || idx === 0),
        new ButtonBuilder().setCustomId('list_prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(disabled || idx === 0),
        new ButtonBuilder().setCustomId('list_next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || idx >= total - 1),
        new ButtonBuilder().setCustomId('list_last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || idx >= total - 1),
    )];
}

async function showList(message) {
    const pages = buildListPages();
    let idx = 0;
    const reply = await message.reply({ embeds: [renderListPage(pages, idx)], components: makeNavRow(idx, pages.length) });

    const col = reply.createMessageComponentCollector({ filter: i => {
        if (i.user.id !== message.author.id) { i.reply({ content: '❌ 請自行輸入 `!list` 建立獨立面板。', ephemeral: true }); return false; }
        return true;
    }, time: 120_000 });

    col.on('collect', async i => {
        if (i.customId === 'list_first') idx = 0;
        if (i.customId === 'list_prev')  idx = Math.max(0, idx - 1);
        if (i.customId === 'list_next')  idx = Math.min(pages.length - 1, idx + 1);
        if (i.customId === 'list_last')  idx = pages.length - 1;
        await i.update({ embeds: [renderListPage(pages, idx)], components: makeNavRow(idx, pages.length) });
    });

    col.on('end', () => reply.edit({ components: makeNavRow(idx, pages.length, true) }).catch(() => {}));
}

// ─── 主路由 ───────────────────────────────────────────────────
async function handleInventory(client, message) {
    const raw = message.content.trim();
    if (raw === '!list' || raw === '!清單') return showList(message);
    return showPack(client, message);
}

module.exports = { handleInventory, loadPlayerData, savePlayerData, getOrCreatePlayer, findRarity };
