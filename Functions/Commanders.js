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

// ── 相容性轉換器：把 Interaction 包裝成舊子系統看得懂的 Message ──
function createPseudoMessage(interaction) {
    // 提煉參數，自動拼出舊系統習慣的文字指令格式（如 "!pull 10"）
    const optionsData = interaction.options?.data || [];
    const args = [];

    for (const opt of optionsData) {
        if (opt.value !== undefined && opt.value !== null) {
            args.push(opt.value);
        }
    }

    const simulatedContent = `!${interaction.commandName} ${args.join(' ')}`.trim();

    return {
        interaction,
        author: interaction.user,
        user: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel,
        client: interaction.client,
        content: simulatedContent, // 🔥 關鍵：補上 content 屬性，防止 message.content.trim() 爆掉

        // 橋接 reply 函式，無縫接軌斜線指令的回覆與延遲機制
        reply: async (options) => {
            const payload = typeof options === 'string' ? { content: options } : { ...options };
            
            try {
                if (interaction.deferred || interaction.replied) {
                    return await interaction.followUp(payload);
                } else {
                    return await interaction.reply(payload);
                }
            } catch (err) {
                return await interaction.followUp(payload).catch(() => {});
            }
        },

        // 防護：若舊系統有調用 react 或 delete 不致於斷言失敗
        react: async () => {},
        delete: async () => {}
    };
}

// ── 處理斜線指令分發 ─────────────────────────────────────────
async function handleSlashCommands(client, interaction) {
    const { commandName, user } = interaction;
    const uid = user.id;

    // 將斜線指令 Interaction 轉包為相容的假 Message 物件
    const fakeMessage = createPseudoMessage(interaction);

    try {
        // ── 抽卡 (/pull) ──────────────────────────────────────
        if (commandName === 'pull') {
            const count = interaction.options.getInteger('count') || 1;
            const cdKey = count === 10 ? 'pull10' : 'pull';
            if (isOnCooldown(uid, cdKey)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            if (typeof PullSystem.executePull === 'function') {
                return PullSystem.executePull(client, fakeMessage, count);
            }
            return typeof PullSystem === 'function' ? PullSystem(client, fakeMessage) : PullSystem.handlePull?.(client, fakeMessage);
        }

        // ── 背包 / 清單 (/pack, /list) ─────────────────────────
        if (commandName === 'pack' || commandName === 'list') {
            if (isOnCooldown(uid, 'pack')) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return PacksAndData.handleInventory ? PacksAndData.handleInventory(client, fakeMessage) : PacksAndData(client, fakeMessage);
        }

        // ── 戰鬥 (/battle) ────────────────────────────────────
        if (commandName === 'battle') {
            if (isOnCooldown(uid, 'battle', 5000)) {
                return interaction.reply({ content: '⏳ 戰鬥冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return BattleSystem.handleBattle ? BattleSystem.handleBattle(client, fakeMessage) : BattleSystem(client, fakeMessage);
        }

        // ── 隊伍 (/party) ─────────────────────────────────────
        if (commandName === 'party') {
            return PartySystem.handleParty ? PartySystem.handleParty(client, fakeMessage) : PartySystem(client, fakeMessage);
        }

        // ── 罪人管理 (/sinner, /uptie, /equip, /threads) ───────
        if (commandName === 'sinner') {
            return CharacterSystem.handleSinner ? CharacterSystem.handleSinner(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }
        if (commandName === 'uptie') {
            return CharacterSystem.handleUptie ? CharacterSystem.handleUptie(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }
        if (commandName === 'equip') {
            return CharacterSystem.handleEquip ? CharacterSystem.handleEquip(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }
        if (commandName === 'threads') {
            return CharacterSystem.handleThreads ? CharacterSystem.handleThreads(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }

        // ── 鏡光迷宮 (/md) ───────────────────────────────────
        if (commandName === 'md') {
            if (isOnCooldown(uid, 'md', 2000)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return MirrorDungeon.handleMirrorDungeon ? MirrorDungeon.handleMirrorDungeon(client, fakeMessage) : MirrorDungeon(client, fakeMessage);
        }

        // ── 管理員發放指令 ────────────────────────────────────
        if ([
            'givelunacy', 'givefragments', 'givescrolls', 
            'givethreads', 'updaterewards', 'updatebuff'
        ].includes(commandName)) {
            return GiveAwaySystem.handleGiveAway ? GiveAwaySystem.handleGiveAway(client, fakeMessage) : GiveAwaySystem(client, fakeMessage);
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
        const replyPayload = { content: `❌ 執行指令時發生內部錯誤：${error.message}`, flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(replyPayload).catch(() => {});
        } else {
            await interaction.reply(replyPayload).catch(() => {});
        }
    }
}

// ── Help 選單 ─────────────────────────────────────────────────
async function sendHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 Angela 指令清單 (Discord 內建斜線選單)')
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
        .setFooter({ text: '指令冷卻 3s ｜ 輸入 / 即可喚出內建選單' });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
