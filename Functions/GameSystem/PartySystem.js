// Functions/GameSystem/PartySystem.js
// 隊伍管理：最多6名，同一罪人不能重複

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES } = require('./Data/SinnersData.js');
const { loadCharData, saveCharData } = require('./CharacterSystem.js');

const MAX_PARTY = 6;

// ─── 取得隊伍（含角色數據）────────────────────────────────────
async function getPartyWithData(client, userId) {
    const charData = await loadCharData(client, userId);
    const party = charData.party || SINNER_NAMES.slice(0, 4);
    return { party, charData };
}

// ─── 計算有效HP（等級加成）────────────────────────────────────
function calcHP(sinner, sinnerData) {
    const base = sinner.hp;
    const lvBonus = (sinnerData.level - 1) * 3;
    const uptieBonus = (sinnerData.uptie - 1) * 5;
    return base + lvBonus + uptieBonus;
}

// ─── 指令：!party ──────────────────────────────────────────────
async function handleParty(client, message) {
    const args = message.content.trim().split(/\s+/);

    // !party add [罪人名]
    if (args[1] === 'add' || args[1] === '加入') {
        const name = args.slice(2).join(' ');
        return addToParty(client, message, name);
    }
    // !party remove [罪人名]
    if (args[1] === 'remove' || args[1] === '移除') {
        const name = args.slice(2).join(' ');
        return removeFromParty(client, message, name);
    }
    // !party set [名1,名2,名3...]
    if (args[1] === 'set' || args[1] === '設定') {
        const names = args.slice(2).join(' ').split(/[,，]/);
        return setParty(client, message, names.map(n => n.trim()));
    }

    // !party (無參數) → 顯示隊伍
    return showParty(client, message);
}

async function showParty(client, message) {
    const { party, charData } = await getPartyWithData(client, message.author.id);
    const validParty = party.filter(n => SINNERS[n]);

    const lines = validParty.map((name, i) => {
        const s = SINNERS[name];
        const sd = charData.sinners[name] || { level: 1, uptie: 1 };
        const hp = calcHP(s, sd);
        const tier = '◆'.repeat(sd.uptie) + '◇'.repeat(4 - sd.uptie);
        return `${i + 1}. **${name}** ｜ Lv.${sd.level} ${tier} ｜ ❤️${hp} ⚡${s.minSpd}-${s.maxSpd}`;
    });

    if (lines.length === 0) lines.push('隊伍是空的！使用 `!party add [罪人名]` 加入成員。');

    const embed = new EmbedBuilder()
        .setTitle('⚔️ 當前出戰隊伍')
        .setColor(0x5865f2)
        .setDescription(lines.join('\n'))
        .addFields({
            name: '💡 指令',
            value:
                '`!party add [罪人名]` — 加入隊伍\n' +
                '`!party remove [罪人名]` — 移出隊伍\n' +
                '`!party set 李箱,浮士德,默爾索` — 一次設定全隊\n' +
                `_隊伍上限 ${MAX_PARTY} 人，同一罪人不可重複_`,
        })
        .setFooter({ text: `隊伍人數：${validParty.length}/${MAX_PARTY}` })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function addToParty(client, message, name) {
    if (!SINNERS[name]) {
        return message.reply(`❌ 找不到罪人「${name}」\n可用：${SINNER_NAMES.join('、')}`);
    }
    const charData = await loadCharData(client, message.author.id);
    const party = charData.party || [];

    if (party.includes(name)) return message.reply(`「${name}」已在隊伍中。`);
    if (party.length >= MAX_PARTY) return message.reply(`❌ 隊伍已滿（${MAX_PARTY}人上限）。請先移出一名成員。`);

    party.push(name);
    charData.party = party;
    await saveCharData(client, message.author.id, charData);
    return message.reply(`✅ 「**${name}**」已加入隊伍！（${party.length}/${MAX_PARTY}）`);
}

async function removeFromParty(client, message, name) {
    const charData = await loadCharData(client, message.author.id);
    const party = charData.party || [];
    const idx = party.indexOf(name);
    if (idx === -1) return message.reply(`「${name}」不在隊伍中。`);
    party.splice(idx, 1);
    charData.party = party;
    await saveCharData(client, message.author.id, charData);
    return message.reply(`✅ 「**${name}**」已移出隊伍。`);
}

async function setParty(client, message, names) {
    const invalid = names.filter(n => !SINNERS[n]);
    if (invalid.length) return message.reply(`❌ 找不到以下罪人：${invalid.join('、')}`);

    const unique = [...new Set(names)];
    if (unique.length !== names.length) return message.reply('❌ 隊伍中有重複的罪人！');
    if (unique.length > MAX_PARTY) return message.reply(`❌ 最多 ${MAX_PARTY} 名成員。`);

    const charData = await loadCharData(client, message.author.id);
    charData.party = unique;
    await saveCharData(client, message.author.id, charData);
    return message.reply(`✅ 隊伍已設定：${unique.join('、')}（${unique.length}/${MAX_PARTY}）`);
}

module.exports = { handleParty, getPartyWithData, calcHP };
