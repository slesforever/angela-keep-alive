// Functions/GameSystem/Pulls/PullSystem.js
const { EmbedBuilder } = require('discord.js');
const identitiesData = require('./identitiesData.js');
const { loadUserInventory, saveUserInventory } = require('../PacksAndData.js');

// ── 1. 調整後的精準權重設定 (總權重為 100000，完美對應你指定的機率) ──
const GACHA_POOL = {
    COLOR_FIXER: 1.3,       // 0.0013%  (權重 1.3)
    SPECIAL: 300,           // 0.3%     (權重 300)
    S4: 500,                // 0.5%     (權重 500)
    EGOS: 1500,             // 1.5%     (權重 1500)
    S3: 3000,               // 3.0%     (權重 3000)
    S2: 15000,              // 15.0%    (權重 15000)
    S1: 79698.7             // 79.6987% (權重 79698.7，用來補足至 100%)
};

// ── 2. 稀有度配置（對應資料庫 key、顯示標籤、Emoji、以及重複碎片值） ──
const TIER_CONFIGS = {
    COLOR_FIXER: { poolKeys: ['ColorFixer', 'Color_Fixer'], label: 'Color Fixer', emoji: '🔴', shardValue: 5 },
    SPECIAL:     { poolKeys: ['Special'],               label: 'Special',     emoji: '🌌', shardValue: 5 },
    S4:          { poolKeys: ['0000', 'S4'],            label: '★★★★',        emoji: '👑', shardValue: 5 },
    S3:          { poolKeys: ['000', 'S3'],             label: '★★★',         emoji: '✨', shardValue: 5 },
    EGOS:        { poolKeys: ['Egos', 'EGOS'],          label: 'E.G.O',       emoji: '🔮', shardValue: 1 },
    S2:          { poolKeys: ['00', 'S2'],              label: '★★',          emoji: '⭐', shardValue: 1 },
    S1:          { poolKeys: ['0', 'S1'],               label: '★',           emoji: '▫️', shardValue: 1 }
};

function pickRandom(arr) {
    if (!arr || arr.length === 0) return '未知人格';
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 根據動態讀取的 TIER_CONFIGS 尋找對應的 identitiesData.pool
 */
function getPool(tierKey) {
    const config = TIER_CONFIGS[tierKey];
    if (!config) return [];
    for (const key of config.poolKeys) {
        if (identitiesData.pool && identitiesData.pool[key]) {
            return identitiesData.pool[key];
        }
    }
    return [];
}

/**
 * 核心抽卡邏輯
 */
function drawOnce(userInventory = []) {
    // 計算總權重 (100000)
    const totalWeight = Object.values(GACHA_POOL).reduce((sum, w) => sum + w, 0);
    let r = Math.random() * totalWeight;
    let rolledTier = 'S1';

    for (const [tier, weight] of Object.entries(GACHA_POOL)) {
        if (r < weight) {
            rolledTier = tier;
            break;
        }
        r -= weight;
    }

    const config = TIER_CONFIGS[rolledTier];
    const pool = getPool(rolledTier);
    let name = '';

    // 特殊處理：S3 具有 50% Rate Up 機率
    if (rolledTier === 'S3') {
        const rateUp = (identitiesData.upTargets && (identitiesData.upTargets['000'] || identitiesData.upTargets['S3'])) || [];
        if (rateUp.length && Math.random() < 0.5) {
            name = pickRandom(rateUp);
        } else {
            name = pickRandom(pool);
        }
    } else {
        name = pickRandom(pool);
    }

    // 檢查背包裡是否已經有這個角色的乾淨名稱
    const isDuplicate = userInventory.includes(name);

    return {
        name,
        tier: rolledTier,
        isDuplicate,
        shardValue: config.shardValue,
        emoji: config.emoji,
        label: config.label
    };
}

/**
 * 格式化單行抽卡結果顯示
 */
function formatItemDisplay(draw) {
    if (draw.isDuplicate) {
        return `~~[${draw.label}] ${draw.name}~~ ➡️ 轉化為 **自我碎片 ×${draw.shardValue}**`;
    }
    return `[${draw.label}] ${draw.name}`;
}

async function executePull(client, message, pullCount = 1) {
    const userId = message.author.id;
    await message.channel.sendTyping();

    // 1. 讀取玩家現有的背包
    let inv = [];
    try {
        const rawInv = loadUserInventory(client, userId);
        inv = Array.isArray(rawInv) ? rawInv : [];
    } catch (err) {
        console.error('[PullSystem] 讀取背包失敗:', err.message);
    }

    // 2. 進行抽卡（十連內重複判定，使用 tempInv 追蹤）
    const tempInv = [...inv];
    const draws = [];

    for (let i = 0; i < pullCount; i++) {
        const result = drawOnce(tempInv);
        draws.push(result);

        if (!result.isDuplicate) {
            tempInv.push(result.name);
        }
    }

    // 3. 處理入庫項目：沒重複的直接入庫，重複的依權重轉換為 N 個「自我碎片」
    const itemsToAdd = [];
    draws.forEach(d => {
        if (d.isDuplicate) {
            for (let k = 0; k < d.shardValue; k++) {
                itemsToAdd.push('自我碎片');
            }
        } else {
            itemsToAdd.push(d.name);
        }
    });

    // 4. 儲存回資料庫
    try {
        saveUserInventory(client, userId, [...inv, ...itemsToAdd]);
    } catch (err) {
        console.error('[PullSystem] 背包儲存失敗:', err.message);
    }

    // 5. 渲染結果 UI
    const resultLines = draws.map((d, i) => `${d.emoji} \`${i + 1}.\` ${formatItemDisplay(d)}`);

    // 動態統計抽中的高稀有度
    const highTierCount = draws.filter(d => ['S3', 'S4', 'SPECIAL', 'COLOR_FIXER'].includes(d.tier)).length;
    const egoCount = draws.filter(d => d.tier === 'EGOS').length;

    const summaryParts = [];
    if (egoCount) summaryParts.push(`🔮 E.G.O ×${egoCount}`);
    if (highTierCount) summaryParts.push(`✨ 高稀有度 ×${highTierCount}`);

    // 根據抽到的最高稀有度，動態調整 Embed 邊框顏色
    const pulledTiers = draws.map(d => d.tier);
    let embedColor = 0xeccc68; // 預設金色
    if (pulledTiers.includes('COLOR_FIXER')) {
        embedColor = 0xff3838; // 🔴 特色紅 (Color Fixer 級別)
    } else if (pulledTiers.includes('SPECIAL')) {
        embedColor = 0x2ed573; // 🌌 特色綠 (Special 級別)
    } else if (pulledTiers.includes('S4')) {
        embedColor = 0xffa502; // 👑 亮橘色 (★★★★)
    } else if (pulledTiers.includes('EGOS')) {
        embedColor = 0xa55eea; // 🔮 夢幻紫 (E.G.O)
    } else if (pulledTiers.includes('S3')) {
        embedColor = 0xffd166; // ✨ 亮黃色 (★★★)
    }

    const pullEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle(pullCount === 1 ? '🚂 腦葉物資梅菲斯特號 — 單抽報告' : '🚂 腦葉物資梅菲斯特號 — 十連報告')
        .setColor(embedColor)
        .setDescription(resultLines.join('\n'))
        .setFooter({
            text: summaryParts.length
                ? `✨ 本次收穫：${summaryParts.join('、')}`
                : '「每一次提取，都是向平行世界借調可能性。」',
        })
        .setTimestamp();

    return message.reply({ embeds: [pullEmbed] });
}

module.exports = { executePull };
