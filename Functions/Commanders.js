// Functions/Commanders.js
'use strict';
const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const PacksAndData    = require('./GameSystem/PacksAndData.js');
const GiveAwaySystem  = require('./GameSystem/GiveAwaySystem.js');
const MirrorDungeon   = require('./GameSystem/MirrorDungeon.js');
const PullSystem      = require('./GameSystem/Pulls/PullSystem.js');
const CharacterSystem = require('./GameSystem/CharacterSystem.js');
const PartySystem     = require('./GameSystem/PartySystem.js');
const BattleSystem    = require('./GameSystem/BattleSystem.js');
const { handleGamble, handleSc, giveStarCoins } = require('./GameSystem/GamblingSystem.js');
const { handleLeaderboard, handleMonthlyLeaderboard, addXp, setLevelChannel } = require('./GameSystem/LevelSystem.js');
const { getLanguage, setLanguage, languageName, pick } = require('./GameSystem/LanguageSystem.js');
const { broadcastAnnouncement, setAnnounceChannel } = require('./GameSystem/AnnounceSystem.js');
const { handleGiveAllPlayers, handleGiveSinglePlayer } = require('./GameSystem/GiveAwaySystem.js');
const { checkSteamUpdates, checkTwitterUpdates, checkYouTubeUpdates } = require('./LimbusNewscheck.js');
const ShopSystem = require('./GameSystem/ShopSystem.js');
const { handleList } = require('./GameSystem/Pulls/ListSystem.js');
const MarriageSystem = require('./GameSystem/MarriageSystem.js');
const GiveawaySystem = require('./GameSystem/GiveawayEventSystem.js');
const MusicSystem = require('./GameSystem/MusicSystem.js');
    const AchievementSystem = require('./GameSystem/AchievementSystem.js');
    const DailyQuestSystem = require('./GameSystem/DailyQuestSystem.js');
const EngagementSystem = require('./GameSystem/EngagementSystem.js');
const ReminderSystem = require('./GameSystem/ReminderSystem.js');
const AIChatSystem = require('./GameSystem/AIChatSystem.js');

const SUPER_ADMIN_ID = '1330463890122735642';

const COOLDOWNS = new Map();
function isOnCooldown(userId, cmd, ms = 3000) {
    const key = `${userId}:${cmd}`;
    if (Date.now() - (COOLDOWNS.get(key) || 0) < ms) return true;
    COOLDOWNS.set(key, Date.now());
    return false;
}

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

async function handleSlashCommands(client, interaction) {
    const { commandName, user } = interaction;
    const uid = user.id;
    const fakeMessage = createPseudoMessage(interaction);

    try {
        // ─── 抽卡 ────────────────────────────────────────────────
        if (commandName === 'pull') {
            const pullCommand = client.commands?.get('pull');
            if (pullCommand && typeof pullCommand.execute === 'function') {
                return pullCommand.execute(interaction);
            }
            return interaction.reply({ content: '❌ 抽卡系統模組尚未成功載入。', ephemeral: true });
        }

        // ─── 背包 / 機率表 ───────────────────────────────────────
        if (commandName === 'limbuscompany_list') {
            fakeMessage.content = '!list';
            if (isOnCooldown(uid, 'limbuscompany_list', 3000)) return interaction.reply({ content: '⏳ 清單冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            return handleList(client, fakeMessage);
        }
        if (commandName === 'limbuscompany_pack') {
            fakeMessage.content = '!pack';
            if (isOnCooldown(uid, 'pack')) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return PacksAndData.handleInventory
                ? PacksAndData.handleInventory(client, fakeMessage)
                : PacksAndData(client, fakeMessage);
        }

        // ─── 戰鬥 ────────────────────────────────────────────────
        if (commandName === 'battle') {
            fakeMessage.content = '!battle';
            if (isOnCooldown(uid, 'battle', 5000)) {
                return interaction.reply({ content: '⏳ 戰鬥冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return BattleSystem.handleBattle
                ? BattleSystem.handleBattle(client, fakeMessage)
                : BattleSystem(client, fakeMessage);
        }

        // ─── 隊伍 ────────────────────────────────────────────────
        if (commandName === 'party') {
            fakeMessage.content = '!party';
            return PartySystem.handleParty
                ? PartySystem.handleParty(client, fakeMessage)
                : PartySystem(client, fakeMessage);
        }

        // ─── 罪人系統 ────────────────────────────────────────────
        if (['sinner', 'uptie', 'equip', 'threads'].includes(commandName)) {
            fakeMessage.content = `!${commandName}`;
            if (commandName === 'sinner')  return CharacterSystem.handleSinner  ? CharacterSystem.handleSinner(client, fakeMessage)  : CharacterSystem(client, fakeMessage);
            if (commandName === 'uptie')   return CharacterSystem.handleUptie   ? CharacterSystem.handleUptie(client, fakeMessage)   : CharacterSystem(client, fakeMessage);
            if (commandName === 'equip')   return CharacterSystem.handleEquip   ? CharacterSystem.handleEquip(client, fakeMessage)   : CharacterSystem(client, fakeMessage);
            if (commandName === 'threads') return CharacterSystem.handleThreads ? CharacterSystem.handleThreads(client, fakeMessage) : CharacterSystem(client, fakeMessage);
        }

        // ─── 鏡牢 ────────────────────────────────────────────────
        if (commandName === 'md') {
            fakeMessage.content = '!md';
            if (isOnCooldown(uid, 'md', 2000)) {
                return interaction.reply({ content: '⏳ 指令冷卻中，請稍後再試。', flags: MessageFlags.Ephemeral });
            }
            return MirrorDungeon.handleMirrorDungeon
                ? MirrorDungeon.handleMirrorDungeon(client, fakeMessage)
                : MirrorDungeon(client, fakeMessage);
        }

        // ─── 婚姻系統 ────────────────────────────────────────────
        if (commandName === 'marry') return MarriageSystem.handleMarry(client, interaction);
        if (commandName === 'divorce') return MarriageSystem.handleDivorce(client, interaction);

        // ─── Starcoins 經濟 ──────────────────────────────────────
        if (commandName === 'sc') {
            return handleSc(client, interaction);
        }
        if (commandName === 'gamble') {
            return handleGamble(client, interaction);
        }

        if (commandName === 'language') {
            const language = setLanguage(uid, interaction.options.getString('language'));
            return interaction.reply({ content: language === 'en' ? '✅ Language set to English.' : '✅ 語言已設定為繁體中文。', ephemeral: true });
        }

        // ─── 娛樂：男同/女同指數 ─────────────────────────────────
        if (commandName === 'gayrate') {
            const target = interaction.options.getUser('target') || user;
            let rate = Math.floor(Math.random() * 101);
            if (target.id === SUPER_ADMIN_ID) rate = 0;
            const bar = createProgressBar(rate);
            const comment = target.id === SUPER_ADMIN_ID
                ? '「主管專屬認證：鋼鐵般的絕對 0% 直男，系統數據無法改寫。」'
                : (rate < 20 ? '「數據顯示：鋼鐵般堅硬直男。」' : rate < 50 ? '「有些許隱藏屬性。」' : rate < 80 ? '「成分相當濃烈。」' : '「100% 純度純真男同！」');
            addXp(client, uid, user.username, 1, interaction.guildId, 'command').catch(() => {});
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('男同指數測試 (Gay Rate)')
                    .setColor(0x3498db)
                    .setDescription(`**${target.username}** 的男同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))]
            });
        }

        if (commandName === 'lesbianrate') {
            const target = interaction.options.getUser('target') || user;
            let rate = Math.floor(Math.random() * 101);
            if (target.id === SUPER_ADMIN_ID) rate = 0;
            const bar = createProgressBar(rate);
            const comment = target.id === SUPER_ADMIN_ID
                ? '「主管專屬認證：絕對 0% 直直到發光，姬圈屬性完全免疫。」'
                : (rate < 20 ? '「姬圈指數較低，極度純粹直女。」' : rate < 50 ? '「有些許潛質。」' : rate < 80 ? '「能量爆棚！」' : '「100% 頂級女同霸主！」');
            addXp(client, uid, user.username, 1, interaction.guildId, 'command').catch(() => {});
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('女同指數測試 (Lesbian Rate)')
                    .setColor(0xe91e63)
                    .setDescription(`**${target.username}** 的女同指數為：**${rate}%**\n\n\`[${bar}]\` ${rate}%\n\n> ${comment}`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))]
            });
        }

        // ─── 語音頻道 ────────────────────────────────────────────
        if (commandName === 'join') {
            // 讀取互動者目前所在的語音頻道（即時抓取，不用快取）
            const member = await interaction.guild.members.fetch(uid).catch(() => interaction.member);
            const voiceChannel = member?.voice?.channel;
            if (!voiceChannel) {
                return interaction.reply({ content: '❌ 你必須先加入一個語音頻道。', flags: MessageFlags.Ephemeral });
            }
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            });
            return interaction.reply({ content: `✅ 已加入語音頻道：**${voiceChannel.name}**` });
        }

        if (commandName === 'play') return MusicSystem.handlePlay(client, interaction);

        if (commandName === 'leave') {
            const connection = getVoiceConnection(interaction.guild.id);
            if (!connection) {
                return interaction.reply({ content: '❌ 機器人目前不在任何語音頻道中。', flags: MessageFlags.Ephemeral });
            }
            MusicSystem.stop(interaction.guild.id);
            connection.destroy();
            return interaction.reply({ content: '👋 已離開語音頻道並清空播放佇列。' });
        }

        if (commandName === 'status') {
            const connection = getVoiceConnection(interaction.guild.id);

            // 即時抓取機器人語音狀態（需 GuildVoiceStates intent）
            const botMember = await interaction.guild.members.fetch(client.user.id).catch(() => null);
            const botVoiceChannel = botMember?.voice?.channel;

            const voiceStatus = (connection && connection.state.status === VoiceConnectionStatus.Ready)
                ? `✅ 已連接：**${botVoiceChannel?.name || '連接中...'}**`
                : '⚪ 未連接語音頻道';

            const uptimeSec = Math.floor(client.uptime / 1000);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('🤖 Angela 系統狀態')
                    .setColor(0x2ecc71)
                    .addFields(
                        { name: '延遲',    value: `${client.ws.ping}ms`,                                                                  inline: true },
                        { name: '運行時間', value: `${Math.floor(uptimeSec / 3600)}時${Math.floor((uptimeSec % 3600) / 60)}分`,            inline: true },
                        { name: '伺服器數', value: `${client.guilds.cache.size}`,                                                          inline: true },
                        { name: '語音狀態', value: voiceStatus },
                    )
                    .setFooter({ text: 'Angela 已正常運行中' })
                    .setTimestamp()]
            });
        }

        // ─── 全伺服器公告（僅限 Sles）────────────────────────────
        if (commandName === 'announce') {
            if (uid !== SUPER_ADMIN_ID) {
                return interaction.reply({
                    content: `⛔ 此指令僅限最高主管 Sles 執行。`,
                    flags: MessageFlags.Ephemeral
                });
            }
            const messageText = interaction.options.getString('message');
            if (!messageText?.trim()) {
                return interaction.reply({ content: '❌ 請輸入公告內容。', flags: MessageFlags.Ephemeral });
            }
            return broadcastAnnouncement(client, interaction, messageText.trim());
        }

        // ─── 社群新聞手動觸發（群管理員）────────────────────────
        if (['steam', 'tweet', 'youtube'].includes(commandName)) {
            const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isGuildAdmin) {
                return interaction.reply({
                    content: '❌ 權限不足：此指令僅限伺服器管理員使用。',
                    flags: MessageFlags.Ephemeral
                });
            }
            await interaction.deferReply();
            if (commandName === 'steam')   return checkSteamUpdates(client, true, fakeMessage);
            if (commandName === 'tweet')   return checkTwitterUpdates(client, true, fakeMessage);
            if (commandName === 'youtube') return checkYouTubeUpdates(client, true, fakeMessage);
        }

        // ─── Sles 專屬特權指令 ────────────────────────────────────
        if (commandName === 'givestarcoins' || commandName === 'takelightseeds') {
            if (uid !== SUPER_ADMIN_ID) return interaction.reply({ content: '⛔ 此指令僅限 Sles 使用。', flags: MessageFlags.Ephemeral });
            const amount = interaction.options.getInteger('amount');
            const target = interaction.options.getUser('target');
            if (!target || !amount || amount <= 0) return interaction.reply({ content: '❌ 請提供目標玩家和有效數量。', flags: MessageFlags.Ephemeral });
            const player = PacksAndData.getOrCreatePlayer(null, target.id, target.username);
            if (commandName === 'givestarcoins') {
                giveStarCoins(target.id, amount, target.username);
                return interaction.reply({ content: `✅ 已給 <@${target.id}> 🌟 **${amount.toLocaleString()} Starcoins**。` });
            }
            const before = Number(player.lightSeeds) || 0;
            player.lightSeeds = Math.max(0, before - amount);
            PacksAndData.savePlayerData(null, target.id, player);
            return interaction.reply({ content: `✅ 已從 <@${target.id}> 扣除 🌱 **${Math.min(before, amount).toLocaleString()} LightSeeds**。目前餘額：🌱 **${player.lightSeeds.toLocaleString()}**。` });
        }

        if (['givelightseeds', 'givefragments', 'givescrolls', 'givethreads', 'updaterewards', 'updatebuff'].includes(commandName)) {
            if (uid !== SUPER_ADMIN_ID) {
                return interaction.reply({
                    content: `⛔ 權限被拒：此指令僅限最高主管 Sles 執行。`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const amount    = interaction.options.getInteger('amount') || 0;
            const targetUser = interaction.options.getUser('target');
            const isAll     = interaction.options.getBoolean('all') || false;

            // updaterewards / updatebuff 走前綴相容路
            if (commandName === 'updaterewards') {
                fakeMessage.content = '!updaterewards ' + amount;
                return GiveAwaySystem.handleGiveAway(client, fakeMessage);
            }
            if (commandName === 'updatebuff') {
                const mult = interaction.options.getNumber?.('multiplier') ?? amount;
                fakeMessage.content = '!updatebuff ' + mult;
                return GiveAwaySystem.handleGiveAway(client, fakeMessage);
            }

            // give 類：全服 or 單人（修復 all=true 格式錯誤）
            if (!amount || amount <= 0) {
                return interaction.reply({ content: '❌ 請輸入有效數量（必須 > 0）。', flags: MessageFlags.Ephemeral });
            }
            await interaction.deferReply();
            if (isAll) {
                return handleGiveAllPlayers(client, commandName, amount, interaction);
            }
            const actualTarget = targetUser || interaction.user;
            return handleGiveSinglePlayer(client, commandName, amount, actualTarget, interaction);
        }

        // ─── 商城 ────────────────────────────────────────────────
        if (commandName === 'shop') {
            return ShopSystem.handleShop(client, interaction);
        }
        if (['shop-add', 'shop-remove', 'shop-confirm'].includes(commandName)) {
            return ShopSystem.handleShopAdmin(interaction, commandName.slice('shop-'.length));
        }

        // ─── 抽獎 ────────────────────────────────────────────────
        if (commandName === 'giveaway-create') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ 此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
            }
            return GiveawaySystem.createGiveaway(client, interaction, {
                prizeName: interaction.options.getString('prize_name'),
                prizeInfo: interaction.options.getString('prize_info'),
                winnersCount: interaction.options.getInteger('winners'),
                maxParticipants: interaction.options.getInteger('max_participants'),
                minLevel: interaction.options.getInteger('min_level'),
                entryLightSeeds: interaction.options.getInteger('entry_lightseeds'),
                entryStarCoins: interaction.options.getInteger('entry_starcoins'),
                prizeLightSeeds: interaction.options.getInteger('prize_lightseeds'),
                prizeStarCoins: interaction.options.getInteger('prize_starcoins'),
                duration: interaction.options.getInteger('duration'),
            });
        }
        if (commandName === 'giveaway-end') {
            return GiveawaySystem.handleGiveawayEnd(client, interaction, interaction.options.getString('id'));
        }

        if (commandName === 'achievements') return AchievementSystem.handleAchievements(client, interaction);
        if (commandName === 'dailyquest') return DailyQuestSystem.handleDailyQuest(client, interaction);
        if (commandName === 'checkin') return EngagementSystem.handleCheckin(client, interaction);
        if (commandName === 'weekly') return EngagementSystem.handleWeekly(client, interaction);
        if (commandName === 'profile') return EngagementSystem.handleProfile(client, interaction);
        if (commandName === 'stats') return EngagementSystem.handleStats(client, interaction);
        if (commandName === 'voiceai') return EngagementSystem.handleVoiceAi(client, interaction);
        if (commandName === 'whoami') return AIChatSystem.handleWhoami(client, interaction);
        if (commandName === 'remind') return ReminderSystem.handleCreate(client, interaction);
        if (commandName === 'reminders') return ReminderSystem.handleList(client, interaction);

            // ─── 等級排行榜 ────────────────────────────────────────
            if (commandName === 'leaderboard') {
            return interaction.options?.getString('period') === 'month' ? handleMonthlyLeaderboard(client, interaction) : handleLeaderboard(client, interaction);
        }

        // ─── 說明 ────────────────────────────────────────────────
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

async function sendHelp(interaction) {
    const lang = getLanguage(interaction.user.id);
    const embed = new EmbedBuilder()
        .setTitle(pick(lang, '📋 Angela 指令清單', '📋 Angela commands'))
        .setColor(0x00b4d8)
        .addFields(
            { name: pick(lang, '🎰 Limbus Company', '🎰 Limbus Company'), value: pick(lang, '`/pull` — 抽卡 ｜ `/limbuscompany_pack` — 背包 ｜ `/limbuscompany_list` — 機率清單', '`/pull` — Pull ｜ `/limbuscompany_pack` — Inventory ｜ `/limbuscompany_list` — Rates and identities') },
            { name: pick(lang, '⚔️ 戰鬥與隊伍', '⚔️ Combat and party'), value: pick(lang, '`/battle` — 出戰關卡 ｜ `/party` — 隊伍管理', '`/battle` — Combat ｜ `/party` — Party setup') },
            { name: pick(lang, '👤 罪人與資源', '👤 Sinners and resources'), value: pick(lang, '`/sinner` — 罪人全覽 ｜ `/uptie` — 提升連結\n`/equip` — 裝備人格 ｜ `/threads` — 絲線查詢', '`/sinner` — Sinner index ｜ `/uptie` — Upgrade links\n`/equip` — Equip identity ｜ `/threads` — Thread count') },
            { name: pick(lang, '🪞 鏡光迷宮', '🪞 Mirror dungeon'), value: pick(lang, '`/md` — 鏡光迷宮系統', '`/md` — Mirror dungeon') },
            { name: pick(lang, '👤 玩家檔案', '👤 Player profile'), value: pick(lang, '`/profile` — 等級與稱號 ｜ `/stats` — 活動統計 ｜ `/leaderboard` — XP 排行', '`/profile` — Level and titles ｜ `/stats` — Activity summary ｜ `/leaderboard` — XP rankings') },
            { name: pick(lang, '🎰 賭博', '🎰 Gambling'), value: pick(lang, '`/gamble <金額>` — 下注 🌱 LightSeeds，50/50 勝負', '`/gamble <amount>` — Wager 🌱 LightSeeds; 50/50 odds') },
            { name: pick(lang, '🎲 娛樂功能', '🎲 Fun'), value: pick(lang, '`/gayrate` — 男同指數 ｜ `/lesbianrate` — 姬圈指數', '`/gayrate` ｜ `/lesbianrate` — For-fun compatibility meters') },
            { name: pick(lang, '🔊 語音控制', '🔊 Voice controls'), value: '`/join` ｜ `/leave` ｜ `/status`' },
            { name: pick(lang, '🏆 成長與任務', '🏆 Progress and quests'), value: pick(lang, '`/achievements` ｜ `/dailyquest` ｜ `/weekly` ｜ `/checkin`', '`/achievements` ｜ `/dailyquest` ｜ `/weekly` ｜ `/checkin`') },
            { name: '🧠 Angela AI', value: pick(lang, '`/whoami` — 回想已記住的個人事實 ｜ `/remind` — 設定提醒 ｜ `/reminders` — 查看提醒 ｜ `/voiceai` — 語音鼓勵設定', '`/whoami` — Review saved facts ｜ `/remind` — Set a reminder ｜ `/reminders` — List reminders ｜ `/voiceai` — Voice encouragement settings') },
            { name: pick(lang, '📰 社群檢測（伺服器管理員）', '📰 Community feeds (admins)'), value: pick(lang, '`/steam` ｜ `/tweet` ｜ `/youtube`\n`/setchannel` — 統一設定通知頻道', '`/steam` ｜ `/tweet` ｜ `/youtube`\n`/setchannel` — Configure notification channels') },
            { name: pick(lang, '🛒 商城與抽獎', '🛒 Shop and giveaways'), value: '`/shop` ｜ `/giveaway-create` ｜ `/giveaway-end`' },
            { name: pick(lang, '👑 最高主管特權（Sles 專屬）', '👑 Overseer tools (Sles only)'), value: '`/givelightseeds` ｜ `/givefragments` ｜ `/givescrolls`\n`/givethreads` ｜ `/updaterewards` ｜ `/updatebuff`\n`/announce`' }
        )
        .setFooter({ text: pick(lang, '輸入 / 即可喚出選單 ｜ 特權指令僅限授權管理員', 'Type / to browse commands | Privileged commands are restricted') });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
