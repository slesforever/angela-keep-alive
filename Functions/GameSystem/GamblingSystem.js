// Functions/GameSystem/GamblingSystem.js
// 賭博系統 — 下注 LightSeeds，50/50 機率翻倍或全損
'use strict';

const { EmbedBuilder } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const MIN_BET = 10;
const MAX_BET = 50_000;
const GAMBLE_COOLDOWN = 5_000;
const cooldowns = new Map();

async function handleGamble(client, interaction) {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const amount = interaction.options.getInteger('amount');

    // 冷卻檢查
    const now = Date.now();
    const last = cooldowns.get(userId) || 0;
    if (now - last < GAMBLE_COOLDOWN) {
        const waitSec = Math.ceil((GAMBLE_COOLDOWN - (now - last)) / 1000);
        return interaction.reply({ content: `⏳ 請稍後 ${waitSec} 秒再試。`, ephemeral: true });
    }

    if (!amount || amount < MIN_BET) {
        return interaction.reply({ content: `❌ 最低下注金額為 **${MIN_BET}** 🌱 LightSeeds。`, ephemeral: true });
    }
    if (amount > MAX_BET) {
        return interaction.reply({ content: `❌ 最高下注金額為 **${MAX_BET.toLocaleString()}** 🌱 LightSeeds。`, ephemeral: true });
    }

    const player = getOrCreatePlayer(null, userId, username);
    const current = player.lightSeeds || 0;

    if (current < amount) {
        return interaction.reply({
            content: `❌ 你的 LightSeeds 不足。\n持有：🌱 **${current.toLocaleString()}**　下注需要：🌱 **${amount.toLocaleString()}**`,
            ephemeral: true,
        });
    }

    cooldowns.set(userId, now);

    const win = Math.random() < 0.5;

    if (win) {
        player.lightSeeds = current + amount;
        savePlayerData(null, userId, player);

        const comments = [
            '「運氣有時候比實力更重要，主管。」',
            '「數字對你微笑了。珍惜這一刻。」',
            '「勝利屬於你。至少這一次。」',
        ];
        const comment = comments[Math.floor(Math.random() * comments.length)];

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🎰 賭博結果 — 勝利！')
                .setColor(0x2ed573)
                .setDescription(
                    `> ${comment}\n\n` +
                    `**下注：** 🌱 ${amount.toLocaleString()}\n` +
                    `**獲得：** 🌱 +${amount.toLocaleString()}\n` +
                    `**現持有：** 🌱 ${player.lightSeeds.toLocaleString()}`
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: '勝利不能持續。謹慎對待你的 LightSeeds。' })
                .setTimestamp()],
        });
    } else {
        player.lightSeeds = current - amount;
        savePlayerData(null, userId, player);

        const comments = [
            '「……運氣這種東西，從來不是永遠的。」',
            '「數字拒絕了你。下次也許不同。」',
            '「失去的 LightSeeds，去了更需要它的地方。」',
        ];
        const comment = comments[Math.floor(Math.random() * comments.length)];

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🎰 賭博結果 — 失敗')
                .setColor(0xff4757)
                .setDescription(
                    `> ${comment}\n\n` +
                    `**下注：** 🌱 ${amount.toLocaleString()}\n` +
                    `**損失：** 🌱 -${amount.toLocaleString()}\n` +
                    `**現持有：** 🌱 ${player.lightSeeds.toLocaleString()}`
                )
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: '也許下次會不同。也許。' })
                .setTimestamp()],
        });
    }
}

module.exports = { handleGamble };
