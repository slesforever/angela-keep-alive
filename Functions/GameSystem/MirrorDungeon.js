// Functions/GameSystem/MirrorDungeon.js
const { EmbedBuilder } = require('discord.js');

async function handleMirrorDungeon(client, message) {
    const floors = ["第一層：開始的燈火", "第二層：沉寂的走廊", "第三層：渴望的深淵", "第四層：午夜的降臨", "第五層：永恆的巨樹"];
    const randomFloor = floors[Math.floor(Math.random() * floors.length)];
    
    const mdEmbed = new EmbedBuilder()
        .setTitle('🪞 進入鏡光迷宮 (Mirror Dungeon) 模擬器')
        .setColor(0xa55eea)
        .setDescription(`「主管，無限的鏡像正在交錯，請選擇您的同行人格。」`)
        .addFields(
            { name: '📍 當前探索進度', value: `已推進至 **${randomFloor}**` },
            { name: '💎 探索獎勵預估', value: '黃頁碎屑 x5、經驗值禮盒 x10' }
        )
        .setFooter({ text: '使用 !md 重新折射鏡像以刷新層數。' })
        .setTimestamp();

    return message.reply({ embeds: [mdEmbed] });
}

module.exports = { handleMirrorDungeon };
