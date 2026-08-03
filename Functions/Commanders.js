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
const { handleGamble }       = require('./GameSystem/GamblingSystem.js');
const { handleRank, setLevelChannel } = require('./GameSystem/LevelSystem.js');
const { broadcastAnnouncement, setAnnounceChannel } = require('./GameSystem/AnnounceSystem.js');
const { checkSteamUpdates, checkTwitterUpdates, checkYouTubeUpdates } = require('./Newscheck.js');

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
        if (commandName === 'pack' || commandName === 'list') {
            fakeMessage.content = `!${commandName}`;
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

        // ─── 等級排名 ────────────────────────────────────────────
        if (commandName === 'rank') {
            return handleRank(client, interaction);
        }

        // ─── 賭博 ────────────────────────────────────────────────
        if (commandName === 'gamble') {
            return handleGamble(client, interaction);
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

        if (commandName === 'leave') {
            const connection = getVoiceConnection(interaction.guild.id);
            if (!connection) {
                return interaction.reply({ content: '❌ 機器人目前不在任何語音頻道中。', flags: MessageFlags.Ephemeral });
            }
            connection.destroy();
            return interaction.reply({ content: '👋 已離開語音頻道。' });
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

        // ─── 設定升級公告頻道（伺服器管理員）────────────────────
        if (commandName === 'setlevelchannel') {
            const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isGuildAdmin) {
                return interaction.reply({ content: '❌ 此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
            }
            const targetChannel = interaction.options.getChannel('channel');
            setLevelChannel(interaction.guild.id, targetChannel.id);
            return interaction.reply({ content: `✅ 升級公告頻道已設定至 ${targetChannel}。`, flags: MessageFlags.Ephemeral });
        }

        // ─── 設定公告接收頻道（伺服器管理員）────────────────────
        if (commandName === 'setannouncechannel') {
            const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
            if (!isGuildAdmin) {
                return interaction.reply({ content: '❌ 此指令僅限伺服器管理員使用。', flags: MessageFlags.Ephemeral });
            }
            const targetChannel = interaction.options.getChannel('channel');
            setAnnounceChannel(interaction.guild.id, targetChannel.id);
            return interaction.reply({
                content: `✅ 公告接收頻道已設定至 ${targetChannel}。\nSles 發布公告時，訊息將傳送至此頻道。`,
                flags: MessageFlags.Ephemeral
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

            if (['givelightseeds', 'givefragments', 'givescrolls', 'givethreads'].includes(commandName)) {
                let targetArg = isAll ? 'all' : (targetUser ? `<@${targetUser.id}>` : `<@${uid}>`);
                fakeMessage.content = `!${commandName} ${targetArg} ${amount}`;
                fakeMessage.mentions = {
                    users: {
                        first: () => isAll ? null : (targetUser || interaction.user)
                    }
                };
            } else {
                fakeMessage.content = `!${commandName} ${amount}`.trim();
            }

            return GiveAwaySystem.handleGiveAway
                ? GiveAwaySystem.handleGiveAway(client, fakeMessage)
                : GiveAwaySystem(client, fakeMessage);
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
    const embed = new EmbedBuilder()
        .setTitle('📋 Angela 指令清單')
        .setColor(0x00b4d8)
        .addFields(
            { name: '🎰 抽卡與背包',        value: '`/pull` — 抽卡 ｜ `/pack` — 背包 ｜ `/list` — 機率表' },
            { name: '⚔️ 戰鬥與隊伍',        value: '`/battle` — 出戰關卡 ｜ `/party` — 隊伍管理' },
            { name: '👤 罪人與資源',          value: '`/sinner` — 罪人全覽 ｜ `/uptie` — 提升連結\n`/equip` — 裝備人格 ｜ `/threads` — 絲線查詢' },
            { name: '🪞 鏡光迷宮',           value: '`/md` — 鏡光迷宮系統' },
            { name: '📊 等級系統',           value: '`/rank` — 查看等級與 XP 進度' },
            { name: '🎰 賭博',              value: '`/gamble <金額>` — 下注 🌱 LightSeeds，50/50 勝負' },
            { name: '🎲 娛樂功能',           value: '`/gayrate` — 男同指數 ｜ `/lesbianrate` — 姬圈指數' },
            { name: '🔊 語音控制',           value: '`/join` ｜ `/leave` ｜ `/status`' },
            { name: '📰 社群檢測 (伺服器管理員)', value: '`/steam` ｜ `/tweet` ｜ `/youtube` ｜ `/setchannel`\n`/setlevelchannel` — 升級公告頻道\n`/setannouncechannel` — 接收 Sles 公告頻道' },
            { name: '👑 最高主管特權 (Sles 專屬)', value: '`/givelightseeds` ｜ `/givefragments` ｜ `/givescrolls`\n`/givethreads` ｜ `/updaterewards` ｜ `/updatebuff`\n`/announce` — 全伺服器公告' }
        )
        .setFooter({ text: '輸入 / 即可喚出選單 ｜ 所有特權指令已鎖定為 Sles 專屬' });

    return interaction.reply({ embeds: [embed] });
}

module.exports = { handleCommands: handleSlashCommands };
