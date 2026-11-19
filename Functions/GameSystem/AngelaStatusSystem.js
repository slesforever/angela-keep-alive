// Functions/GameSystem/AngelaStatusSystem.js
// Angela's Discord status: idle presence with randomly rotating dialogue.
'use strict';
const { ActivityType } = require('discord.js');

const STATUS_LINES = {
    daily: [
        "Oh, you're still here?",
        "I see. So that's what happened.",
        "Well, I suppose that's one way to do it.",
        'Is there something you wanted to tell me?',
        'I was just about to take a break.',
        'You seem to be enjoying yourself.',
        'I wonder what Roland is doing right now.'
    ],
    librarian: [
        "Please, there's no need to rush.",
        "I'm afraid I can't help you with that.",
        'You may stay as long as you wish.',
        "I hope you understand what you're getting yourself into.",
        'Well then, shall we begin?',
        "I'm sure you'll find something interesting here."
    ],
    impatient: [
        'Must you make such a fuss over everything?',
        "I've already explained this once.",
        'Honestly, what am I supposed to do with you?',
        "I didn't ask for an explanation.",
        'Could you please be a little more considerate?'
    ],
    server: [
        'I leave you alone for a moment, and this happens?',
        "I see things haven't changed much around here.",
        'You people really are quite something.',
        'I was hoping for a quiet day. How unfortunate.',
        'Should I even ask what happened?'
    ],
    angela: [
        'After all this time, I still find humans rather interesting.',
        'I wonder if every guest has a story worth reading.',
        "Well, I suppose I'll have to see this through.",
        "There's no point in dwelling on things that cannot be changed.",
        'For now, let us simply enjoy the moment.'
    ]
};

const ALL_STATUS_LINES = Object.values(STATUS_LINES).flat();
let previousLine = null;

function pickLine() {
    const availableLines = previousLine
        ? ALL_STATUS_LINES.filter(line => line !== previousLine)
        : ALL_STATUS_LINES;
    const line = availableLines[Math.floor(Math.random() * availableLines.length)];
    previousLine = line;
    return line;
}

function applyPresence(client) {
    const state = pickLine();
    try {
        client.user.setPresence({
            status: 'idle',
            activities: [
                { name: 'customstatus', type: ActivityType.Custom, state }
            ]
        });
        console.log(`[AngelaStatus] Random dialogue updated: ${state}`);
    } catch (e) {
        console.error('[AngelaStatus] Failed to update status:', e.message);
    }
}

let timer = null;

function start(client, intervalMs = 600000) {
    if (timer) clearInterval(timer);
    applyPresence(client);
    timer = setInterval(() => applyPresence(client), intervalMs);
    console.log(`[AngelaStatus] Random dialogue rotation started; updates every ${Math.round(intervalMs / 60000)} minute(s).`);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, applyPresence, pickLine, STATUS_LINES };
