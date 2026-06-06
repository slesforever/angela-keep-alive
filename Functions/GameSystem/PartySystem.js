// Functions/GameSystem/PartySystem.js
'use strict';

const { EmbedBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES } = require('./Data/SinnersData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const MAX_PARTY = 6;

function cleanName(name) {
    return String(name || '')
        .trim()
        .replace(/^["'「『【\[]|["'」』】\]]$/g, '')
        .trim();
}

function inferSinnerKey(name) {
    const text = cleanName(name);
    if (!text) return null;
    if (SINNERS[text]) return text;
    return SINNER_NAMES.find(n => text.includes(n)) || null;
}

function calcHP(sinner, player, sinnerName) {
    const lv = player.identityLevels?.[`LCB ${sinnerName}`] || player.identityLevels?.[sinnerName] || 1;
    const uptie = player.sinners?.[sinnerName]?.uptie || 1;
    return sinner.hp + (lv - 1) * 3 + (uptie - 1) * 5;
}

function getEquippedIdentity(player, sinnerName) {
    return player.sinners?.[sinnerName]?.equippedIdentity || `LCB ${sinnerName}`;
}

async function handleParty(client, message) {
    const args = message.content.trim().split(/\s+/);
    const sub = args[1];

    if (sub === 'add' || sub === '加入') {
        return addToParty(client, message, cleanName(args.slice(2).join(' ')));
    }

    if (sub === 'remove' || sub === '移除') {
        return removeFromParty(client, message, cleanName(args.slice(2).join(' ')));
    }

    if (sub === 'set' || sub === '設定') {
        const raw = args.slice(2).join(' ');
        const names = raw.split(/[,，]/).map(cleanName).filter(Boolean);
        return setParty(client, message, names);
    }

    return showParty(client, message);
}

async function showParty(client, message) {
    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const party = Array.isArray(player.party) ? player.party : [];
    const valid = party.map(inferSinnerKey).filter(Boolean);

    const lines = valid.map((sinnerName, i) => {
        const s = SINNERS[sinnerName];
        const hp = calcHP(s, player, sinnerName);
        const ut = player.sinners?.[sinnerName]?.uptie || 1;
        const identity = getEquippedIdentity(player, sinnerName);
        return `${i + 1}. **${sinnerName}** ｜ 裝備：${identity}\n　❤️${hp} ⚡${s.minSpd}-${s.maxSpd} ｜ T${ut}`;
    });

    if (!lines.length) {
        lines.push('隊伍是空的！使用 `!party add [罪人名]` 加入成員。');
    }

    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle('⚔️ 當前出戰隊伍')
                .setColor(0x5865f2)
                .setDescription(lines.join('\n'))
                .addFields({
                    name: '💡 管理指令',
                    value: '`!party add [罪人名]` `!party remove [罪人名]` `!party set 李箱,浮士德,...`',
                })
                .setFooter({ text: `${valid.length}/${MAX_PARTY} ｜ 同一罪人不可重複` })
                .setTimestamp()
        ]
    });
}

async function addToParty(client, message, name) {
    if (!name) {
        return message.reply(`❌ 請輸入罪人名。\n可用：${SINNER_NAMES.join('、')}`);
    }

    const sinnerName = inferSinnerKey(name);
    if (!sinnerName) {
        return message.reply(`❌ 找不到「${name}」\n可用：${SINNER_NAMES.join('、')}`);
    }

    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const party = Array.isArray(player.party) ? player.party : [];

    if (party.map(inferSinnerKey).includes(sinnerName)) {
        return message.reply(`「${sinnerName}」已在隊伍中。`);
    }

    if (party.length >= MAX_PARTY) {
        return message.reply(`❌ 隊伍已滿（${MAX_PARTY}人上限）。`);
    }

    party.push(sinnerName);
    player.party = party;
    savePlayerData(client, message.author.id, player);

    return message.reply(`✅ 「**${sinnerName}**」已加入隊伍！（${party.length}/${MAX_PARTY}）`);
}

async function removeFromParty(client, message, name) {
    if (!name) {
        return message.reply(`❌ 請輸入要移除的罪人名。`);
    }

    const sinnerName = inferSinnerKey(name);
    if (!sinnerName) {
        return message.reply(`❌ 找不到「${name}」`);
    }

    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const party = Array.isArray(player.party) ? player.party : [];
    const idx = party.map(inferSinnerKey).indexOf(sinnerName);

    if (idx === -1) {
        return message.reply(`「${sinnerName}」不在隊伍中。`);
    }

    party.splice(idx, 1);
    player.party = party;
    savePlayerData(client, message.author.id, player);

    return message.reply(`✅ 「**${sinnerName}**」已移出隊伍。`);
}

async function setParty(client, message, names) {
    if (!Array.isArray(names) || names.length === 0) {
        return message.reply(`❌ 請輸入隊伍名單。\n格式：\`!party set 李箱,浮士德,...\``);
    }

    const parsed = names.map(inferSinnerKey).filter(Boolean);
    const invalid = names.filter((n, i) => !parsed[i]);
    if (invalid.length) {
        return message.reply(`❌ 找不到：${invalid.join('、')}\n可用：${SINNER_NAMES.join('、')}`);
    }

    const unique = [...new Set(parsed)];
    if (unique.length !== parsed.length) {
        return message.reply('❌ 不能有重複的罪人！');
    }

    if (unique.length > MAX_PARTY) {
        return message.reply(`❌ 最多 ${MAX_PARTY} 名成員。`);
    }

    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    player.party = unique;
    savePlayerData(client, message.author.id, player);

    return message.reply(`✅ 隊伍已設定：${unique.join('、')}（${unique.length}/${MAX_PARTY}）`);
}

module.exports = { handleParty };
