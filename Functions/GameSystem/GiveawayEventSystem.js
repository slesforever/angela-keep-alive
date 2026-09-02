// Functions/GameSystem/GiveawayEventSystem.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLevelFromXp } = require('./LevelSystem.js');

const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_PATH = path.join(DATA_DIR, 'giveaway-events.json');
const timers = new Map();

function readEvents() {
    try {
        if (fs.existsSync(EVENTS_PATH)) {
            const value = JSON.parse(fs.readFileSync(EVENTS_PATH, 'utf8'));
            return Array.isArray(value) ? value : [];
        }
    } catch (err) { console.error('[Giveaway] 讀取活動失敗:', err.message); }
    return [];
}

function saveEvents(events, client = null) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${EVENTS_PATH}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(events, null, 2), 'utf8');
    fs.renameSync(temp, EVENTS_PATH);
}

function costText(event) {
    const result = [];
    if (event.entryLightSeeds > 0) result.push(`🌱 ${event.entryLightSeeds.toLocaleString()}`);
    if (event.entryStarCoins > 0) result.push(`⭐ ${event.entryStarCoins.toLocaleString()}`);
    return result.length ? result.join(' + ') : '免費';
}

function prizeText(event) {
    const result = [];
    if (event.prizeLightSeeds > 0) result.push(`🌱 LightSeeds ×${event.prizeLightSeeds.toLocaleString()}`);
    if (event.prizeStarCoins > 0) result.push(`⭐ StarCoins ×${event.prizeStarCoins.toLocaleString()}`);
    return result.join(' + ') || '由 Sles 手動交付';
}

function eventEmbed(event, finished = false) {
    const requirements = [];
    if (event.maxParticipants > 0) requirements.push(`最多 ${event.maxParticipants} 人`);
    if (event.minLevel > 0) requirements.push(`Lv.${event.minLevel}+`);
    if (event.entryLightSeeds > 0 || event.entryStarCoins > 0) requirements.push(`參加費：${costText(event)}`);
    if (!requirements.length) requirements.push('無額外限制');

    return new EmbedBuilder()
        .setTitle(`${finished ? '🎉 抽獎結束' : '🎁 抽獎活動'}｜${event.prizeName}`)
        .setColor(finished ? 0x95a5a6 : 0xe91e63)
        .setDescription([
            event.prizeInfo ? `**獎品資訊：** ${event.prizeInfo}` : null,
            `**獎品：** ${prizeText(event)}`,
            `**得獎人數：** ${event.winnersCount}`,
            `**目前參加：** ${event.participants.length}${event.maxParticipants > 0 ? ` / ${event.maxParticipants}` : ''}`,
            ...requirements.map(text => `**條件：** ${text}`),
            finished ? null : `**截止：** <t:${Math.floor(event.endsAt / 1000)}:R>`,
        ].filter(Boolean).join('\n'))
        .setFooter({ text: finished ? '感謝參加' : '按下下方按鈕參加抽獎｜每人只能參加一次' })
        .setTimestamp();
}

function eventButtons(event, disabled = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveaway_join:${event.id}`)
            .setLabel(`參加抽獎（${event.participants.length}${event.maxParticipants ? `/${event.maxParticipants}` : ''}）`)
            .setEmoji('🎟️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
    )];
}

function findEvent(id) { return readEvents().find(event => event.id === id); }

async function createGiveaway(client, interaction, options) {
    const durationMinutes = options.duration || 60;
    const event = {
        id: `draw-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        prizeName: options.prizeName,
        prizeInfo: options.prizeInfo || '',
        winnersCount: options.winnersCount,
        maxParticipants: options.maxParticipants || 0,
        minLevel: options.minLevel || 0,
        entryLightSeeds: options.entryLightSeeds || 0,
        entryStarCoins: options.entryStarCoins || 0,
        prizeLightSeeds: options.prizeLightSeeds || 0,
        prizeStarCoins: options.prizeStarCoins || 0,
        participants: [],
        createdBy: interaction.user.id,
        createdAt: Date.now(),
        endsAt: Date.now() + durationMinutes * 60_000,
        status: 'active',
        messageId: null,
    };
    const response = await interaction.reply({
        embeds: [eventEmbed(event)],
        components: eventButtons(event),
        fetchReply: true,
    });
    event.messageId = response.id;
    const events = readEvents();
    events.push(event);
    saveEvents(events, client);
    scheduleGiveaway(client, event);
    return response;
}

async function joinGiveaway(client, interaction, eventId) {
    const events = readEvents();
    const event = events.find(entry => entry.id === eventId);
    if (!event || event.status !== 'active') return interaction.reply({ content: '❌ 這個抽獎已結束。', ephemeral: true });
    if (Date.now() >= event.endsAt) {
        await finishGiveaway(client, eventId);
        return interaction.reply({ content: '❌ 抽獎剛好已截止。', ephemeral: true });
    }
    if (event.participants.includes(interaction.user.id)) return interaction.reply({ content: '⚠️ 你已經參加過這次抽獎了。', ephemeral: true });
    if (event.maxParticipants > 0 && event.participants.length >= event.maxParticipants) return interaction.reply({ content: '❌ 參加人數已額滿。', ephemeral: true });

    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const level = getLevelFromXp(player.xp || 0).level;
    if (level < event.minLevel) return interaction.reply({ content: `❌ 等級不足，需要 Lv.${event.minLevel}，你目前是 Lv.${level}。`, ephemeral: true });
    if ((player.lightSeeds || 0) < event.entryLightSeeds || (player.starCoins || 0) < event.entryStarCoins) {
        return interaction.reply({ content: `❌ 參加費不足，需要 ${costText(event)}。`, ephemeral: true });
    }

    player.lightSeeds = (player.lightSeeds || 0) - event.entryLightSeeds;
    player.starCoins = (player.starCoins || 0) - event.entryStarCoins;
    savePlayerData(client, interaction.user.id, player);
    event.participants.push(interaction.user.id);
    saveEvents(events, client);

    await interaction.update({ embeds: [eventEmbed(event)], components: eventButtons(event) });
}

async function finishGiveaway(client, eventId) {
    const events = readEvents();
    const event = events.find(entry => entry.id === eventId);
    if (!event || event.status !== 'active') return null;
    event.status = 'finished';
    event.finishedAt = Date.now();
    const shuffled = [...event.participants];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    event.winners = shuffled.slice(0, Math.min(event.winnersCount, shuffled.length));
    saveEvents(events, client);
    if (timers.has(eventId)) clearTimeout(timers.get(eventId));
    timers.delete(eventId);

    for (const userId of event.winners) {
        const player = getOrCreatePlayer(client, userId, 'Player');
        player.lightSeeds = (player.lightSeeds || 0) + event.prizeLightSeeds;
        player.starCoins = (player.starCoins || 0) + event.prizeStarCoins;
        savePlayerData(client, userId, player);
    }

    const channel = await client.channels.fetch(event.channelId).catch(() => null);
    if (channel) {
        const winnerText = event.winners.length
            ? event.winners.map((id, index) => `${index + 1}. <@${id}>`).join('\n')
            : '沒有符合資格的參加者。';
        const resultEmbed = eventEmbed(event, true).addFields(
            { name: '得獎者', value: winnerText },
            { name: '已自動發放', value: prizeText(event) },
        );
        const finishedPayload = {
            embeds: [resultEmbed],
            components: eventButtons(event, true),
        };
        // 優先更新原抽獎訊息，避免留下仍可按的假按鈕。
        const original = event.messageId
            ? await channel.messages?.fetch(event.messageId).catch(() => null)
            : null;
        if (original) {
            await original.edit(finishedPayload).catch(() => {});
            if (event.winners.length) {
                await channel.send({
                    content: `🎉 恭喜 ${event.winners.map(id => `<@${id}>`).join(' ')}`,
                    allowedMentions: { users: event.winners },
                }).catch(() => {});
            }
        } else {
            await channel.send({
                content: event.winners.length ? `🎉 恭喜 ${event.winners.map(id => `<@${id}>`).join(' ')}` : undefined,
                ...finishedPayload,
                allowedMentions: { users: event.winners },
            }).catch(() => {});
        }
    }
    return event;
}

async function handleGiveawayEnd(client, interaction, eventId) {
    const event = findEvent(eventId);
    if (!event) return interaction.reply({ content: '❌ 找不到這個抽獎 ID。', ephemeral: true });
    if (event.guildId !== interaction.guildId || !interaction.memberPermissions?.has('Administrator')) {
        return interaction.reply({ content: '❌ 只有本伺服器管理員能提前結束這個抽獎。', ephemeral: true });
    }
    const finished = await finishGiveaway(client, eventId);
    return interaction.reply({ content: finished ? `✅ 抽獎已結束：\`${eventId}\`` : '❌ 抽獎已經結束。', ephemeral: true });
}

function scheduleGiveaway(client, event) {
    if (event.status !== 'active') return;
    const delay = Math.max(1000, event.endsAt - Date.now());
    if (timers.has(event.id)) clearTimeout(timers.get(event.id));
    timers.set(event.id, setTimeout(() => finishGiveaway(client, event.id).catch(console.error), delay));
}

function resumeGiveaways(client) {
    for (const event of readEvents().filter(entry => entry.status === 'active')) {
        if (Date.now() >= event.endsAt) finishGiveaway(client, event.id).catch(console.error);
        else scheduleGiveaway(client, event);
    }
}

module.exports = {
    createGiveaway,
    joinGiveaway,
    handleGiveawayEnd,
    resumeGiveaways,
};
