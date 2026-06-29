// Functions/Commanders.js
const PacksAndData     = require('./GameSystem/PacksAndData.js');
const Stages           = require('./GameSystem/Stages.js');
const GiveAwaySystem   = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon    = require('./GameSystem/MirrorDungeon.js');
const PullSystem       = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem  = require('./GameSystem/CharacterSystem.js');
const PartySystem      = require('./GameSystem/PartySystem.js');
const BattleSystem     = require('./GameSystem/BattleSystem.js');
const { checkSteamUpdates, checkTwitterUpdates } = require('./Newscheck.js');

// ── 冷卻 ─────────────────────────────────────────────────────
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

async function handleCommands(client, message) {
    const raw   = message.content.trim();
    const uid   = message.author.id;

    // ── 抽卡 ────────────────────────────────────────────────────
    if (raw === '!pull' || raw === '!單抽') {
        if (isOnCooldown(uid, 'pull')) return message.react('⏳');
        return PullSystem.executePull(client, message, 1);
    }
    if (['!十連','!10pulls','!pull 10','!pull10'].includes(raw)) {
        if (isOnCooldown(uid, 'pull10')) return message.react('⏳');
        return PullSystem.executePull(client, message, 10);
    }

    // ── 背包 / 清單 ──────────────────────────────────────────────
    if (raw === '!pack' || raw === '!bag' || raw === '!背包') {
        if (isOnCooldown(uid, 'pack')) return message.react('⏳');
        return PacksAndData.handleInventory(client, message);
    }
    if (raw === '!list' || raw === '!清單') {
        return PacksAndData.handleInventory(client, message);
    }

    // ── 戰鬥 ────────────────────────────────────────────────────
    if (raw === '!battle' || raw === '!戰鬥' || raw === '!fight') {
        if (isOnCooldown(uid, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'normal');
    }
    if (raw === '!battle elite' || raw === '!精英戰') {
        if (isOnCooldown(uid, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'elite');
    }
    if (raw === '!battle boss' || raw === '!boss戰') {
        if (isOnCooldown(uid, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.startBattle(client, message, 'boss');
    }

    // ── 隊伍 ────────────────────────────────────────────────────
    if (raw.startsWith('!party') || raw.startsWith('!隊伍')) {
        return PartySystem.handleParty(client, message);
    }

    // ── 罪人管理 ─────────────────────────────────────────────────
    if (raw.startsWith('!sinner') || raw.startsWith('!罪人')) {
        return CharacterSystem.handleSinner(client, message);
    }
    if (raw.startsWith('!uptie') || raw.startsWith('!連結')) {
        return CharacterSystem.handleUptie(client, message);
    }
    if (raw.startsWith('!equip') || raw.startsWith('!裝備')) {
        return CharacterSystem.handleEquip(client, message);
    }
    if (raw === '!threads' || raw === '!絲線' || raw === '!thread') {
        return CharacterSystem.handleThreads(client, message);
    }

    // ── 鏡光迷宮 ─────────────────────────────────────────────────
    if (raw.startsWith('!md') || raw.startsWith('!mirror') || raw === '!鏡光迷宮' || raw === '!鏡牢') {
        if (isOnCooldown(uid, 'md', 2000)) return message.react('⏳');
        return MirrorDungeon.handleMirrorDungeon(client, message);
    }

    // ── 主線關卡 ─────────────────────────────────────────────────
    if (raw.startsWith('!stage') || raw === '!挑戰') {
        if (isOnCooldown(uid, 'stage')) return message.react('⏳');
        return Stages.handleStage(client, message);
    }

    // ── 管理員 ───────────────────────────────────────────────────
    if (raw.startsWith('!givelunacy') || raw.startsWith('!updaterewards') || raw.startsWith('!updatebuff')) {
        return GiveAwaySystem.handleGiveAway(client, message);
    }

    // ── 新聞 ────────────────────────────────────────────────────
    if (raw === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(client, true, message);
    }
    if (raw === '!tweet' || raw === '!testtweet' || raw === '!測試官方推文') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(client, true, message);
    }
// ── Gay Rate ───────────────────────────────────────────────
if (raw.startsWith('!gayrate')) {
    const target = message.mentions.users.first();

    if (!target) {
        return message.reply('請 @ 一位使用者。\n例如：`!gayrate @user`');
    }

    const rate = target.id === '1330463890122735642'
        ? 0
        : 100;

    return message.reply(`${target} is **${rate}% gay** 🌈`);
}

async function sendHelp(message) {
    const { EmbedBuilder } = require('discord.js');
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('📋 Angela 指令清單')
            .setColor(0x00b4d8)
            .addFields(
                { name: '🎰 抽卡',     value: '`!pull` — 單抽\n`!十連` `!10pulls` — 十連' },
                { name: '🎒 背包',     value: '`!pack` `!bag` — 背包（含👥編制隊伍 / 🔼人格升等）\n`!list` — 所有可提取物資機率清單（翻頁）' },
                { name: '⚔️ 戰鬥',    value: '`!battle` — 普通 ｜ `!battle elite` — 精英 ｜ `!battle boss` — BOSS' },
                { name: '👥 隊伍',     value: '`!party` — 查看\n`!party add/remove [罪人]` — 加入/移出\n`!party set 李箱,浮士德,...` — 一次設定' },
                { name: '👤 罪人',     value: '`!sinner` — 全覽\n`!sinner [名]` — 詳細（技能數值/防禦/迴避）\n`!uptie [名]` — 連結提升\n`!equip [名] | [身分]` — 裝備\n`!threads` — 紡錘查詢' },
                { name: '🪞 鏡光迷宮', value: '`!md` — 說明\n`!md start` — 開始\n`!md status` — 進度' },
                { name: '🎮 其他',     value: '`!stage` — 挑戰關卡\n`!steam` — Steam公告\n`!tweet` — Twitter最新推文' },
            )
            .setFooter({ text: '指令冷卻 3s ｜ !help 再次查看' })]
    });
}

module.exports = { handleCommands };
