// Functions/GameSystem/PartySystem.js
const { EmbedBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES } = require('./Data/SinnersData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const MAX_PARTY = 6;

function calcHP(sinner, player, sinnerName) {
    const lv = player.identityLevels?.[`LCB ${sinnerName}`] || player.identityLevels?.[sinnerName] || 1;
    return sinner.hp + (lv - 1) * 3 + ((player.sinners?.[sinnerName]?.uptie || 1) - 1) * 5;
}

async function handleParty(client, message) {
    const args = message.content.trim().split(/\s+/);
    const sub  = args[1];

    if (sub === 'add' || sub === '加入') return addToParty(client, message, args.slice(2).join(' '));
    if (sub === 'remove' || sub === '移除') return removeFromParty(client, message, args.slice(2).join(' '));
    if (sub === 'set' || sub === '設定') return setParty(client, message, args.slice(2).join(' ').split(/[,，]/).map(n => n.trim()));

    return showParty(client, message);
}

async function showParty(client, message) {
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    const party  = player.party || [];
    const valid  = party.filter(n => SINNERS[n]);

    const lines = valid.map((name, i) => {
        const s  = SINNERS[name];
        const hp = calcHP(s, player, name);
        const ut = player.sinners?.[name]?.uptie || 1;
        return `${i + 1}. **${name}** ｜ ❤️${hp} ⚡${s.minSpd}-${s.maxSpd} ｜ T${ut}`;
    });
    if (!lines.length) lines.push('隊伍是空的！使用 `!party add [罪人名]` 加入成員。');

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('⚔️ 當前出戰隊伍')
            .setColor(0x5865f2)
            .setDescription(lines.join('\n'))
            .addFields({
                name: '💡 管理指令',
                value: '`!party add [罪人名]` `!party remove [罪人名]` `!party set 李箱,浮士德,...`',
            })
            .setFooter({ text: `${valid.length}/${MAX_PARTY} ｜ 同一罪人不可重複` })
            .setTimestamp()]
    });
}

async function addToParty(client, message, name) {
    if (!SINNERS[name]) return message.reply(`❌ 找不到「${name}」\n可用：${SINNER_NAMES.join('、')}`);
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    const party  = player.party || [];
    if (party.includes(name)) return message.reply(`「${name}」已在隊伍中。`);
    if (party.length >= MAX_PARTY) return message.reply(`❌ 隊伍已滿（${MAX_PARTY}人上限）。`);
    party.push(name);
    player.party = party;
    await savePlayerData(client, message.author.id, player);
    return message.reply(`✅ 「**${name}**」已加入隊伍！（${party.length}/${MAX_PARTY}）`);
}

async function removeFromParty(client, message, name) {
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    const party  = player.party || [];
    const idx    = party.indexOf(name);
    if (idx === -1) return message.reply(`「${name}」不在隊伍中。`);
    party.splice(idx, 1);
    player.party = party;
    await savePlayerData(client, message.author.id, player);
    return message.reply(`✅ 「**${name}**」已移出隊伍。`);
}

async function setParty(client, message, names) {
    const invalid = names.filter(n => !SINNERS[n]);
    if (invalid.length) return message.reply(`❌ 找不到：${invalid.join('、')}`);
    const unique  = [...new Set(names)];
    if (unique.length !== names.length) return message.reply('❌ 不能有重複的罪人！');
    if (unique.length > MAX_PARTY) return message.reply(`❌ 最多 ${MAX_PARTY} 名成員。`);
    const player  = await getOrCreatePlayer(client, message.author.id, message.author.username);
    player.party  = unique;
    await savePlayerData(client, message.author.id, player);
    return message.reply(`✅ 隊伍已設定：${unique.join('、')}（${unique.length}/${MAX_PARTY}）`);
}

module.exports = { handleParty };
