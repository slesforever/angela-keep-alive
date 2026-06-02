// Functions/GameSystem/GiveAwaySystem.js
const { EmbedBuilder } = require('discord.js');

async function handleGiveAway(client, message) {
    // 簡單的權限檢查（可改成檢查管理員權限）
    if (!message.member.permissions.has('Administrator')) {
        return message.reply('「很抱歉主管，您當前的精神權限不足以發動全系統物資撥款。」');
    }

    const giveawayEmbed = new EmbedBuilder()
        .setTitle('🎁 來自行政中心的特派補償發放')
        .setColor(0xffa502)
        .setDescription(`### **發放項目：**\n• 📦 **狂氣 (Lunacy) x1300**\n• 🚂 **提取券 x1**\n\n「因應精神監測脈衝不穩進行的架構重組，補償已發放至各收容室。」`)
        .setFooter({ text: '發放人：核心管理 AI 安潔拉' })
        .setTimestamp();

    return message.channel.send({ content: '📢 @everyone 腦葉公司維護獎勵已送達！', embeds: [giveawayEmbed] });
}

module.exports = { handleGiveAway };
