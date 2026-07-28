'use strict';

const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');

// ─────────────────────────────────────────────
// 玩家資料系統
// ─────────────────────────────────────────────

let loadUserInventory;
let saveUserInventory;
let getOrCreatePlayer;
let savePlayerData;

try {
    const packsModule =
        require('../PacksAndData.js');

    loadUserInventory =
        typeof packsModule.loadUserInventory === 'function'
            ? packsModule.loadUserInventory
            : () => [];

    saveUserInventory =
        typeof packsModule.saveUserInventory === 'function'
            ? packsModule.saveUserInventory
            : () => {};

    getOrCreatePlayer =
        typeof packsModule.getOrCreatePlayer === 'function'
            ? packsModule.getOrCreatePlayer
            : (_c, _id) => ({ lunacy: 0, identities: [] });

    savePlayerData =
        typeof packsModule.savePlayerData === 'function'
            ? packsModule.savePlayerData
            : () => {};

} catch (error) {
    console.error(
        '[PullSystem] 無法載入 PacksAndData.js:',
        error.message
    );

    loadUserInventory = () => [];
    saveUserInventory = () => {};
    getOrCreatePlayer = (_c, _id) => ({ lunacy: 0, identities: [] });
    savePlayerData = () => {};
}

// ─────────────────────────────────────────────
// 基礎稀有度權重
// 總和約 100%
// ─────────────────────────────────────────────

const BASE_WEIGHTS = {
    COLOR_FIXER: 0.001,
    ABN:         0.15,
    SPECIAL:     0.30,
    S4:          0.50,
    EGOS:        1.50,
    S3:          2.90,
    S2:          15.00,
    S1:          79.649,
};

// ─────────────────────────────────────────────
// 異想體內部稀有度權重
// ─────────────────────────────────────────────

const ABN_WEIGHTS = {
    ABN_ZAYIN: 40.0,
    ABN_TETH:  30.0,
    ABN_HE:    17.5,
    ABN_WAW:   10.0,
    ABN_ALEPH: 2.0,
    ABN_ANGELA: 0.5,
};

// ─────────────────────────────────────────────
// 稀有度設定
// ─────────────────────────────────────────────

const TIER_CONFIGS = {
    COLOR_FIXER: {
        poolKeys: [
            'Color Fixer',
            'ColorFixer',
            'Color_Fixer',
        ],
        label: 'Color Fixer',
        emoji: '🔴',
        color: 0xff3838,
        shardValue: 10,
    },

    ABN_ANGELA: {
        poolKeys: ['ABN_ANGELA'],
        label: '異想體 ANGELA',
        emoji: '🕊️',
        color: 0xffffff,
        shardValue: 20,
    },

    ABN_ALEPH: {
        poolKeys: ['ABN_ALEPH'],
        label: '異想體 ALEPH',
        emoji: '🟣',
        color: 0x9b59b6,
        shardValue: 15,
    },

    ABN_WAW: {
        poolKeys: ['ABN_WAW'],
        label: '異想體 WAW',
        emoji: '🔵',
        color: 0x3498db,
        shardValue: 10,
    },

    ABN_HE: {
        poolKeys: ['ABN_HE'],
        label: '異想體 HE',
        emoji: '🟢',
        color: 0x2ecc71,
        shardValue: 8,
    },

    ABN_TETH: {
        poolKeys: ['ABN_TETH'],
        label: '異想體 TETH',
        emoji: '🟡',
        color: 0xf1c40f,
        shardValue: 5,
    },

    ABN_ZAYIN: {
        poolKeys: ['ABN_ZAYIN'],
        label: '異想體 ZAYIN',
        emoji: '⚪',
        color: 0xbdc3c7,
        shardValue: 3,
    },

    SPECIAL: {
        poolKeys: [
            'Special',
            'SPECIAL',
        ],
        label: 'Special',
        emoji: '🌌',
        color: 0x2ed573,
        shardValue: 5,
    },

    S4: {
        poolKeys: [
            '0000',
            'S4',
        ],
        label: '★★★★',
        emoji: '👑',
        color: 0xffa502,
        shardValue: 5,
    },

    EGOS: {
        poolKeys: [
            'Egos',
            'EGOS',
        ],
        label: 'E.G.O',
        emoji: '🔮',
        color: 0xa55eea,
        shardValue: 3,
    },

    S3: {
        poolKeys: [
            '000',
            'S3',
        ],
        label: '★★★',
        emoji: '✨',
        color: 0xffd166,
        shardValue: 3,
    },

    S2: {
        poolKeys: [
            '00',
            'S2',
        ],
        label: '★★',
        emoji: '⭐',
        color: 0x74b9ff,
        shardValue: 1,
    },

    S1: {
        poolKeys: [
            '0',
            'S1',
        ],
        label: '★',
        emoji: '▫️',
        color: 0x57606f,
        shardValue: 1,
    },
};

// ─────────────────────────────────────────────
// 隨機工具
// ─────────────────────────────────────────────

function pickRandom(array) {
    if (!Array.isArray(array)) {
        return null;
    }

    const validItems =
        array.filter(
            item =>
                item !== null &&
                item !== undefined &&
                String(item).trim() !== ''
        );

    if (!validItems.length) {
        return null;
    }

    return validItems[
        Math.floor(
            Math.random() * validItems.length
        )
    ];
}

// ─────────────────────────────────────────────
// 取得抽卡池
// ─────────────────────────────────────────────

function getPool(tierKey) {
    const config =
        TIER_CONFIGS[tierKey];

    if (!config) {
        return [];
    }

    const pool =
        identitiesData?.pool || {};

    for (const key of config.poolKeys) {
        if (Array.isArray(pool[key])) {
            const validPool =
                pool[key].filter(Boolean);

            if (validPool.length) {
                return validPool;
            }
        }
    }

    return [];
}

// ─────────────────────────────────────────────
// 權重抽取
// ─────────────────────────────────────────────

function weightedDraw(weights) {
    const entries =
        Object.entries(weights)
            .filter(
                ([, weight]) =>
                    Number.isFinite(weight) &&
                    weight > 0
            );

    if (!entries.length) {
        return null;
    }

    const total =
        entries.reduce(
            (sum, [, weight]) =>
                sum + weight,
            0
        );

    let random =
        Math.random() * total;

    for (const [key, weight] of entries) {
        if (random < weight) {
            return key;
        }

        random -= weight;
    }

    return entries[
        entries.length - 1
    ][0];
}

// ─────────────────────────────────────────────
// 取得 Rate Up
// ─────────────────────────────────────────────

function getRateUpList(banner, tier) {
    if (!banner?.rateUp) {
        return [];
    }

    const aliases = {
        S1: [
            'S1',
            '0',
        ],

        S2: [
            'S2',
            '00',
        ],

        S3: [
            'S3',
            '000',
        ],

        S4: [
            'S4',
            '0000',
        ],

        EGOS: [
            'EGOS',
            'Egos',
        ],

        SPECIAL: [
            'SPECIAL',
            'Special',
        ],

        COLOR_FIXER: [
            'COLOR_FIXER',
            'Color Fixer',
        ],
    };

    const keys =
        aliases[tier] || [tier];

    for (const key of keys) {
        const list =
            banner.rateUp[key];

        if (Array.isArray(list)) {
            return list.filter(Boolean);
        }
    }

    return [];
}

// ─────────────────────────────────────────────
// 單次抽卡
// ─────────────────────────────────────────────

function drawOnce(
    banner,
    tempInventory = [],
    forceS2OrHigher = false
) {
    let weights = {
        ...BASE_WEIGHTS,
    };

    // 十連最後一抽保底
    if (forceS2OrHigher) {
        delete weights.S1;
    }

    let rolledTier =
        weightedDraw(weights);

    if (!rolledTier) {
        rolledTier = 'S1';
    }

    let finalTier =
        rolledTier;

    // ABN 再抽一次內部稀有度
    if (rolledTier === 'ABN') {
        finalTier =
            weightedDraw(
                ABN_WEIGHTS
            ) || 'ABN_ZAYIN';
    }

    const config =
        TIER_CONFIGS[finalTier] ||
        TIER_CONFIGS.S1;

    let name = null;

    // ─────────────────────────────────
    // Rate Up
    // ─────────────────────────────────

    const rateUpList =
        getRateUpList(
            banner,
            finalTier
        );

    if (
        rateUpList.length > 0 &&
        Math.random() < 0.5
    ) {
        name =
            pickRandom(
                rateUpList
            );
    }

    // ─────────────────────────────────
    // 普通池
    // ─────────────────────────────────

    if (!name) {
        const poolItems =
            getPool(finalTier);

        name =
            pickRandom(poolItems);
    }

    // ─────────────────────────────────
    // 如果資料池為空
    // ─────────────────────────────────

    if (!name) {
        name =
            `[${config.label}] 未知對象`;
    }

    // ─────────────────────────────────
    // 重複判定
    // ─────────────────────────────────

    const isDuplicate =
        tempInventory.includes(name);

    return {
        name,
        tier: finalTier,
        isAbn:
            rolledTier === 'ABN',
        isDuplicate,
        shardValue:
            config.shardValue,
        emoji:
            config.emoji,
        label:
            config.label,
        color:
            config.color,
    };
}

// ─────────────────────────────────────────────
// 顯示抽卡結果
// ─────────────────────────────────────────────

function formatItemDisplay(draw) {
    if (draw.isDuplicate) {
        return (
            `~~${draw.emoji} ` +
            `[${draw.label}] ` +
            `${draw.name}~~ ` +
            `➡️ **自我碎片 ×${draw.shardValue}**`
        );
    }

    return (
        `${draw.emoji} ` +
        `[${draw.label}] ` +
        `${draw.name}`
    );
}

// ─────────────────────────────────────────────
// 執行抽卡
// ─────────────────────────────────────────────

async function executePull(
    client,
    user,
    bannerKey = 'standard',
    pullCount = 1,
    interaction
) {
    // ─────────────────────────────────
    // 基本驗證
    // ─────────────────────────────────

    if (!client) {
        throw new Error(
            'Discord Client 不存在。'
        );
    }

    if (!user?.id) {
        throw new Error(
            '無法取得玩家 ID。'
        );
    }

    if (
        ![1, 10].includes(
            Number(pullCount)
        )
    ) {
        throw new Error(
            '抽卡次數只能是 1 或 10。'
        );
    }

    pullCount =
        Number(pullCount);

    // ─────────────────────────────────
    // 找卡池
    // ─────────────────────────────────

    const banners =
        identitiesData?.BANNERS || {};

    let banner =
        banners[bannerKey];

    if (!banner) {
        banner =
            banners.standard ||
            Object.values(banners)
                .find(Boolean);
    }

    if (!banner) {
        throw new Error(
            '目前沒有任何可用的抽卡卡池。'
        );
    }

    // ─────────────────────────────────
    // 計算花費
    // ─────────────────────────────────

    const cost =
        pullCount === 10
            ? Number(
                banner.cost?.ten ??
                1300
            )
            : Number(
                banner.cost?.single ??
                130
            );

    // ─────────────────────────────────
    // 讀取玩家背包
    // ─────────────────────────────────

    let inventory = [];

    try {
        const rawInventory =
            loadUserInventory(
                client,
                user.id
            );

        inventory =
            Array.isArray(
                rawInventory
            )
                ? rawInventory
                : [];

    } catch (error) {
        console.error(
            '[PullSystem] 讀取背包失敗:',
            error
        );

        throw new Error(
            '無法讀取玩家背包資料。'
        );
    }

    // ─────────────────────────────────
    // 計算狂氣（從 player.lunacy 讀取，非 inventory 計數）
    // ─────────────────────────────────

    const player = getOrCreatePlayer(client, user.id, user.username || 'Player');
    const lunacyCount = player.lunacy || 0;

    if (
        lunacyCount < cost
    ) {
        const errorMessage =
            `❌ **狂氣不足！**\n\n` +
            `本次提取需要：**${cost} 狂氣**\n` +
            `目前持有：**${lunacyCount} 狂氣**\n` +
            `還需要：**${cost - lunacyCount} 狂氣**`;

        if (
            interaction?.deferred ||
            interaction?.replied
        ) {
            return interaction.editReply({
                content: errorMessage,
                embeds: [],
                components: [],
            });
        }

        return interaction.reply({
            content: errorMessage,
            ephemeral: true,
        });
    }

    // ─────────────────────────────────
    // 扣除狂氣（直接操作 player.lunacy）
    // ─────────────────────────────────

    player.lunacy = lunacyCount - cost;

    const remainingInventory = inventory;

    // ─────────────────────────────────
    // 開始抽卡
    // ─────────────────────────────────

    const tempInventory = [
        ...remainingInventory,
    ];

    const draws = [];

    for (
        let i = 0;
        i < pullCount;
        i++
    ) {
        const isTenPullPity =
            pullCount === 10 &&
            i === 9 &&
            draws.length === 9 &&
            draws.every(
                draw =>
                    draw.tier === 'S1'
            );

        const result =
            drawOnce(
                banner,
                tempInventory,
                isTenPullPity
            );

        draws.push(result);

        // 非重複物品加入暫時背包
        if (
            !result.isDuplicate
        ) {
            tempInventory.push(
                result.name
            );
        }
    }

    // ─────────────────────────────────
    // 結算物品
    // ─────────────────────────────────

    const itemsToAdd = [];

    for (const draw of draws) {
        if (draw.isDuplicate) {
            for (
                let i = 0;
                i < draw.shardValue;
                i++
            ) {
                itemsToAdd.push(
                    '自我碎片'
                );
            }
        } else {
            itemsToAdd.push(
                draw.name
            );
        }
    }

    const finalInventory = [
        ...remainingInventory,
        ...itemsToAdd,
    ];

    // ─────────────────────────────────
    // 儲存
    // ─────────────────────────────────

    try {
        player.identities = finalInventory;
        savePlayerData(
            client,
            user.id,
            player
        );
    } catch (error) {
        console.error(
            '[PullSystem] 儲存玩家資料失敗:',
            error
        );

        throw new Error(
            '抽卡完成，但儲存玩家資料時發生錯誤。'
        );
    }

    // ─────────────────────────────────
    // 建立結果文字
    // ─────────────────────────────────

    const resultLines =
        draws.map(
            (draw, index) =>
                `${draw.emoji} ` +
                `\`${index + 1}.\` ` +
                formatItemDisplay(draw)
        );

    // ─────────────────────────────────
    // Embed 顏色
    // ─────────────────────────────────

    const TIER_PRIORITY = [
        'COLOR_FIXER',
        'ABN_ANGELA',
        'ABN_ALEPH',
        'ABN_WAW',
        'ABN_HE',
        'ABN_TETH',
        'ABN_ZAYIN',
        'SPECIAL',
        'S4',
        'EGOS',
        'S3',
        'S2',
        'S1',
    ];

    let embedColor =
        0xeccc68;

    for (
        const tier of TIER_PRIORITY
    ) {
        if (
            draws.some(
                draw =>
                    draw.tier === tier
            )
        ) {
            embedColor =
                TIER_CONFIGS[tier]
                    ?.color ||
                embedColor;

            break;
        }
    }

    // ─────────────────────────────────
    // 統計
    // ─────────────────────────────────

    const abnCount =
        draws.filter(
            draw =>
                draw.isAbn
        ).length;

    const egoCount =
        draws.filter(
            draw =>
                draw.tier === 'EGOS'
        ).length;

    const s3Count =
        draws.filter(
            draw =>
                draw.tier === 'S3'
        ).length;

    const duplicateCount =
        draws.filter(
            draw =>
                draw.isDuplicate
        ).length;

    const summaryParts = [];

    if (abnCount) {
        summaryParts.push(
            `⚠️ 異想體 ×${abnCount}`
        );
    }

    if (egoCount) {
        summaryParts.push(
            `🔮 E.G.O ×${egoCount}`
        );
    }

    if (s3Count) {
        summaryParts.push(
            `✨ ★★★ ×${s3Count}`
        );
    }

    if (duplicateCount) {
        summaryParts.push(
            `♻️ 重複 ×${duplicateCount}`
        );
    }

    // ─────────────────────────────────
    // 建立結果 Embed
    // ─────────────────────────────────

    const pullEmbed =
        new EmbedBuilder()
            .setAuthor({
                name:
                    user.username ||
                    'Unknown User',
                iconURL:
                    user.displayAvatarURL(),
            })
            .setTitle(
                `🚂 ${
                    banner.name ||
                    '狂氣提取'
                } — ${
                    pullCount === 1
                        ? '單抽'
                        : '十連'
                }`
            )
            .setColor(
                embedColor
            )
            .setDescription(
                resultLines.join('\n')
            )
            .setFooter({
                text:
                    summaryParts.length
                        ? `收穫：${summaryParts.join('、')} | 消耗 ${cost} 狂氣`
                        : `消耗 ${cost} 狂氣 | 「每一次提取，都是向平行世界借調可能性。」`,
            })
            .setTimestamp();

    // ─────────────────────────────────
    // 回覆
    // ─────────────────────────────────

    if (
        interaction?.deferred ||
        interaction?.replied
    ) {
        return interaction.editReply({
            content: null,
            embeds: [
                pullEmbed,
            ],
            components: [],
        });
    }

    return interaction.reply({
        embeds: [
            pullEmbed,
        ],
        ephemeral: true,
    });
}

// ─────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────

module.exports = {
    executePull,
    BASE_WEIGHTS,
    ABN_WEIGHTS,
    TIER_CONFIGS,
    drawOnce,
    getPool,
};
