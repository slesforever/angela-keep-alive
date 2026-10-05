'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { getLanguage, pick } = require('./LanguageSystem.js');

const PLAYERS_DIR = path.resolve(process.env.PLAYER_DATA_DIR || path.join(process.cwd(), 'data', 'players'));
const MAX_REMINDERS_PER_USER = 20;
const MAX_MESSAGE_LENGTH = 300;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiDate(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function timeParts(match) {
    const period = String(match[1] || '').toLowerCase();
    let hour = Number(match[2]);
    const minute = Number(match[3] || 0);
    const ampm = String(match[4] || '').toLowerCase();
    const hasAfternoon = /下午|晚上|中午|afternoon|evening|pm/.test(period + ampm);
    const hasMorning = /上午|早上|morning|am/.test(period + ampm);
    if (ampm.includes('pm') || /下午|晚上|afternoon|evening/.test(period)) {
        if (hour < 12) hour += 12;
    } else if (ampm.includes('am') || /上午|早上|morning/.test(period)) {
        if (hour === 12) hour = 0;
    } else if (!hasMorning && !hasAfternoon && hour > 0 && hour <= 6) {
        // Common conversational "tomorrow at 3" means 3pm; explicit 24-hour times stay unchanged.
        hour += 12;
    }
    return { hour, minute };
}

function localTaipeiDateToTimestamp(date, hour, minute) {
    const dateMatch = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day) return null;
    const value = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);
    return Number.isFinite(value) ? value : null;
}

function parseWhen(input, now = new Date()) {
    const value = String(input || '').trim();
    if (!value) return null;

    let match = value.match(/(?:in\s*)?(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\s*(?:later|from now)?/i);
    if (match) {
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        const multiplier = unit.startsWith('m') ? 60_000 : unit.startsWith('h') ? 3_600_000 : 86_400_000;
        if (amount > 0 && amount <= 365 * 24 * 60) return now.getTime() + amount * multiplier;
    }
    match = value.match(/(\d+)\s*(分鐘|分|小時|小时|時|天|日)\s*(?:後|以后|以後)/);
    if (match) {
        const amount = Number(match[1]);
        const unit = match[2];
        const multiplier = /分鐘|分/.test(unit) ? 60_000 : /小時|小时|時/.test(unit) ? 3_600_000 : 86_400_000;
        if (amount > 0 && amount <= 365 * 24 * 60) return now.getTime() + amount * multiplier;
    }

    match = value.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (match) {
        const timestamp = localTaipeiDateToTimestamp(match[1], Number(match[2] || 9), Number(match[3] || 0));
        return timestamp;
    }

    const dayMatch = value.match(/明天|後天|后天|tomorrow|tonight|今天|today/i);
    const timeMatch = value.match(/(上午|早上|下午|晚上|中午|morning|afternoon|evening)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:點|点|時|时)?/i);
    if (!dayMatch || !timeMatch) return null;
    const { hour, minute } = timeParts(timeMatch);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const baseDate = taipeiDate(now);
    let days = 0;
    const dayToken = dayMatch[0].toLowerCase();
    if (dayToken === '明天' || dayToken === 'tomorrow') days = 1;
    else if (dayToken === '後天' || dayToken === '后天') days = 2;
    const date = new Date(`${baseDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    const targetDate = date.toISOString().slice(0, 10);
    let timestamp = localTaipeiDateToTimestamp(targetDate, hour, minute);
    if (dayToken === 'tonight' && timestamp <= now.getTime()) {
        const tomorrow = new Date(`${targetDate}T00:00:00Z`);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        timestamp = localTaipeiDateToTimestamp(tomorrow.toISOString().slice(0, 10), hour, minute);
    }
    return timestamp;
}

function findTimeExpression(text) {
    const patterns = [
        /(?:(?:in\s+)?\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)(?:\s*(?:later|from now))?)/i,
        /\d+\s*(?:分鐘|分|小時|小时|時|天|日)\s*(?:後|以后|以後)/,
        /\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/,
        /(?:明天|後天|后天|tomorrow|tonight|今天|today)(?:\s*(?:at|@)?\s*(?:(?:上午|早上|下午|晚上|中午|morning|afternoon|evening)\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:點|点|時|时)?)/i,
    ];
    const found = patterns
        .map(pattern => {
            const match = pattern.exec(text);
            return match ? { text: match[0], index: match.index } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.index - b.index)[0];
    return found;
}

function parseNaturalReminder(text, now = new Date()) {
    const source = String(text || '').trim();
    if (!/(提醒我|remind\s+me)/i.test(source)) return null;
    const time = findTimeExpression(source);
    if (!time) return null;
    const dueAt = parseWhen(time.text, now);
    if (!dueAt) return null;

    let reminderText = source
        .replace(/please\s+/ig, '')
        .replace(/remind\s+me/ig, '')
        .replace(/提醒我/g, '')
        .replace(time.text, '')
        .replace(/^\s*(?:to|about|在|幫我|帮我)\s*/i, '')
        .replace(/\s*(?:at|on|in)\s*$/i, '')
        .replace(/^[,，:：\s]+|[,，:：\s]+$/g, '')
        .trim();
    if (!reminderText || reminderText.length < 2) return null;
    return { dueAt, text: reminderText.slice(0, MAX_MESSAGE_LENGTH) };
}

function getReminderState(player) {
    if (!Array.isArray(player.reminders)) player.reminders = [];
    return player.reminders;
}

function createReminder(client, userId, username, guildId, channelId, dueAt, text) {
    const player = getOrCreatePlayer(client, userId, username);
    const reminders = getReminderState(player);
    const message = String(text || '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) return { ok: false, reason: 'message' };
    if (reminders.length >= MAX_REMINDERS_PER_USER) {
        return { ok: false, reason: 'limit' };
    }
    if (!Number.isFinite(dueAt) || dueAt <= Date.now() || dueAt > Date.now() + 365 * 86_400_000) {
        return { ok: false, reason: 'time' };
    }
    const reminder = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        dueAt,
        text: message,
        guildId: guildId || null,
        channelId: channelId || null,
        attempts: 0,
    };
    reminders.push(reminder);
    savePlayerData(client, userId, player);
    return { ok: true, reminder };
}

function formatDue(timestamp, lang) {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-TW', {
        timeZone: 'Asia/Taipei',
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(timestamp));
}

async function handleCreate(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const whenText = interaction.options.getString('when');
    const reminderText = interaction.options.getString('message');
    const dueAt = parseWhen(whenText);
    if (!dueAt || dueAt <= Date.now() + 30_000) {
        return interaction.reply({
            content: pick(lang,
                '我看不懂這個時間，或時間太近。可用「明天 15:00」、「3 小時後」或「2026-10-12 15:00」（台北時間）。',
                'I could not parse that time, or it is too soon. Try “tomorrow at 3pm”, “in 3 hours”, or “2026-10-12 15:00” (Taipei time).'),
            flags: MessageFlags.Ephemeral,
        });
    }
    const result = createReminder(client, interaction.user.id, interaction.user.username, interaction.guildId, interaction.channelId, dueAt, reminderText);
    if (!result.ok) {
        return interaction.reply({
            content: pick(lang,
                result.reason === 'limit' ? '你最多可以有 20 個未完成提醒。' : result.reason === 'message' ? '請填寫提醒內容。' : '提醒時間必須在現在之後、未來一年之內。',
                result.reason === 'limit' ? 'You can have up to 20 pending reminders.' : result.reason === 'message' ? 'Please enter a reminder message.' : 'The reminder must be in the future and within one year.'),
            flags: MessageFlags.Ephemeral,
        });
    }
    return interaction.reply({
        content: pick(lang,
            `好，我會在 **${formatDue(dueAt, lang)}** 提醒你：${result.reminder.text}`,
            `I’ll remind you at **${formatDue(dueAt, lang)}**: ${result.reminder.text}`),
        flags: MessageFlags.Ephemeral,
    });
}

async function handleList(client, interaction) {
    const lang = getLanguage(interaction.user.id);
    const player = getOrCreatePlayer(client, interaction.user.id, interaction.user.username);
    const reminders = getReminderState(player).sort((a, b) => a.dueAt - b.dueAt);
    if (!reminders.length) {
        return interaction.reply({ content: pick(lang, '目前沒有未完成的提醒。', 'You have no pending reminders.'), flags: MessageFlags.Ephemeral });
    }
    const lines = reminders.slice(0, 15).map(item =>
        `${Number(item.attempts) > 0 ? `⚠️ ${pick(lang, `投遞重試 ${item.attempts} 次`, `Delivery retry ${item.attempts}`)} · ` : ''}\`${formatDue(item.dueAt, lang)}\` — ${item.text}`
    );
    if (reminders.length > 15) lines.push(pick(lang, `另有 ${reminders.length - 15} 項提醒`, `+${reminders.length - 15} more reminders`));
    const embed = new EmbedBuilder()
        .setColor(0x5b8def)
        .setTitle(pick(lang, '⏰ 你的提醒', '⏰ Your reminders'))
        .setDescription(lines.join('\n').slice(0, 4000));
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleNaturalMessage(client, message) {
    const lang = getLanguage(message.author.id);
    const source = message.content || '';
    const parsed = parseNaturalReminder(source);
    if (!parsed) {
        if (!/(提醒我|remind\s+me)/i.test(source)) return false;
        await message.reply({
            content: pick(lang,
                '我抓不到清楚的時間或提醒內容。試試「明天 15:00 提醒我喝水」或「3 小時後提醒我開會」。',
                'I could not identify a clear time and reminder. Try “remind me to call home tomorrow at 3pm” or “remind me in 3 hours to join the meeting”.'),
            allowedMentions: { repliedUser: false },
        }).catch(() => {});
        return true;
    }
    const result = createReminder(client, message.author.id, message.author.username, message.guild.id, message.channelId, parsed.dueAt, parsed.text);
    if (!result.ok) {
        const reply = result.reason === 'limit'
            ? pick(lang, '你的未完成提醒已達 20 個上限，先完成幾個再新增。', 'You already have 20 pending reminders; clear a few before adding another.')
            : pick(lang, '這個提醒時間無效。試試「明天 15:00 提醒我喝水」或「remind me to call home tomorrow at 3pm」。', 'I could not parse that reminder. Try “remind me to call home tomorrow at 3pm”.');
        await message.reply({ content: reply, allowedMentions: { repliedUser: false } }).catch(() => {});
        return true;
    }
    await message.reply({
        content: pick(lang,
            `收到，我會在 **${formatDue(parsed.dueAt, lang)}** 提醒你：${parsed.text}`,
            `Got it—I’ll remind you at **${formatDue(parsed.dueAt, lang)}**: ${parsed.text}`),
        allowedMentions: { repliedUser: false },
    }).catch(() => {});
    return true;
}

async function deliverDue(client) {
    let files;
    try {
        fs.mkdirSync(PLAYERS_DIR, { recursive: true });
        files = fs.readdirSync(PLAYERS_DIR).filter(file => file.endsWith('.json'));
    } catch (error) {
        console.error('[ReminderSystem] 無法讀取玩家資料:', error.message);
        return;
    }
    for (const file of files) {
        const userId = file.slice(0, -5);
        const player = getOrCreatePlayer(client, userId, 'Player');
        const reminders = getReminderState(player);
        const due = reminders.filter(item => Number(item.dueAt) <= Date.now());
        if (!due.length) continue;
        for (const reminder of due) {
            const content = `<@${userId}> ⏰ ${reminder.text}`;
            let sent = false;
            try {
                const channel = reminder.channelId
                    ? await client.channels.fetch(reminder.channelId).catch(() => null)
                    : null;
                if (channel?.isTextBased?.()) {
                    await channel.send({ content, allowedMentions: { users: [userId] } });
                    sent = true;
                }
            } catch (error) {
                console.warn('[ReminderSystem] 頻道提醒傳送失敗:', error.message);
            }
            if (!sent) {
                try {
                    const user = await client.users.fetch(userId);
                    await user.send(`⏰ ${reminder.text}`);
                    sent = true;
                } catch {}
            }
            if (sent) {
                player.reminders = player.reminders.filter(item => item.id !== reminder.id);
            } else {
                reminder.attempts = (Number(reminder.attempts) || 0) + 1;
                reminder.dueAt = Date.now() + (reminder.attempts >= 5 ? 6 * 60 * 60_000 : reminder.attempts * 60_000);
                if (reminder.attempts >= 5) {
                    reminder.attempts = 5;
                    console.warn(`[ReminderSystem] 提醒 ${reminder.id} 多次投遞失敗，將每 6 小時重試並保留在玩家提醒清單。`);
                }
            }
        }
        savePlayerData(client, userId, player);
    }
}

function init(client) {
    client.once('ready', () => {
        deliverDue(client).catch(error => console.error('[ReminderSystem] 啟動補送失敗:', error.message));
        if (globalThis.__ANGELA_REMINDER_TIMER__) clearInterval(globalThis.__ANGELA_REMINDER_TIMER__);
        globalThis.__ANGELA_REMINDER_TIMER__ = setInterval(
            () => deliverDue(client).catch(error => console.error('[ReminderSystem] 提醒排程失敗:', error.message)),
            15_000,
        );
    });
}

module.exports = {
    parseWhen,
    parseNaturalReminder,
    createReminder,
    handleCreate,
    handleList,
    handleNaturalMessage,
    deliverDue,
    init,
};