// Functions/Commanders.js
const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const PacksAndData    = require('./GameSystem/PacksAndData.js');
const GiveAwaySystem  = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon   = require('./GameSystem/MirrorDungeon.js');
const PullSystem      = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem = require('./GameSystem/CharacterSystem.js');
const PartySystem     = require('./GameSystem/PartySystem.js');
const BattleSystem    = require('./GameSystem/BattleSystem.js');
const { checkSteamUpdates, checkTwitterUpdates, checkYouTubeUpdates } = require('./Newscheck.js');

const SUPER_ADMIN_ID = '1330463890122735642'; // 唯一能改動玩家進度與發放資源的最高主管 ID

// ── 冷卻系統 ──────────────────────────────────────────────────
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

// ── 每日固定指數計算 ──────────────────────────────────────────
function getDailyRate(userId, salt) {
    const dateStr = new Date().toISOString().slice(0, 10);
    let hash = 0;
    const str = `${userId}:${salt}:${dateStr}`;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 101;
}

function createProgressBar(percent) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// ── 相容性轉型橋接器 (修復 Deferred 衝突 Bug) ─────────────────
function createPseudoMessage(interaction) {
    return {
        interaction,
        author: interaction.user,
        user: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel,
        client: interaction.client,
        content: '',

        // 🔥 關鍵修復：若系統已 defer，自動切換為 editReply，解決報錯！
        reply: async (options) => {
            const payload = typeof options === 'string' ? { content: options } : { ...options };
            try {
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(payload);
                } else {
                    return await interaction.reply(payload);
                }
            } catch (err) {
                if (interaction.deferred || interaction.replied) {
                    return await interaction.editReply(payload).catch(() => {});
                }
                return await interaction.followUp(payload).catch(() => {});
            }
        },
        react: async () => {},
        delete: async () => {}
    };
}

// ── 處理斜線指令分發 ─────────────────────────────────────────
async function handleSlashCommands(client, interaction) {
    const { commandName, user } = interaction;
    const uid = user.id;

    const fakeMessage = createPseudoMessage(interaction);

    try {
        // ── 1. 抽卡 (/pull) ──────────────────────────────────
        if (commandName === 'pull') {
            const count = interaction.options.getInteger('count') || 1;
            fakeMessage.content = `!pull ${count}`;
            if (isOnCooldown(uid, count === 10 ? 'pull10' : 'pull')) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            if (typeof PullSystem.executePull === 'function') {
                return PullSystem.executePull(client, fakeMessage, count);
            }
            return typeof PullSystem === 'function' ? PullSystem(client, fakeMessage) : PullSystem.handlePull?.(client, fakeMessage);
        }

        // ── 2. 背包與清單 (/pack, /list) ──────────────────────
        if (commandName === 'pack' || commandName === 'list') {
            fakeMessage.content = `!${commandName}`;
            if (isOnCooldown(uid, 'pack')) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return PacksAndData.handleInventory ? PacksAndData.handleInventory(client, fakeMessage) : PacksAndData(client, fakeMessage);
        }

        // ── 3. 戰鬥 (/battle) ────────────────────────────────
        if (commandName === 'battle') {
            fakeMessage.content = '!battle';
            if (isOnCooldown(uid, 'battle', 5000)) {
                return interaction.reply({ content: '⏳ 戰鬥冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return BattleSystem.handleBattle ? BattleSystem.handleBattle(client, fakeMessage) : BattleSystem(client, fakeMessage);
        }

        // ── 4. 隊伍 (/party) ─────────────────────────────────
        if (commandName === 'party') {
            fakeMessage.content = '!party';
            return PartySystem.handleParty ? PartySystem.handleParty(client, fakeMessage) : PartySystem(client, fakeMessage);
        }

        // ── 5. 罪人管理 (/sinner, /uptie, /equip, /threads) ───
        if (['sinner', 'uptie', 'equip', 'threads'].includes(commandName)) {
            fakeMessage.content = `!${commandName}`;
            if (commandName === 'sinner')  return CharacterSystem.handleSinner ? CharacterSystem.handleSinner(client, fakeMessage) : CharacterSystem(client, fakeMessage);
            if (commandName === 'uptie')   return CharacterSystem.handleUptie ? CharacterSystem.handleUptie(client, fakeMessage) : CharacterSystem(client, fakeMessage);
            if (commandName === 'equip')   return CharacterSystem.handleEquip ? CharacterSystem.handleEquip(client, fakeMessage) : CharacterSystem(client, fakeMessage);
            if (commandName === 'threads') return CharacterSystem.handleThreads ? CharacterSystem.handleThreads(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }

        // ── 6. 鏡光迷宮 (/md) ───────────────────────────────
        if (commandName === 'md') {
            fakeMessage.content = '!md';
            if (isOnCooldown(uid, 'md', 2000)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return MirrorDungeon.handleMirrorDungeon ? MirrorDungeon.handleMirrorDungeon(client, fakeMessage) : MirrorDungeon(client, fakeMessage);
        }

        // ── 7. 男同/姬圈指數 (/gayrate, /lesbianrate) ────────
        if (commandName === 'gayrate') {
            const target = interaction.options.getUser('target') || user;
            let rate = getDailyRate(target.id, 'gay');
            if (target.id === SUPER_ADMIN_ID) rate = 0; // Sles 鎖定 0%

            const bar = createProgressBar(rate);
            let comment = target.id === SUPER_ADMIN_ID 
                ? '「主管專屬認證：鋼鐵般的絕對 0% 直男，系統數據無法改寫。」'
                : (rate < 20 ? '「數據顯示：鋼鐵般堅硬直男。」' : rate < 50 ? '「有些許隱藏屬性。」' : rate < 80 ? '「成分相當濃烈。」' : '「100% 純度純真男同！」');

            const embed = new EmbedBuilder()
                .setTitle('男同指數測試 (Gay Rate)')
                .setColor(0x3498db)
                .setDescription(`**${target.username}** 的男同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }));

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'lesbianrate') {
            const target = interaction.options.getUser('target') || user;
            let rate = getDailyRate(target.id, 'lesbian');
            if (target.id === SUPER_ADMIN_ID) rate = 0; // Sles 鎖定 0%

            const bar = createProgressBar(rate);
            let comment = target.id === SUPER_ADMIN_ID 
                ? '「主管專屬認證：絕對 0% 直直到發光，姬圈屬性完全免疫。」'
                : (rate < 20 ? '「姬圈指數較低，極度純粹直女。」' : rate < 50 ? '「有些許潛質。」' : rate < 80 ? '「能量爆棚！」' : '「100% 頂級女同霸主！」');

            const embed = new EmbedBuilder()
                .setTitle('女同指數測試 (Lesbian Rate)')
                .setColor(0xe91e63)
                .setDescription(`**${target.username}** 的女同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }));

            return interaction.reply({ embeds: [embed] });
        }

        // ── 8. 社群測試指令 (限該伺服器「管理員」執行) ──────────────
        if (['steam', 'tweet', 'youtube'].includes(commandName)) {
            const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isGuildAdmin) {
                return interaction.reply({
                    content: '❌ 權限不足：此測試指令僅限該 Discord 伺服器的「管理員」權限持有者使用。',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply(); // 先 deferred，fakeMessage 會自動 editReply 解決報錯！
            if (commandName === 'steam') return checkSteamUpdates(client, true, fakeMessage);
            if (commandName === 'tweet') return checkTwitterUpdates(client, true, fakeMessage);
            if (commandName === 'youtube')    return checkYouTubeUpdates(client, true, fakeMessage);
        }

        // ── 9. 最高權限管理員指令 (嚴格限制僅 Sles ID: 1330463890122735642 可執行) ──
        if (['givelunacy', 'givefragments', 'givescrolls', 'givethreads', 'updaterewards', 'updatebuff'].includes(commandName)) {
            if (uid !== SUPER_ADMIN_ID) {
                return interaction.reply({
                    content: `⛔ 權限被拒：涉及玩家進度與物資發放之指令，僅限最高主管 Sles (ID: ${SUPER_ADMIN_ID}) 執行。`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['givelunacy', 'givefragments', 'givescrolls', 'givethreads'].includes(commandName)) {
                const amount = interaction.options.getInteger('amount');
                const targetUser = interaction.options.getUser('target');
                const isAll = interaction.options.getBoolean('all') || false;

                let targetArg = isAll ? 'all' : (targetUser ? `<@${targetUser.id}>` : `<@${uid}>`);
                fakeMessage.content = `!${commandName} ${targetArg} ${amount}`;
            } else {
                fakeMessage.content = `!${commandName}`;
            }

            return GiveAwaySystem.handleGiveAway ? GiveAwaySystem.handleGiveAway(client, fakeMessage) : GiveAwaySystem(client, fakeMessage);
        }

        // ── 10. 說明選單 (/help) ──────────────────────────────
        if (commandName === 'help') {
            return sendHelp(interaction);
        }

    } catch (error) {
        console.error(`[Command Error] 執行 /${commandName} 時發生錯誤:`, error);
        const replyPayload = { content: `❌ 執行指令時發生內部錯誤：${error.message}`, flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(replyPayload).catch(() => {});
        } else {
            await interaction.reply(replyPayload).catch(() => {});
        }
    }
}

// ── Help 選單 ─────────────────────────────────────────────────
async function sendHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📋 Angela 指令清單')
        .setColor(0x00b4d8)
        .addFields(
            { name: '🎰 抽卡與背包', value: '`/pull` — 抽卡 ｜ `/pack` — 背包 ｜ `/list` — 機率表' },
            { name: '⚔️ 戰鬥與隊伍', value: '`/battle` — 出戰關卡 ｜ `/party` — 隊伍管理' },
            { name: '👤 罪人與資源', value: '`/sinner` — 罪人全覽 ｜ `/uptie` — 提升連結\n`/equip` — 裝備人格 ｜ `/threads` — 絲線查詢' },
            { name: '🪞 鏡光迷宮',   value: '`/md` — 鏡光迷宮系統' },
            { name: '🎲 娛樂功能',   value: '`/gayrate` — 男同指數測試\n`/lesbianrate` — 姬圈指數測試' },
            { name: '📰 社群檢測 (群管理員)', value: '`/steam` ｜ `/tweet` ｜ `/yt` ｜ `/setchannel`' },
            { name: '👑 最高主管特權 (Sles 專屬)', value: '`/givelunacy` ｜ `/givefragments` ｜ `/givescrolls`\n`/givethreads` ｜ `/updaterewards` ｜ `/updatebuff`' }
        )
        .setFooter({ text: '輸入 / 即可喚出選單 ｜ 所有獎勵與倍率修改權限已鎖定為 Sles 專屬' });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
