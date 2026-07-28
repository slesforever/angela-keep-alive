// Functions/Commanders.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const PacksAndData    = require('./GameSystem/PacksAndData.js');
const GiveAwaySystem  = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon   = require('./GameSystem/MirrorDungeon.js');
const PullSystem      = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem = require('./GameSystem/CharacterSystem.js');
const PartySystem     = require('./GameSystem/PartySystem.js');
const BattleSystem    = require('./GameSystem/BattleSystem.js');
const { checkSteamUpdates, checkTwitterUpdates, checkYouTubeUpdates } = require('./Newscheck.js');

// ── 冷卻系統 ──────────────────────────────────────────────────
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

// ── 處理斜線指令 ──────────────────────────────────────────────
async function handleSlashCommands(client, interaction) {
    const { commandName, user } = interaction;
    const uid = user.id;

    try {
        // ── 抽卡 (/pull) ──────────────────────────────────────
        if (commandName === 'pull') {
            const count = interaction.options.getInteger('count') || 1;
            const cdKey = count === 10 ? 'pull10' : 'pull';
            if (isOnCooldown(uid, cdKey)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return PullSystem.executePull(client, interaction, count);
        }

        // ── 背包 / 清單 (/pack, /list) ─────────────────────────
        if (commandName === 'pack' || commandName === 'list') {
            if (isOnCooldown(uid, 'pack')) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return PacksAndData.handleInventory(client, interaction);
        }

        // ── 戰鬥 (/battle) ────────────────────────────────────
        if (commandName === 'battle') {
            if (isOnCooldown(uid, 'battle', 5000)) {
                return interaction.reply({ content: '⏳ 戰鬥冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return BattleSystem.handleBattle(client, interaction);
        }

        // ── 隊伍 (/party) ─────────────────────────────────────
        if (commandName === 'party') {
            return PartySystem.handleParty(client, interaction);
        }

        // ── 罪人管理 (/sinner, /uptie, /equip, /threads) ───────
        if (commandName === 'sinner') {
            return CharacterSystem.handleSinner(client, interaction);
        }
        if (commandName === 'uptie') {
            return CharacterSystem.handleUptie(client, interaction);
        }
        if (commandName === 'equip') {
            return CharacterSystem.handleEquip(client, interaction);
        }
        if (commandName === 'threads') {
            return CharacterSystem.handleThreads(client, interaction);
        }

        // ── 鏡光迷宮 (/md) ───────────────────────────────────
        if (commandName === 'md') {
            if (isOnCooldown(uid, 'md', 2000)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return MirrorDungeon.handleMirrorDungeon(client, interaction);
        }

        // ── 管理員發放指令 ────────────────────────────────────
        if ([
            'givelunacy', 'givefragments', 'givescrolls', 
            'givethreads', 'updaterewards', 'updatebuff'
        ].includes(commandName)) {
            return GiveAwaySystem.handleGiveAway(client, interaction);
        }

        // ── 新聞監測 (/steam, /tweet, /yt) ────────────────────
        if (commandName === 'steam') {
            await interaction.deferReply();
            return checkSteamUpdates(client, true, interaction);
        }
        if (commandName === 'tweet') {
            await interaction.deferReply();
            return checkTwitterUpdates(client, true, interaction);
        }
        if (commandName === 'yt') {
            await interaction.deferReply();
            return checkYouTubeUpdates(client, true, interaction);
        }

        // ── 說明 (/help) ──────────────────────────────────────
        if (commandName === 'help') {
            return sendHelp(interaction);
        }

    } catch (error) {
        console.error(`[Command Error] 執行 /${commandName} 時發生錯誤:`, error);
        const replyPayload = { content: '❌ 執行指令時發生內部錯誤。', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(replyPayload);
        } else {
            await interaction.reply(replyPayload);
        }
    }
}

// ── Help 選單 ─────────────────────────────────────────────────
async function sendHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 Angela 指令清單 (Slash Commands)')
        .setColor(0x00b4d8)
        .addFields(
            { name: '🎰 抽卡',      value: '`/pull` — 單抽或十連抽卡' },
            { name: '🎒 背包',      value: '`/pack` — 背包介面\n`/list` — 全池機率清單' },
            { name: '⚔️ 戰鬥',     value: '`/battle` — 出戰關卡獲取狂氣（5個難度）' },
            { name: '👥 隊伍',      value: '`/party` — 查看與管理隊伍陣容' },
            { name: '👤 罪人',      value: '`/sinner` 罪人全覽／詳細資訊\n`/uptie` 提升連結 ｜ `/equip` 裝備人格\n`/threads` 資源查詢' },
            { name: '🪞 鏡光迷宮',  value: '`/md` 進入鏡光迷宮與進度查看' },
            { name: '🎮 新聞',      value: '`/steam` Steam最新 ｜ `/tweet` 推特最新 ｜ `/yt` YouTube最新' },
            { name: '🔑 管理員',    value: '`/setchannel` — 設定通知與發射頻道\n`/givelunacy` ｜ `/givefragments` ｜ `/givescrolls` ｜ `/givethreads`\n`/updaterewards` ｜ `/updatebuff`' }
        )
        .setFooter({ text: '指令冷卻 3s ｜ 輸入 / 即可查看選單' });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
