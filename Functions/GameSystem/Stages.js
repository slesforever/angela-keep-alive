// Functions/GameSystem/Stages.js
const { EmbedBuilder } = require('discord.js');

async function handleStage(client, message) {
    const outcomes = [
        { success: true, text: "🎉 完美戰術！迷宮異想體被完美壓制，獲得狂氣 x300！", color: 0x2ed573 },
        { success: true, text: "⚔️ 雖然陷入了混亂狀態，但最後靠著人格共鳴險勝！獲得碎片禮盒 x2！", color: 0xeccc68 },
        { success: false, text: "❌ 精神值 (SP) 歸零，全隊陷入恐慌並發生侵蝕！戰線全面崩潰...", color: 0xff4757 }
    ];

    const randomResult = outcomes[Math.floor(Math.random() * outcomes.length)];
    
    const stageEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle('🚨 腦葉收容區 - 抑制戰況回報')
        .setColor(randomResult.color)
        .setDescription(`### **戰鬥結果演練：**\n${randomResult.text}`)
        .setTimestamp();

    return message.reply({ embeds: [stageEmbed] });
}

module.exports = { handleStage };
