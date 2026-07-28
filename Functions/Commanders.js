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

const SUPER_ADMIN_ID = '1330463890122735642'; // 最高權限擁有者 ID

// ── 冷卻系統 ──────────────────────────────────────────────────
const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

// ── 每日固定指數計算函式 (同個人同一天測數值固定) ─────────────────────
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

// ── 相容性轉換器 (將 Interaction 轉包為相容 Message 物件) ──────────
function createPseudoMessage(interaction) {
    return {
        interaction,
        author: interaction.user,
        user: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel,
        client: interaction.client,
        content: '', // 於分發處動態填充

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
            const rate = getDailyRate(target.id, 'gay');
            const bar = createProgressBar(rate);
            
            let comment = '';
            if (rate < 20)      comment = '「數據顯示：鋼鐵般堅硬直男。」';
            else if (rate < 50) comment = '「有些許隱藏屬性，偶爾顯露出來。」';
            else if (rate < 80) comment = '「成分相當濃烈，已經無法隱藏了。」';
            else                comment = '「100% 純度的純真男同！ Angela 判定無誤。」';

            const embed = new EmbedBuilder()
                .setTitle('🏳️‍🌈 同性戀指數測試 (Gay Rate)')
                .setColor(0x3498db)
                .setDescription(`**${target.username}** 的男同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'lesbianrate') {
            const target = interaction.options.getUser('target') || user;
            const rate = getDailyRate(target.id, 'lesbian');
            const bar = createProgressBar(rate);
            
            let comment = '';
            if (rate < 20)      comment = '「姬圈指數較低，極度純粹的直女屬性。」';
            else if (rate < 50) comment = '「有些許姬圈潛質，值得進一步觀察。」';
            else if (rate < 80) comment = '「姬圈能量爆棚！極具吸引力。」';
            else                comment = '「100% 頂級姬圈霸主！ Angela 認證完畢。」';

            const embed = new EmbedBuilder()
                .setTitle('👭 姬圈指數測試 (Lesbian Rate)')
                .setColor(0xe91e63)
                .setDescription(`**${target.username}** 的女同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ── 8. 社群測試指令 (限該群組「管理員」權限可用) ─────────
        if (['steam', 'tweet', 'yt'].includes(commandName)) {
            const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isGuildAdmin) {
                return interaction.reply({
                    content: '❌ 權限不足：此測試指令僅限該 Discord 伺服器的「管理員」權限持有者使用。',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();
            if (commandName === 'steam') return checkSteamUpdates(client, true, interaction);
            if (commandName === 'tweet') return checkTwitterUpdates(client, true, interaction);
            if (commandName === 'yt')    return checkYouTubeUpdates(client, true, interaction);
        }

        // ── 9. 最高權限管理員指令 (嚴格限制 ID: 1330463890122735642) ──
        if (['givelunacy', 'givefragments', 'givescrolls', 'givethreads', 'updaterewards', 'updatebuff'].includes(commandName)) {
            if (uid !== SUPER_ADMIN_ID) {
                return interaction.reply({
                    content: `⛔ 權限被拒：此指令為最高特權專屬（僅限系統擁有者 Sles 執行）。`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // 發放資源類指令：處理全服發放/個人發放邏輯
            if (['givelunacy', 'givefragments', 'givescrolls', 'givethreads'].includes(commandName)) {
                const amount = interaction.options.getInteger('amount');
                const targetUser = interaction.options.getUser('target');
                const isAll = interaction.options.getBoolean('all') || false;

                let targetArg = '';
                if (isAll) {
                    targetArg = 'all'; // 傳遞全服標記給舊發放系統
                } else if (targetUser) {
                    targetArg = `<@${targetUser.id}>`;
                } else {
                    targetArg = `<@${uid}>`; // 若未選則預設發給自己
                }

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
            await interaction.followUp(replyPayload).catch(() => {});
        } else {
            await interaction.reply(replyPayload).catch(() => {});
        }
    }
}

// ── Help 選單 (更新分類與權限說明) ─────────────────────────────
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
            { name: '👑 特權管理員 (Sles 專屬)', value: '`/givelunacy` ｜ `/givefragments` ｜ `/givescrolls`\n`/givethreads` ｜ `/updaterewards` ｜ `/updatebuff`' }
        )
        .setFooter({ text: '輸入 / 即可喚出選單 ｜ 特權指令已放置於選單最底端' });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
