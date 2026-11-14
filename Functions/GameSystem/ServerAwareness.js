'use strict';

const { EmbedBuilder } = require('discord.js');

const MAX_CHANNEL_HISTORY = 50;
const VOICE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

const channelLog = new Map();
const voiceLog = new Map();
const memberActivity = new Map();

function logMessage(message) {
    if (!message?.guild || message.author?.bot) return;
    const guildId = message.guild.id;
    if (!channelLog.has(guildId)) channelLog.set(guildId, []);
    const log = channelLog.get(guildId);
    log.push({
        channelId: message.channelId,
        channelName: message.channel?.name || 'unknown',
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.username,
        content: (message.content || '').slice(0, 200),
        timestamp: Date.now(),
    });
    if (log.length > MAX_CHANNEL_HISTORY) log.splice(0, log.length - MAX_CHANNEL_HISTORY);

    const key = guildId + ':' + message.author.id;
    memberActivity.set(key, { lastActive: Date.now(), type: 'chat' });
}

function logVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;
    const userId = newState.member?.user?.id || oldState.member?.user?.id;
    if (!userId || newState.member?.user?.bot) return;

    if (!voiceLog.has(guildId)) voiceLog.set(guildId, new Map());
    const guildVoice = voiceLog.get(guildId);

    const joinedChannel = newState.channelId;
    const leftChannel = oldState.channelId;

    if (!leftChannel && joinedChannel) {
        const channel = newState.channel;
        guildVoice.set(userId, {
            channelId: joinedChannel,
            channelName: channel?.name || 'unknown',
            joinedAt: Date.now(),
        });
        const key = guildId + ':' + userId;
        memberActivity.set(key, { lastActive: Date.now(), type: 'voice' });
    } else if (leftChannel && !joinedChannel) {
        guildVoice.delete(userId);
    } else if (leftChannel && joinedChannel && leftChannel !== joinedChannel) {
        const channel = newState.channel;
        guildVoice.set(userId, {
            channelId: joinedChannel,
            channelName: channel?.name || 'unknown',
            joinedAt: Date.now(),
        });
        const key = guildId + ':' + userId;
        memberActivity.set(key, { lastActive: Date.now(), type: 'voice' });
    }
}

function getServerSnapshot(guild) {
    if (!guild) return null;
    const guildId = guild.id;

    const messages = (channelLog.get(guildId) || []).slice(-20).reverse();
    const voiceMap = voiceLog.get(guildId) || new Map();
    const now = Date.now();

    const voiceUsers = [];
    for (const [userId, info] of voiceMap.entries()) {
        if (now - info.joinedAt > VOICE_TIMEOUT_MS) {
            voiceMap.delete(userId);
            continue;
        }
        const duration = Math.floor((now - info.joinedAt) / 1000);
        const hours = Math.floor(duration / 3600);
        const mins = Math.floor((duration % 3600) / 60);
        const member = guild.members.cache.get(userId);
        voiceUsers.push({
            userId,
            name: member?.displayName || info.channelName,
            channelName: info.channelName,
            durationText: hours > 0 ? `${hours}小時${mins}分` : `${mins}分鐘`,
        });
    }

    const channelActivity = {};
    for (const msg of messages) {
        if (!channelActivity[msg.channelName]) channelActivity[msg.channelName] = 0;
        channelActivity[msg.channelName]++;
    }
    const activeChannels = Object.entries(channelActivity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    return { messages, voiceUsers, activeChannels };
}

async function handleWhatsUp(client, interaction) {
    const guild = interaction.guild;
    if (!guild) {
        return interaction.reply({ content: '這個指令只能在伺服器裡用喔。', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
        await guild.members.fetch({ force: true }).catch(() => {});
    } catch {}

    const snapshot = getServerSnapshot(guild);
    if (!snapshot) {
        return interaction.editReply({ content: '沒辦法拿到伺服器資訊，再試一次看看？' });
    }

    const lines = [];

    if (snapshot.voiceUsers.length > 0) {
        lines.push('**語音頻道現況**');
        for (const v of snapshot.voiceUsers.slice(0, 10)) {
            lines.push(`> ${v.name} 在 **${v.channelName}** — 已經待了 ${v.durationText}`);
        }
        lines.push('');
    } else {
        lines.push('**語音頻道現況**');
        lines.push('> 現在沒有人在語音頻道裡');
        lines.push('');
    }

    if (snapshot.messages.length > 0) {
        lines.push('**最近聊天動態**');
        const seen = new Set();
        for (const msg of snapshot.messages.slice(0, 10)) {
            const key = msg.channelName + ':' + msg.authorName;
            if (seen.has(key)) continue;
            seen.add(key);
            const preview = msg.content.slice(0, 60) || '(非文字訊息)';
            lines.push(`> ${msg.authorName} 在 #${msg.channelName}: ${preview}`);
        }
        lines.push('');
    } else {
        lines.push('**最近聊天動態**');
        lines.push('> 最近沒什麼人聊天呢');
        lines.push('');
    }

    if (snapshot.activeChannels.length > 0) {
        lines.push('**最熱鬧的頻道**');
        for (const ch of snapshot.activeChannels) {
            lines.push(`> #${ch.name} — ${ch.count} 則訊息`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('伺服器近況')
        .setColor(0x00b4d8)
        .setDescription(lines.join('\n'))
        .setFooter({ text: '資料為即時快照，僅供參考' })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

module.exports = {
    logMessage,
    logVoiceStateUpdate,
    getServerSnapshot,
    handleWhatsUp,
};
