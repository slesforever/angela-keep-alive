// Functions/GameSystem/GiveAwaySystem.js
// 管理員發放系統（支援斜線指令全服 / 單人發放）
'use strict';
const fs   = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { loadPlayerData, savePlayerData, getOrCreatePlayer } = require('./PacksAndData.js');

const DATA_DIR = path.join(process.cwd(), 'data', 'players');
let currentBuffMultiplier = 1;

function isAdmin(message) { return message.member?.permissions.has(PermissionFlagsBits.Administrator); }

const FIELD_MAP = {
    givelightseeds: { key: 'lightSeeds', emoji: '🌱', label: 'LightSeeds',  color: 0x00b4d8 },
    givefragments:  { key: 'fragments',  emoji: '📦', label: '人格碎片',    color: 0xffd166 },
    givescrolls:    { key: 'expScrolls', emoji: '📜', label: '經驗卷',      color: 0xa55eea },
    givethreads:    { key: 'thread',     emoji: '🧵', label: '紡錘',        color: 0x2ed573 },
};

// ─── 斜線指令：全服發放 ───────────────────────────────────────
async function handleGiveAllPlayers(client, commandName, amount, interaction) {
    if (!fs.existsSync(DATA_DIR)) return interaction.editReply({ content: '❌ 找不到玩家資料目錄。' });
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    if (!files.length) return interaction.editReply({ content: '❌ 目前沒有任何玩家資料。' });
    const meta = FIELD_MAP[commandName];
    if (!meta) return interaction.editReply({ content: '❌ 未知指令。' });

    let count = 0;
    for (const f of files) {
        const userId = f.slice(0, -5);
        try {
            const p = getOrCreatePlayer(client, userId, 'Player');
            p[meta.key] = (p[meta.key] || 0) + amount;
            savePlayerData(client, userId, p);
            count++;
        } catch {}
    }
    return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle(`${meta.emoji} 全伺服器 ${meta.label} 發放完成`)
        .setColor(0x2ed573)
        .setDescription(`已對 **${count}** 位玩家各發放 **${meta.emoji} ${meta.label} ×${amount}**`)
        .setTimestamp()] });
}

// ─── 斜線指令：單人發放 ───────────────────────────────────────
async function handleGiveSinglePlayer(client, commandName, amount, targetUser, interaction) {
    const meta = FIELD_MAP[commandName];
    if (!meta) return interaction.editReply({ content: '❌ 未知指令。' });
    const p = getOrCreatePlayer(client, targetUser.id, targetUser.username);
    p[meta.key] = (p[meta.key] || 0) + amount;
    savePlayerData(client, targetUser.id, p);
    return interaction.editReply({ embeds: [new EmbedBuilder()
        .setTitle(`${meta.emoji} 單人 ${meta.label} 撥款`)
        .setColor(meta.color)
        .setDescription(`**對象：** <@${targetUser.id}>\n**撥款：** ${meta.emoji} ${meta.label} ×${amount}\n**現持有：** ${p[meta.key]}`)
        .setTimestamp()] });
}

// ─── 前綴指令相容（!givelightseeds 等）───────────────────────
async function handleGiveAway(client, message) {
    if (!isAdmin(message)) return message.reply('「很抱歉主管，您當前的精神權限不足以發動全系統物資撥款。」');
    const args    = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    const giveOne = async (key, emoji, label, color) => {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount) || amount <= 0)
            return message.reply(`❌ 格式：\`!${command.slice(1)} @玩家 數量\``);
        const p = getOrCreatePlayer(client, target.id, target.username);
        p[key] = (p[key] || 0) + amount;
        savePlayerData(client, target.id, p);
        return message.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji} ${label} 撥款`).setColor(color)
            .setDescription(`**對象：** <@${target.id}>\n**撥款：** ${emoji} ${label} ×${amount}\n**現持有：** ${p[key]}`).setTimestamp()] });
    };

    if (command === '!givelightseeds') return giveOne('lightSeeds','🌱','LightSeeds',0x00b4d8);
    if (['!givefragments','!givefrag'].includes(command)) return giveOne('fragments','📦','人格碎片',0xffd166);
    if (['!givescrolls','!givescroll'].includes(command)) return giveOne('expScrolls','📜','經驗卷',0xa55eea);
    if (['!givethreads','!givethread'].includes(command)) return giveOne('thread','🧵','紡錘',0x2ed573);

    if (command === '!updaterewards') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('❌ 格式：`!updaterewards 數量`');
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🎁 全伺服器特別補償').setColor(0xffa502)
            .setDescription(`**全體發放：**\n• 🌱 LightSeeds ×${amount}\n• 🚂 特別提取券 ×1\n\n「全服維護補償已正式下發。」`).setTimestamp()] });
    }
    if (command === '!updatebuff') {
        const mult = parseFloat(args[1]);
        if (isNaN(mult) || mult <= 0) return message.reply('❌ 格式：`!updatebuff 倍數`');
        currentBuffMultiplier = mult;
        return message.channel.send({ embeds: [new EmbedBuilder().setTitle('⚡ 獎勵脈衝過載').setColor(0xa55eea)
            .setDescription(`**關卡報酬倍率 → 【 ${currentBuffMultiplier} 倍 】**\n\n「執行 \`!stage\` 將獲得加倍戰利品。」`).setTimestamp()] });
    }
}

module.exports = { handleGiveAway, handleGiveAllPlayers, handleGiveSinglePlayer, getBuffMultiplier: () => currentBuffMultiplier };
