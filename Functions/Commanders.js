// Functions/Commanders.js
const PacksAndData    = require('./GameSystem/PacksAndData.js');
const GiveAwaySystem  = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon   = require('./GameSystem/MirrorDungeon.js');
const PullSystem      = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem = require('./GameSystem/CharacterSystem.js');
const PartySystem     = require('./GameSystem/PartySystem.js');
const BattleSystem    = require('./GameSystem/BattleSystem.js');
const { checkSteamUpdates, checkTwitterUpdates } = require('./Newscheck.js');

// ── 冷卻 ──────────────────────────────────────────────────────
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

async function handleCommands(client, message) {
    const raw = message.content.trim();
    const uid = message.author.id;

    // ── 抽卡 ──────────────────────────────────────────────────
    if (raw === '!pull' || raw === '!單抽') {
        if (isOnCooldown(uid, 'pull')) return message.react('⏳');
        return PullSystem.executePull(client, message, 1);
    }
    if (['!十連', '!10pulls', '!pull 10', '!pull10'].includes(raw)) {
        if (isOnCooldown(uid, 'pull10')) return message.react('⏳');
        return PullSystem.executePull(client, message, 10);
    }

    // ── 背包 / 清單 ────────────────────────────────────────────
    if (raw === '!pack' || raw === '!bag' || raw === '!背包') {
        if (isOnCooldown(uid, 'pack')) return message.react('⏳');
        return PacksAndData.handleInventory(client, message);
    }
    if (raw === '!list' || raw === '!清單') {
        return PacksAndData.handleInventory(client, message);
    }

    // ── 戰鬥 ──────────────────────────────────────────────────
    if (raw === '!stage' || raw === '!戰鬥' || raw === '!fight') {
        if (isOnCooldown(uid, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.handleBattle(client, message);
    }
    // 保留快捷難度指令
    if (raw.startsWith('!battle ')) {
        if (isOnCooldown(uid, 'battle', 5000)) return message.react('⏳');
        return BattleSystem.handleBattle(client, message);
    }

    // ── 隊伍 ──────────────────────────────────────────────────
    if (raw.startsWith('!party') || raw.startsWith('!隊伍')) {
        return PartySystem.handleParty(client, message);
    }

    // ── 罪人管理 ──────────────────────────────────────────────
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

    // ── 鏡光迷宮 ──────────────────────────────────────────────
    if (raw.startsWith('!md') || raw.startsWith('!mirror') || raw === '!鏡光迷宮' || raw === '!鏡牢') {
        if (isOnCooldown(uid, 'md', 2000)) return message.react('⏳');
        return MirrorDungeon.handleMirrorDungeon(client, message);
    }

    // ── 管理員 ────────────────────────────────────────────────
    if (
        raw.startsWith('!givelunacy')   ||
        raw.startsWith('!givefragments') ||
        raw.startsWith('!givefrag')      ||
        raw.startsWith('!givescrolls')   ||
        raw.startsWith('!givescroll')    ||
        raw.startsWith('!givethreads')   ||
        raw.startsWith('!givethread')    ||
        raw.startsWith('!updaterewards') ||
        raw.startsWith('!updatebuff')
    ) {
        return GiveAwaySystem.handleGiveAway(client, message);
    }

    // ── 新聞 ──────────────────────────────────────────────────
    if (raw === '!steam') {
        await message.channel.sendTyping();
        return checkSteamUpdates(client, true, message);
    }
    if (raw === '!tweet' || raw === '!testtweet' || raw === '!測試官方推文') {
        await message.channel.sendTyping();
        return checkTwitterUpdates(client, true, message);
    }

    // ── 說明 ──────────────────────────────────────────────────
    if (raw === '!help' || raw === '!指令' || raw === '!h') {
        return sendHelp(message);
    }
}

async function sendHelp(message) {
    const { EmbedBuilder } = require('discord.js');
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('📋 Angela 指令清單')
            .setColor(0x00b4d8)
            .addFields(
                { name: '🎰 抽卡',     value: '`!pull` — 單抽\n`!十連` `!10pulls` — 十連' },
                { name: '🎒 背包',     value: '`!pack` — LC主頁式背包介面\n`!list` — 全池機率清單（翻頁）' },
                { name: '⚔️ 戰鬥',    value: '`!battle` — 選擇難度出戰（5個難度）\n狂氣獎勵：超簡單×20 ｜ 簡單×40 ｜ 一般×70 ｜ 困難×130 ｜ 瘋狂×200' },
                { name: '👥 隊伍',     value: '`!party` — 查看\n`!party add/remove [罪人]` — 管理\n`!party set 李箱,浮士德,...`' },
                { name: '👤 罪人',     value: '`!sinner` 全覽 ｜ `!sinner [名]` 詳細\n`!uptie [名]` 連結提升 ｜ `!equip [名] | [人格]`\n`!threads` 資源查詢' },
                { name: '🪞 鏡光迷宮', value: '`!md` 開始 ｜ `!md status` 進度' },
                { name: '🎮 其他',     value: '`!steam` Steam公告 ｜ `!tweet` Twitter最新' },
                { name: '🔑 管理員',   value: '`!givelunacy @玩家 數量`\n`!givefragments @玩家 數量`\n`!givescrolls @玩家 數量`\n`!givethreads @玩家 數量`\n`!updaterewards 數量` ｜ `!updatebuff 倍數`' },
            )
            .setFooter({ text: '指令冷卻 3s ｜ !help 再次查看' })]
    });
}

module.exports = { handleCommands };
