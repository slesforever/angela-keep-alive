// Functions/GameSystem/GiveAwaySystem.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadPlayerData, savePlayerData, getOrCreatePlayer } = require('./PacksAndData.js');

let currentBuffMultiplier = 1;

function isAdmin(message) {
    return message.member?.permissions.has(PermissionFlagsBits.Administrator);
}

async function handleGiveAway(client, message) {
    if (!isAdmin(message)) {
        return message.reply('「很抱歉主管，您當前的精神權限不足以發動全系統物資撥款。」');
    }

    const args    = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // !givelightseeds @玩家 數量
    if (command === '!givelightseeds') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0)
            return message.reply('❌ 格式：`!givelightseeds @玩家 數量`');

        const p = getOrCreatePlayer(client, target.id, target.username);
        p.lightSeeds = (p.lightSeeds || 0) + amount;
        savePlayerData(client, target.id, p);

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('🌱 單人 LightSeeds 撥款').setColor(0x00b4d8)
            .setDescription(`**對象：** <@${target.id}>\n**撥款：** 🌱 LightSeeds ×${amount}\n**現持有：** ${p.lightSeeds}`)
            .setTimestamp()] });
    }

    // !givefragments @玩家 數量
    if (command === '!givefragments' || command === '!givefrag') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0)
            return message.reply('❌ 格式：`!givefragments @玩家 數量`');

        const p = getOrCreatePlayer(client, target.id, target.username);
        p.fragments = (p.fragments || 0) + amount;
        savePlayerData(client, target.id, p);

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('📦 人格碎片撥款').setColor(0xffd166)
            .setDescription(`**對象：** <@${target.id}>\n**撥款：** 📦 人格碎片 ×${amount}\n**現持有：** ${p.fragments}`)
            .setTimestamp()] });
    }

    // !givescrolls @玩家 數量
    if (command === '!givescrolls' || command === '!givescroll') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0)
            return message.reply('❌ 格式：`!givescrolls @玩家 數量`');

        const p = getOrCreatePlayer(client, target.id, target.username);
        p.expScrolls = (p.expScrolls || 0) + amount;
        savePlayerData(client, target.id, p);

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('📜 經驗卷撥款').setColor(0xa55eea)
            .setDescription(`**對象：** <@${target.id}>\n**撥款：** 📜 經驗卷 ×${amount}\n**現持有：** ${p.expScrolls}`)
            .setTimestamp()] });
    }

    // !givethreads @玩家 數量
    if (command === '!givethreads' || command === '!givethread') {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0)
            return message.reply('❌ 格式：`!givethreads @玩家 數量`');

        const p = getOrCreatePlayer(client, target.id, target.username);
        p.thread = (p.thread || 0) + amount;
        savePlayerData(client, target.id, p);

        return message.reply({ embeds: [new EmbedBuilder()
            .setTitle('🧵 紡錘撥款').setColor(0x2ed573)
            .setDescription(`**對象：** <@${target.id}>\n**撥款：** 🧵 紡錘 ×${amount}\n**現持有：** ${p.thread}`)
            .setTimestamp()] });
    }

    // !updaterewards 數量
    if (command === '!updaterewards') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0)
            return message.reply('❌ 格式：`!updaterewards 數量`');
        return message.channel.send({ embeds: [new EmbedBuilder()
            .setTitle('🎁 全伺服器特別補償').setColor(0xffa502)
            .setDescription(`**全體發放：**\n• 🌱 LightSeeds ×${amount}\n• 🚂 特別提取券 ×1\n\n「全服維護補償已正式下發。」`)
            .setTimestamp()] });
    }

    // !updatebuff 倍數
    if (command === '!updatebuff') {
        const mult = parseFloat(args[1]);
        if (isNaN(mult) || mult <= 0)
            return message.reply('❌ 格式：`!updatebuff 倍數`');
        currentBuffMultiplier = mult;
        return message.channel.send({ embeds: [new EmbedBuilder()
            .setTitle('⚡ 獎勵脈衝過載').setColor(0xa55eea)
            .setDescription(`**關卡報酬倍率 → 【 ${currentBuffMultiplier} 倍 】**\n\n「執行 \`!stage\` 將獲得加倍戰利品。」`)
            .setTimestamp()] });
    }
}

module.exports = { handleGiveAway, getBuffMultiplier: () => currentBuffMultiplier };
