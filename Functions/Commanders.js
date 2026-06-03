// Functions/Commanders.js
const PacksAndData      = require('./GameSystem/PacksAndData.js');
const Stages            = require('./GameSystem/Stages.js');
const GiveAwaySystem    = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon     = require('./GameSystem/MirrorDungeon.js');
const PullSystem        = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem   = require('./GameSystem/CharacterSystem.js');
const PartySystem       = require('./GameSystem/PartySystem.js');
const BattleSystem      = require('./GameSystem/BattleSystem.js');
const { checkSteamUpdates, checkTwitterUpdates } = require('./Newscheck.js');

// 冷卻系統
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

async function handleCommands(client, message) {
    const raw  = message.content.trim();
    const lower = raw.toLowerCase();
    const userId = message.author.id;

    // ── 抽卡：單抽 ──────────────────────────────────────────────
    if (raw === '!pull' || raw === '!單抽') {
        if (isOnCooldown(userId, 'pull')) return message.react('⏳');
        return PullSystem.executePull(client, message, 1);
    }

    // ── 抽卡：十連 ──────────────────────────────────────────────
    if (raw === '!十連' || raw === '!10pulls' || raw === '!pull 10' || raw === '!pull10') {
        if (isOnCooldown(userId, 'pull10')) return message.react('⏳');
        return PullSystem.executePull(client, message, 10);
    }

    // ── 背包 ─────────────────────────────────────────────────────
    if (raw === '!pack' || raw === '!bag' || raw === '!背包') {
        if (isOnCooldown(userId, 'pack')) return message.react('⏳');
        return PacksAndData.handleInventory(client, message);
    }

    // ── 物資清單（翻頁） ─────────────────────────────────────────
    if (raw === '!list' || raw === '!清單') {
        return PacksAndData.handleInventory(client, message);
    }

    // ── 隊伍管理 ─────────────────────────────────────────────────
    if (raw.startsWith('!party') || raw.startsWith('!隊伍')) {
        return PartySystem.handleParty(client, message);
    }

    // ── 戰鬥 ─────────────────────────────────────────────────────
    if (raw === '!battle' || raw === '!戰鬥' || raw === '!fight') {
        if (isOnCooldown(userId, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'normal');
    }
    if (raw === '!battle elite' || raw === '!精英戰') {
        if (isOnCooldown(userId, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'elite');
    }
    if (raw === '!battle boss' || raw === '!boss戰') {
        if (isOnCooldown(userId, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'boss');
    }

    // ── 罪人資訊 ─────────────────────────────────────────────────
    if (raw.startsWith('!sinner') || raw.startsWith('!罪人')) {
        return CharacterSystem.handleSinner(client, message);
    }

    // ── 連結提升（消耗絲線）─────────────────────────────────────
    if (raw.startsWith('!uptie') || raw.startsWith('!連結')) {
        return CharacterSystem.handleUptie(client, message);
    }

    // ── 裝備身分 ─────────────────────────────────────────────────
    if (raw.startsWith('!equip') || raw.startsWith('!裝備')) {
        return CharacterSystem.handleEquip(client, message);
    }

    // ── 絲線查詢 ─────────────────────────────────────────────────
    if (raw === '!threads' || raw === '!絲線' || raw === '!thread') {
        return CharacterSystem.handleThreads(client, message);
    }

    // ── 鏡光迷宮 ─────────────────────────────────────────────────
    if (raw.startsWith('!md') || raw.startsWith('!mirror') || raw === '!鏡光迷宮' || raw === '!鏡牢') {
        if (isOnCooldown(userId, 'md', 2000)) return message.react('⏳');
        return MirrorDungeon.handleMirrorDungeon(client, message);
    }

    // ── 主線關卡 ─────────────────────────────────────────────────
    if (raw.startsWith('!stage') || raw === '!挑戰') {
        if (isOnCooldown(userId, 'stage')) return message.react('⏳');
        return Stages.handleStage(client, message);
    }

    // ── 管理員指令 ───────────────────────────────────────────────
    if (raw.startsWith('!givelunacy') || raw.startsWith('!updaterewards') || raw.startsWith('!updatebuff')) {
        return GiveAwaySystem.handleGiveAway(client, message);
    }

    // ── 手動新聞 ─────────────────────────────────────────────────
    if (raw === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(client, true, message);
    }
    if (raw === '!tweet' || raw === '!testtweet' || raw === '!測試官方推文') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(client, true, message);
    }

    // ── 說明 ─────────────────────────────────────────────────────
    if (raw === '!help' || raw === '!指令' || raw === '!h') {
        return sendHelp(message);
    }
}

async function sendHelp(message) {
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
        .setTitle('📋 Angela 指令清單')
        .setColor(0x00b4d8)
        .addFields(
            {
                name: '🎰 抽卡',
                value: '`!pull` `!單抽` — 單抽\n`!十連` `!10pulls` `!pull 10` — 十連',
                inline: false,
            },
            {
                name: '🎒 背包 & 清單',
                value: '`!pack` `!bag` `!背包` — 查看收容物\n`!list` `!清單` — 瀏覽所有可提取物資（含機率，可翻頁）',
                inline: false,
            },
            {
                name: '⚔️ 戰鬥',
                value: '`!battle` — 普通戰鬥\n`!battle elite` — 精英戰鬥\n`!battle boss` — BOSS 戰',
                inline: false,
            },
            {
                name: '👥 隊伍',
                value: '`!party` — 查看隊伍\n`!party add [罪人]` — 加入\n`!party remove [罪人]` — 移出\n`!party set 李箱,浮士德,...` — 一次設定',
                inline: false,
            },
            {
                name: '👤 罪人管理',
                value: '`!sinner` — 查看全部罪人\n`!sinner [罪人名]` — 詳細資訊\n`!equip [罪人名] | [身分名]` — 裝備身分\n`!uptie [罪人名]` — 連結提升（消耗絲線）\n`!threads` — 查看絲線數量',
                inline: false,
            },
            {
                name: '🪞 鏡光迷宮',
                value: '`!md` — 說明\n`!md start` — 開始迷宮\n`!md status` — 查看進度',
                inline: false,
            },
            {
                name: '🎮 其他',
                value: '`!stage` `!挑戰` — 挑戰關卡\n`!steam` — Steam 公告\n`!tweet` — Twitter 最新推文',
                inline: false,
            }
        )
        .setFooter({ text: '所有指令冷卻 3 秒 | 輸入 !help 再次查看' });

    return message.reply({ embeds: [embed] });
}

module.exports = { handleCommands };
