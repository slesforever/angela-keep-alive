// Functions/GameSystem/GiveAwaySystem.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadUserInventory, saveUserInventory } = require('./PacksAndData.js');

let currentBuffMultiplier = 1;

async function handleGiveAway(client, message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('「很抱歉主管，您當前的精神權限不足以發動全系統物資撥款。」');
    }

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // !givelunacy @玩家 數量
    if (command === '!givelunacy') {
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!targetUser || isNaN(amount) || amount <= 0) {
            return message.reply('❌ 格式：`!givelunacy @玩家 數量`（例：`!givelunacy @Angela 1300`）');
        }

        const loadingMsg = await message.reply(`「正在為 <@${targetUser.id}> 進行精神物資對齊...」`);
        const inv = await loadUserInventory(client, targetUser.id);
        inv.push(`💎 狂氣 ×${amount}`);
        await saveUserInventory(client, targetUser.id, inv);

        const embed = new EmbedBuilder()
            .setTitle('💎 腦葉行政中心 — 單人精神物資撥款')
            .setColor(0x00b4d8)
            .setDescription(
                `**發放對象：** <@${targetUser.id}>\n` +
                `**撥款：** 💎 狂氣 ×${amount}\n\n` +
                `「物資已寫入該主管的雲端收容倉庫。」`
            )
            .setFooter({ text: '核心管理 AI 安潔拉' })
            .setTimestamp();

        return loadingMsg.edit({ content: null, embeds: [embed] });
    }

    // !updaterewards 數量
    if (command === '!updaterewards') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            return message.reply('❌ 格式：`!updaterewards 數量`（例：`!updaterewards 1500`）');
        }
        const embed = new EmbedBuilder()
            .setTitle('🎁 邊獄公司 — 全伺服器特別補償')
            .setColor(0xffa502)
            .setDescription(
                `**全體發放：**\n• 📦 狂氣 ×${amount}\n• 🚂 特別提取券 ×1\n\n` +
                `「全服維護補償已正式下發。」`
            )
            .setFooter({ text: '核心管理 AI 安潔拉' })
            .setTimestamp();
        return message.channel.send({ embeds: [embed] });
    }

    // !updatebuff 倍數
    if (command === '!updatebuff') {
        const multiplier = parseFloat(args[1]);
        if (isNaN(multiplier) || multiplier <= 0) {
            return message.reply('❌ 格式：`!updatebuff 倍數`（例：`!updatebuff 2.5`）');
        }
        currentBuffMultiplier = multiplier;
        const embed = new EmbedBuilder()
            .setTitle('⚡ 腦葉核心能量塔 — 獎勵脈衝過載')
            .setColor(0xa55eea)
            .setDescription(
                `**全服關卡報酬倍率調整為：【 ${currentBuffMultiplier} 倍 】**\n\n` +
                `「現在執行 \`!stage\` 將獲得加倍戰利品。」`
            )
            .setFooter({ text: '核心能量塔控制台 — Angela' })
            .setTimestamp();
        return message.channel.send({ embeds: [embed] });
    }
}

module.exports = {
    handleGiveAway,
    getBuffMultiplier: () => currentBuffMultiplier,
};
