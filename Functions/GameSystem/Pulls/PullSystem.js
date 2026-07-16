const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
// 因為和 PullSystem.js 在同一個資料夾，直接相對路徑引入
const PullSystem = require('./PullSystem.js');

// ── 🎲 1. 你的最新自訂機率設定 ──────────────────────────────────────
const TIER_RATES = {
    colorFixer: 0.0000013,  // 0.00013%
    special: 0.00015,       // 0.015%
    tier0000: 0.005,        // 0.5%
    tier000: 0.029,         // 2.9%
    tier00: 0.128,          // 12.8%
    tier0: 0.803,           // 80.3%
    egos: 0.015             // 1.5%
};

const RATE_UP_FRACTION = 0.5; // UP 角色平分該階級 50% 的總機率

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

// ── 📋 2. 核心處理函式 ────────────────────────────────────────────────
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
                
                // 自動偵測並調整極低機率的小數點精度，防止 0.0000% 出現
                const percentVal = data.rate * 100;
                let decimalPlaces = 4;
                if (percentVal < 0.001) decimalPlaces = 6;
                if (percentVal < 0.00001) decimalPlaces = 8;
                
                const ratePercent = percentVal.toFixed(decimalPlaces) + '%';

                if (data.isUp) {
                    lines.push(`> 🔺 **${item}** — \`${ratePercent}\` **[UP!]**`);
                } else {
                    lines.push(`• ${item} — \`${ratePercent}\``);
                }
            });
        });

        // 動態安全分頁（15 行一頁）
        const PAGES = [];
        const LINES_PER_PAGE = 15;
        for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
            PAGES.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
        }

        if (PAGES.length === 0) {
            return message.reply('❌ 目前提取池內沒有任何角色資料。');
        }

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
            .setTitle('📋 補給提取物資與動態機率清單')
            .setColor(0x00b4d8)
            .setDescription(PAGES[currentPage])
            .setFooter({ text: `第 ${currentPage + 1} / ${PAGES.length} 頁 ｜ 總計品項：${ratesMap.size} 個` });

        const reply = await message.reply({
            embeds: [embed],
            components: PAGES.length > 1 ? [getRow(currentPage, PAGES.length)] : []
        });

        if (PAGES.length <= 1) return;

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: '❌ 這不是你的提取清單喔！', ephemeral: true });
            }

            if (interaction.customId === 'prev') {
                currentPage--;
            } else if (interaction.customId === 'next') {
                currentPage++;
            }

            embed.setDescription(PAGES[currentPage])
                 .setFooter({ text: `第 ${currentPage + 1} / ${PAGES.length} 頁 ｜ 總計品項：${ratesMap.size} 個` });

            await interaction.update({
                embeds: [embed],
                components: [getRow(currentPage, PAGES.length)]
            });
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('◀️ 上一頁').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('next').setLabel('下一頁 ▶️').setStyle(ButtonStyle.Primary).setDisabled(true)
            );
            reply.edit({ components: [disabledRow] }).catch(() => {});
        });

    } catch (error) {
        console.error('List Command Error:', error);
        message.reply('❌ 讀取清單時發生錯誤，請聯絡開發者。');
    }
}

module.exports = { handleList };
