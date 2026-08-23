// Functions/GameSystem/LevelSystem.js
// 玩家等級、經驗值（EXP）計算與關卡結算獎勵系統
'use strict';

const { EmbedBuilder } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

// ─── 設定檔 ───────────────────────────────────────────────────
const MAX_PLAYER_LEVEL = 99; // 玩家最高等級上限

/**
 * 計算升到下一個等級所需的總經驗值
 * @param {number} level 當前等級
 * @returns {number} 所需 EXP
 */
function getRequiredExp(level) {
    if (level >= MAX_PLAYER_LEVEL) return Infinity;
    return level * 100; // 基礎公式：1級需100, 2級需200, 依此類推
}

/**
 * 給予玩家經驗值並處理升級邏輯
 * @param {object} client Discord Client 實體
 * @param {string} userId 玩家 Discord ID
 * @param {number} expGained 獲得的經驗值
 * @returns {object} { player, leveledUp, oldLevel, newLevel, rewards }
 */
function addPlayerExp(client, userId, expGained) {
    const player = getOrCreatePlayer(client, userId);
    
    let oldLevel = player.level || 1;
    let currentExp = (player.exp || 0) + expGained;
    let currentLevel = oldLevel;
    let leveledUp = false;

    // 獎勵累計表
    const totalRewards = {
        lightSeeds: 0,
        fragments: 0,
        expScrolls: 0,
    };

    // 升級檢測迴圈（支援一次升多級）
    while (currentLevel < MAX_PLAYER_LEVEL) {
        const reqExp = getRequiredExp(currentLevel);
        if (currentExp >= reqExp) {
            currentExp -= reqExp;
            currentLevel++;
            leveledUp = true;

            // 每升一級獲得的基礎獎勵
            const seedReward = currentLevel * 50;
            const fragReward = 5;
            const scrollReward = 2;

            player.lightSeeds = (player.lightSeeds || 0) + seedReward;
            player.fragments  = (player.fragments || 0) + fragReward;
            player.expScrolls  = (player.expScrolls || 0) + scrollReward;

            totalRewards.lightSeeds += seedReward;
            totalRewards.fragments  += fragReward;
            totalRewards.expScrolls  += scrollReward;
        } else {
            break;
        }
    }

    // 更新玩家資料
    player.level = currentLevel;
    player.exp   = currentExp;
    savePlayerData(client, userId, player);

    return {
        player,
        leveledUp,
        oldLevel,
        newLevel: currentLevel,
        rewards: totalRewards,
    };
}

/**
 * 關卡通關獎勵結算（結合 EXP 與物品發放）
 * @param {object} client Discord Client
 * @param {string} userId 玩家 ID
 * @param {object} options 結算選項 { exp, lightSeeds, fragments, expScrolls, stageName }
 * @returns {object} 包含更新後的玩家資料與獎勵 Embed
 */
function rewardStageClear(client, userId, options = {}) {
    const {
        exp = 0,
        lightSeeds = 0,
        fragments = 0,
        expScrolls = 0,
        stageName = '未知關卡',
    } = options;

    const player = getOrCreatePlayer(client, userId);

    // 1. 發送基本關卡獎勵
    player.lightSeeds = (player.lightSeeds || 0) + lightSeeds;
    player.fragments  = (player.fragments || 0) + fragments;
    player.expScrolls  = (player.expScrolls || 0) + expScrolls;
    savePlayerData(client, userId, player);

    // 2. 發送經驗值並計算升級
    const expResult = addPlayerExp(client, userId, exp);
    const updatedPlayer = expResult.player;

    // 3. 建立結算圖卡 Embed
    const nextReqExp = getRequiredExp(updatedPlayer.level);
    const expProgress = updatedPlayer.level >= MAX_PLAYER_LEVEL 
        ? 'MAX' 
        : `${updatedPlayer.exp} / ${nextReqExp}`;

    const embed = new EmbedBuilder()
        .setTitle(`⚔️ 戰鬥勝利 — ${stageName}`)
        .setColor(expResult.leveledUp ? 0xffd166 : 0x2ecc71)
        .setDescription(
            expResult.leveledUp
                ? `🎉 **LEVEL UP!** 恭喜主管等級提升至 **Lv.${expResult.newLevel}**！`
                : `成功清除目標，獲取大量物資！`
        )
        .addFields(
            { name: '👤 管理員', value: updatedPlayer.username, inline: true },
            { name: '⭐ 等級', value: `Lv.${updatedPlayer.level} (${expProgress})`, inline: true },
            { name: '✨ 獲得 EXP', value: `+${exp}`, inline: true },
            { 
                name: '🎁 獲得戰利品', 
                value: [
                    lightSeeds ? `🌱 LightSeeds +${lightSeeds}` : null,
                    fragments  ? `📦 人格碎片 +${fragments}` : null,
                    expScrolls ? `📜 經驗卷 +${expScrolls}` : null,
                ].filter(Boolean).join('\n') || '無',
                inline: false 
            }
        );

    // 若有升級，額外列出升級獎勵
    if (expResult.leveledUp) {
        embed.addFields({
            name: '🏆 升級突破獎勵',
            value: `🌱 LightSeeds +${expResult.rewards.lightSeeds}\n📦 人格碎片 +${expResult.rewards.fragments}\n📜 經驗卷 +${expResult.rewards.expScrolls}`,
            inline: false
        });
    }

    embed.setTimestamp();

    return {
        player: updatedPlayer,
        embed,
        expResult,
    };
}

module.exports = {
    MAX_PLAYER_LEVEL,
    getRequiredExp,
    addPlayerExp,
    rewardStageClear,
};
