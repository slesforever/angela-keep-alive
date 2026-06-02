// Functions/GameSystem/PacksAndData.js
const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
} = require('discord.js');
const identitiesData = require('./Pulls/identitiesData.js');

const STORAGE_CHANNEL_ID = '1510947300212477972';

// ─── 快取（避免每次都掃 100 則訊息）────────────────────────────
const inventoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function loadUserInventory(client, userId) {
    const cached = inventoryCache.get(userId);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return [...cached.data];
    }

    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) return [];

        const messages = await channel.messages.fetch({ limit: 100 });
        const targetMsg = messages.find(m =>
            m.author.bot && m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`)
        );

        if (targetMsg) {
            const parts = targetMsg.content.split(' || ');
            const data = JSON.parse(parts[2]);
            inventoryCache.set(userId, { data, time: Date.now() });
            return [...data];
        }
    } catch (err) {
        console.error(`❌ 讀取玩家 ${userId} 背包失敗:`, err.message);
    }
    return [];
}

async function saveUserInventory(client, userId, inventory) {
    inventoryCache.set(userId, { data: [...inventory], time: Date.now() });
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        if (!channel) return;
        await channel.send(`📥 DATA_SAVE || ${userId} || ${JSON.stringify(inventory)}`);
        console.log(`💾 玩家 ${userId} 背包已儲存（${inventory.length} 件）`);
    } catch (err) {
        console.error(`❌ 寫入玩家 ${userId} 背包失敗:`, err.message);
    }
}

// ─── !list 翻頁系統 ────────────────────────────────────────────
const RATE_TABLE = {
    'Egos': { label: '🔮 E.G.O', prob: '1.5%', color: 0xa55eea },
    '000':  { label: '✨ ★★★ 精英人格', prob: '3%', color: 0xffd166 },
    '00':   { label: '⭐ ★★ 標準人格', prob: '15.5%', color: 0x74b9ff },
    '0':    { label: '📦 ★ 一般人格', prob: '80%', color: 0x57606f },
};

function buildListPages() {
    const pages = [];
    const ITEMS_PER_PAGE = 20;

    // 第 0 頁：機率總覽 + Rate Up
    const rateUpLines = [];
    const up = identitiesData.upTargets || {};
    for (const [rarity, items] of Object.entries(up)) {
        if (!Array.isArray(items) || !items.length) continue;
        const info = RATE_TABLE[rarity];
        if (!info) continue;
        rateUpLines.push(`**${info.label}（Rate Up ${info.prob}）**`);
        items.forEach(i => rateUpLines.push(`• ${i}`));
    }

    pages.push({
        type: 'summary',
        title: '📊 物資庫 — 機率總覽 & 當前 Rate Up',
        color: 0xffa502,
        description:
            Object.entries(RATE_TABLE)
                .map(([k, v]) => `${v.label}：**${v.prob}**（池內 ${(identitiesData.pool[k] || []).length} 項）`)
                .join('\n') +
            '\n\n' +
            (rateUpLines.length
                ? '**🎯 當前 Rate Up：**\n' + rateUpLines.join('\n')
                : '目前沒有 Rate Up 對象'),
    });

    // 後續頁：各稀有度分頁
    for (const [rarity, info] of Object.entries(RATE_TABLE)) {
        const pool = identitiesData.pool[rarity] || [];
        const chunks = [];
        for (let i = 0; i < pool.length; i += ITEMS_PER_PAGE) {
            chunks.push(pool.slice(i, i + ITEMS_PER_PAGE));
        }
        chunks.forEach((chunk, idx) => {
            pages.push({
                type: 'pool',
                rarity,
                title: `${info.label} （機率 ${info.prob}）`,
                color: info.color,
                items: chunk,
                sub: idx + 1,
                subTotal: chunks.length,
                total: pool.length,
            });
        });
    }

    return pages;
}

function renderListPage(pages, idx) {
    const p = pages[idx];
    const embed = new EmbedBuilder()
        .setColor(p.color)
        .setFooter({ text: `第 ${idx + 1} 頁 / 共 ${pages.length} 頁 | 使用下方按鈕翻頁` })
        .setTimestamp();

    if (p.type === 'summary') {
        embed.setTitle(p.title).setDescription(p.description);
    } else {
        embed
            .setTitle(`${p.title}  ─  第 ${p.sub}/${p.subTotal} 頁`)
            .setDescription(
                `共 **${p.total}** 項可提取物資\n\n` +
                p.items.map((item, i) => `\`${(p.sub - 1) * 20 + i + 1}.\` ${item}`).join('\n')
            );
    }

    return embed;
}

function buildPaginationRow(currentIdx, total, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('list_first')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentIdx === 0),
        new ButtonBuilder()
            .setCustomId('list_prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentIdx === 0),
        new ButtonBuilder()
            .setCustomId('list_next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || currentIdx >= total - 1),
        new ButtonBuilder()
            .setCustomId('list_last')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || currentIdx >= total - 1)
    );
}

async function showList(message) {
    const pages = buildListPages();
    let idx = 0;

    const embed = renderListPage(pages, idx);
    const row = buildPaginationRow(idx, pages.length);

    const reply = await message.reply({ embeds: [embed], components: [row] });

    const collector = reply.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 120_000,
    });

    collector.on('collect', async interaction => {
        if (interaction.customId === 'list_prev')  idx = Math.max(0, idx - 1);
        if (interaction.customId === 'list_next')  idx = Math.min(pages.length - 1, idx + 1);
        if (interaction.customId === 'list_first') idx = 0;
        if (interaction.customId === 'list_last')  idx = pages.length - 1;

        await interaction.update({
            embeds: [renderListPage(pages, idx)],
            components: [buildPaginationRow(idx, pages.length)],
        });
    });

    collector.on('end', () => {
        reply.edit({ components: [buildPaginationRow(idx, pages.length, true)] }).catch(() => {});
    });
}

// ─── !pack 背包 ───────────────────────────────────────────────
async function showPack(client, message) {
    const userId = message.author.id;
    const loadingMsg = await message.reply('「主管，正在遠端對齊您的個人收容數據...」');

    const userInventory = await loadUserInventory(client, userId);

    if (userInventory.length === 0) {
        return loadingMsg.edit('「主管，您的收容室尚無任何紀錄。請先使用 `!pull` 提取人格。」');
    }

    const itemCounts = {};
    userInventory.forEach(item => {
        itemCounts[item] = (itemCounts[item] || 0) + 1;
    });

    const allLines = Object.entries(itemCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([item, count]) => `• **${item}**${count > 1 ? ` ×${count}` : ''}`);

    const MAX_DESC = 3800;
    let description = '### 已同步的人格與 E.G.O：\n\n';
    let shown = 0;
    for (const line of allLines) {
        if ((description + line + '\n').length > MAX_DESC) {
            description += `\n_…另有 ${allLines.length - shown} 種未顯示（共 ${userInventory.length} 件）_`;
            break;
        }
        description += line + '\n';
        shown++;
    }

    const packEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle('🗃️ 邊獄公司 — 個人收容倉庫')
        .setColor(0x2ed573)
        .setDescription(description)
        .setFooter({ text: `ID: ${userId} | 總計 ${userInventory.length} 件` })
        .setTimestamp();

    return loadingMsg.edit({ content: null, embeds: [packEmbed] });
}

// ─── 指令分派入口 ─────────────────────────────────────────────
async function handleInventory(client, message) {
    const msg = message.content.trim();
    if (msg === '!list' || msg === '!清單') return showList(message);
    if (msg === '!pack' || msg === '!bag' || msg === '!背包') return showPack(client, message);
}

module.exports = { handleInventory, loadUserInventory, saveUserInventory };
