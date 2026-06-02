// Functions/GameSystem/MirrorDungeon.js
const { EmbedBuilder } = require('discord.js');

const FLOORS = [
    { name: '第一層：開始的燈火',   reward: '黃頁碎屑 ×3、 經驗值禮盒 ×5' },
    { name: '第二層：沉寂的走廊',   reward: '黃頁碎屑 ×5、 狂氣 ×50' },
    { name: '第三層：渴望的深淵',   reward: '狂氣 ×120、 經驗值禮盒 ×10' },
    { name: '第四層：午夜的降臨',   reward: '狂氣 ×200、 黃頁碎屑 ×10' },
    { name: '第五層：永恆的巨樹',   reward: '狂氣 ×300、 特別提取券 ×1' },
];

const EVENTS = [
    '🎭 觸發了「迷宮的秘密」—— 發現了隱藏的鏡像空間',
    '⚔️ 遭遇了強力的焦點異想體，激戰後獲得額外獎勵',
    '🌟 E.G.O 共鳴觸發，所有罪人獲得臨時增益',
    '🔮 發現了遺忘的人格碎片，記憶值提升',
    '💀 遭遇了人格侵蝕，但靠著意志力撐了過去',
    '🎁 隱藏寶箱出現，全隊額外獲得資源',
];

async function handleMirrorDungeon(client, message) {
    const floor = FLOORS[Math.floor(Math.random() * FLOORS.length)];
    const event = Math.random() < 0.4 ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : null;

    const mdEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setTitle('🪞 鏡光迷宮模擬器')
        .setColor(0xa55eea)
        .setDescription('「主管，無限的鏡像正在交錯，人格共鳴已建立。」')
        .addFields(
            { name: '📍 當前探索層', value: `**${floor.name}**`, inline: false },
            { name: '💎 探索獎勵', value: floor.reward, inline: true },
        );

    if (event) {
        mdEmbed.addFields({ name: '✨ 特殊事件', value: event, inline: false });
    }

    mdEmbed
        .setFooter({ text: '使用 !md 重新折射鏡像以刷新層數' })
        .setTimestamp();

    return message.reply({ embeds: [mdEmbed] });
}

module.exports = { handleMirrorDungeon };
