const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const STORAGE_CHANNEL_ID = '1510947300212477972';

// ── 🎲 1. 串接抽卡系統（高相容性，防大小寫地雷） ──────────────────────
let PullSystem;
try {
    PullSystem = require('./Pulls/PullSystem.js');
} catch (e) {
    try {
        PullSystem = require('./pulls/PullSystem.js');
    } catch (err) {
        PullSystem = { POOLS: {}, upTargets: [] };
    }
}

// ── 📊 2. 定義各階級基礎機率（已更新為你的最新機率） ──────────────────
const TIER_RATES = {
    colorFixer: 0.0000013,  // 0.00013% (色彩收尾人)
    special: 0.00015,       // 0.015% (特殊池)
    tier0000: 0.005,        // 0.5% (👑 0000)
    tier000: 0.029,         // 2.9% (🌟 000 三星人格)
    tier00: 0.128,          // 12.8% (⭐ 00 二星人格)
    tier0: 0.803,           // 80.3% (⚪ 0 初始一星)
    egos: 0.015             // 1.5% (🔮 E.G.O)
};

const RATE_UP_FRACTION = 0.5; // UP 佔階級機率的 50%

const TIER_ORDER = ['colorFixer', 'special', 'tier0000', 'tier000', 'tier00', 'tier0', 'egos'];
const TIER_NAMES = {
    colorFixer: '🔴 Color Fixer (色彩收尾人)',
    special: '✨ Special (特殊池)',
    tier0000: '👑 0000',
    tier000: '🌟 000 (三星人格)',
    tier00: '⭐ 00 (二星人格)',
    tier0: '⚪ 0 (初始一星)',
    egos: '🔮 E.G.O'
};

function getPoolTier(pools, tierKey) {
    if (!pools) return [];
    if (pools[tierKey]) return pools[tierKey];
    const lowerKey = tierKey.toLowerCase();
    for (const key of Object.keys(pools)) {
        if (key.toLowerCase() === lowerKey) return pools[key];
    }
    if (lowerKey === 'egos' && (pools['ego'] || pools['Egos'] || pools['EGO'])) {
        return pools['ego'] || pools['Egos'] || pools['EGO'];
    }
    return [];
}

// ── 📥 3. 雲端資料庫存取（保留你原有的格式與優化清理） ─────────────────
async function loadUserInventory(client, userId) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        const messages = await channel.messages.fetch({ limit: 100 });
        const targetMsg = messages.find(m => m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`));
        if (targetMsg) {
            const parts = targetMsg.content.split(' || ');
            if (parts[2]) {
                return JSON.parse(parts[2]);
            }
        }
    } catch (e) {
        console.error("Error loading inventory:", e);
    }
    return [];
}

async function saveUserInventory(client, userId, inventory) {
    try {
        const channel = await client.channels.fetch(STORAGE_CHANNEL_ID);
        const messages = await channel.messages.fetch({ limit: 100 });
        const oldMessages = messages.filter(m => m.content.startsWith(`📥 DATA_SAVE || ${userId} ||`));
        for (const msg of oldMessages.values()) {
            await msg.delete().catch(() => {});
        }
        await channel.send(`📥 DATA_SAVE || ${userId} || ${JSON.stringify(inventory)}`);
    } catch (e) {
        console.error("Error saving inventory:", e);
    }
}

// ── 🎒 4. 背包查詢系統（防溢出分頁版） ────────────────────────────────
async function handleInventory(client, message) {
    try {
        const userId = message.author.id;
        const rawInventory = await loadUserInventory(client, userId);

        if (!rawInventory || rawInventory.length === 0) {
            return message.reply('🎒 你的背包空空如也... 快去使用 `!pull` 進行提取吧！');
        }

        // 統計數量並分類
        const counts = rawInventory.reduce((acc, item) => {
            acc[item] = (acc[item] || 0) + 1;
            return acc;
        }, {});

        const pools = PullSystem.POOLS || PullSystem.pools || {};
        const lines = [];

        const categorized = {};
        TIER_ORDER.forEach(t => categorized[t] = []);
        const uncategorized = [];

        Object.entries(counts).forEach(([itemName, count]) => {
            let foundTier = null;
            for (const tier of TIER_ORDER) {
                const itemsInTier = getPoolTier(pools, tier);
                if (itemsInTier.includes(itemName)) {
                    foundTier = tier;
                    break;
                }
            }
            if (foundTier) {
                categorized[foundTier].push(`• **${itemName}** x${count}`);
            } else {
                uncategorized.push(`• **${itemName}** x${count}`);
            }
        });

        TIER_ORDER.forEach(tier => {
            const list = categorized[tier];
            if (list && list.length > 0) {
                lines.push(`\n**${TIER_NAMES[tier]}** (${list.length} 件)`);
                lines.push(...list);
            }
        });

        if (uncategorized.length > 0) {
            lines.push(`\n**📦 其他物資** (${uncategorized.length} 件)`);
            lines.push(...uncategorized);
        }

        const PAGES = [];
        const LINES_PER_PAGE = 12;
        for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
            PAGES.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
        }

        await createPagination(
            message, 
            PAGES, 
            `🎒 ${message.author.username} 的個人背包`, 
            `已解鎖：${Object.keys(counts).length} 種物資`
        );

    } catch (error) {
        console.error('Inventory Command Error:', error);
        message.reply('❌ 讀取背包時發生錯誤，請稍後再試。');
    }
}

// ── 📋 5. 機率清單系統（防溢出分頁版） ────────────────────────────────
async function handleList(client, message) {
    try {
        const pools = PullSystem.POOLS || PullSystem.pools || {};
        const upTargets = PullSystem.upTargets || PullSystem.rateUpIds || PullSystem.targetIdentities || [];
        
        const ratesMap = new Map();
        const lines = [];

        for (const tier of TIER_ORDER) {
            const items = getPoolTier(pools, tier);
            const totalTierRate = TIER_RATES[tier] || 0;
            if (!items || items.length === 0 || totalTierRate === 0) continue;

            const tierUpTargets = items.filter(item => upTargets.includes(item));
            const numUp = tierUpTargets.length;
            const numNormal = items.length - numUp;

            if (numUp > 0) {
                const upShare = totalTierRate * RATE_UP_FRACTION;
                const normalShare = totalTierRate * (1 - RATE_UP_FRACTION);

                const upRatePerItem = upShare / numUp;
                const normalRatePerItem = numNormal > 0 ? (normalShare / numNormal) : 0;

                items.forEach(item => {
                    const isUp = upTargets.includes(item);
                    ratesMap.set(item, {
                        rate: isUp ? upRatePerItem : normalRatePerItem,
                        isUp: isUp,
                        tier: tier
                    });
                });
            } else {
                const ratePerItem = totalTierRate / items.length;
                items.forEach(item => {
                    ratesMap.set(item, {
                        rate: ratePerItem,
                        isUp: false,
                        tier: tier
                    });
                });
            }
        }

        TIER_ORDER.forEach(tier => {
            const items = getPoolTier(pools, tier);
            if (!items || items.length === 0) return;

            lines.push(`\n**${TIER_NAMES[tier]}**`);
            items.forEach(item => {
                const data = ratesMap.get(item);
                if (!data) return;
                
                // 動態計算極低機率時，使用 toFixed 自動調整精度，防出現 0.0000%
                let decimalPlaces = 4;
                if (data.rate < 0.0001) decimalPlaces = 6;
                if (data.rate < 0.00001) decimalPlaces = 8;
                
                const ratePercent = (data.rate * 100).toFixed(decimalPlaces) + '%';

                if (data.isUp) {
                    lines.push(`> 🔺 **${item}** — \`${ratePercent}\` **[UP!]**`);
                } else {
                    lines.push(`• ${item} — \`${ratePercent}\``);
                }
            });
        });

        const PAGES = [];
        const LINES_PER_PAGE = 15;
        for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
            PAGES.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
        }

        if (PAGES.length === 0) {
            return message.reply('❌ 目前提取池內沒有任何角色資料。');
        }

        await createPagination(message, PAGES, '📋 補給提取物資與動態機率清單', `總計品項：${ratesMap.size} 個`);

    } catch (error) {
        console.error('List Command Error:', error);
        message.reply('❌ 讀取清單時發生錯誤，請聯絡開發者。');
    }
}

// ── 🔘 6. 共用分頁核心邏輯 ──────────────────────────────────────────
async function createPagination(message, pages, title, footerSuffix) {
    let currentPage = 0;

    const getRow = (pageIdx, total) => {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀️ 上一頁')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageIdx === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('下一頁 ▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(pageIdx === total - 1)
        );
    };

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x00b4d8)
        .setDescription(pages[currentPage])
        .setFooter({ text: `第 ${currentPage + 1} / ${pages.length} 頁 ｜ ${footerSuffix}` });

    const reply = await message.reply({
        embeds: [embed],
        components: pages.length > 1 ? [getRow(currentPage, pages.length)] : []
    });

    if (pages.length <= 1) return;

    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '❌ 這不是你的介面喔！', ephemeral: true });
        }

        if (interaction.customId === 'prev') {
            currentPage--;
        } else if (interaction.customId === 'next') {
            currentPage++;
        }

        embed.setDescription(pages[currentPage])
             .setFooter({ text: `第 ${currentPage + 1} / ${pages.length} 頁 ｜ ${footerSuffix}` });

        await interaction.update({
            embeds: [embed],
            components: [getRow(currentPage, pages.length)]
        });
    });

    collector.on('end', () => {
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Primary).setDisabled(true)
        );
        reply.edit({ components: [disabledRow] }).catch(() => {});
    });
}

module.exports = { 
    handleInventory, 
    loadUserInventory, 
    saveUserInventory, 
    handleList 
};
