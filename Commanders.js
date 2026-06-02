// Functions/Commanders.js
const PacksAndData = require('./GameSystem/PacksAndData.js');
const Stages = require('./GameSystem/Stages.js');
const GiveAwaySystem = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon = require('./GameSystem/MirrorDungeon.js');
const PullSystem = require('./GameSystem/Pulls/PullSystem.js');
const { checkSteamUpdates, checkTwitterUpdates } = require('./Newscheck.js');

const COOLDOWNS = new Map();
const COOLDOWN_MS = 3000;

function isOnCooldown(userId, command) {
    const key = `${userId}:${command}`;
    const last = COOLDOWNS.get(key) || 0;
    if (Date.now() - last < COOLDOWN_MS) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

async function handleCommands(client, message) {
    const msg = message.content.trim();
    const userId = message.author.id;

    // ── 抽卡：單抽
    if (msg === '!pull' || msg === '!單抽') {
        if (isOnCooldown(userId, 'pull')) return message.react('⏳');
        if (PullSystem?.executePull) return PullSystem.executePull(client, message, 1);
    }

    // ── 抽卡：十連（支援 !十連 / !10pulls / !pull 10）
    if (
        msg === '!十連' ||
        msg === '!10pulls' ||
        msg === '!pull 10' ||
        msg === '!pull10'
    ) {
        if (isOnCooldown(userId, 'pull10')) return message.react('⏳');
        if (PullSystem?.executePull) return PullSystem.executePull(client, message, 10);
    }

    // ── 背包
    if (msg === '!pack' || msg === '!bag' || msg === '!背包') {
        if (isOnCooldown(userId, 'pack')) return message.react('⏳');
        if (PacksAndData?.handleInventory) return PacksAndData.handleInventory(client, message);
    }

    // ── 物資清單（翻頁）
    if (msg === '!list' || msg === '!清單') {
        if (PacksAndData?.handleInventory) return PacksAndData.handleInventory(client, message);
    }

    // ── 鏡光迷宮
    if (msg.startsWith('!md') || msg.startsWith('!mirror') || msg === '!鏡光迷宮') {
        if (isOnCooldown(userId, 'md')) return message.react('⏳');
        if (MirrorDungeon?.handleMirrorDungeon) return MirrorDungeon.handleMirrorDungeon(client, message);
        return message.reply('❌ MirrorDungeon 模組尚未就緒。');
    }

    // ── 主線關卡
    if (msg.startsWith('!stage') || msg === '!挑戰') {
        if (isOnCooldown(userId, 'stage')) return message.react('⏳');
        if (Stages?.handleStage) return Stages.handleStage(client, message);
    }

    // ── 管理員福利
    if (
        msg.startsWith('!givelunacy') ||
        msg.startsWith('!updaterewards') ||
        msg.startsWith('!updatebuff')
    ) {
        if (GiveAwaySystem?.handleGiveAway) return GiveAwaySystem.handleGiveAway(client, message);
    }

    // ── 手動新聞觀測
    if (msg === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(client, true, message);
    }
    if (msg === '!測試官方推文' || msg === '!testtweet' || msg === '!tweet') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(client, true, message);
    }

    // ── 說明
    if (msg === '!help' || msg === '!指令') {
        const { EmbedBuilder } = require('discord.js');
        const helpEmbed = new EmbedBuilder()
            .setTitle('📋 Angela 指令清單')
            .setColor(0x00b4d8)
            .addFields(
                { name: '🎰 抽卡', value: '`!pull` `!單抽` — 單抽\n`!十連` `!10pulls` `!pull 10` — 十連', inline: true },
                { name: '🎒 背包', value: '`!pack` `!bag` `!背包` — 查看收容物', inline: true },
                { name: '📂 物資池', value: '`!list` `!清單` — 瀏覽全部可提取物資（含機率）', inline: true },
                { name: '🪞 鏡光迷宮', value: '`!md` `!mirror` `!鏡光迷宮`', inline: true },
                { name: '⚔️ 挑戰關卡', value: '`!stage` `!挑戰`', inline: true },
                { name: '📡 手動情報', value: '`!steam` — Steam 公告\n`!tweet` — Twitter 推文', inline: true }
            )
            .setFooter({ text: '冷卻時間：3 秒 | 輸入 !help 顯示此清單' });
        return message.reply({ embeds: [helpEmbed] });
    }
}

module.exports = { handleCommands };
