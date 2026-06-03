// Functions/GameSystem/CharacterSystem.js
// 罪人詳細資訊、連結提升(Uptie)、紡錘查詢
const { EmbedBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES, UPTIE_COSTS, getSkillList } = require('./Data/SinnersData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

function getSinnerUptie(player, sinnerName) {
    return player.sinners?.[sinnerName]?.uptie || 1;
}
function getSinnerEquipped(player, sinnerName) {
    return player.sinners?.[sinnerName]?.equippedIdentity || `LCB ${sinnerName}`;
}

// ─── 顯示罪人詳細 Embed ────────────────────────────────────────
function buildSinnerEmbed(sinnerName, player) {
    const s     = SINNERS[sinnerName];
    const uptie = getSinnerUptie(player, sinnerName);
    const lv    = player.identityLevels?.[`LCB ${sinnerName}`] || player.identityLevels?.[sinnerName] || 1;
    const tierStars = '◆'.repeat(uptie) + '◇'.repeat(4 - uptie);
    const skills    = getSkillList(s);

    const skillLines = skills.map((sk, i) =>
        `**${i + 1}.${sk.name}** [${sk.type}/${sk.sin}]\n` +
        `　 基礎:${sk.clashbase} 硬幣:${sk.coins}×+${sk.clashpower} 攻擊:${sk.attack}` +
        (sk.effect ? ` → ${sk.effect.name}×${sk.effect.stacks}` : '')
    ).join('\n');

    const nextUptie = uptie < 4 ? UPTIE_COSTS[uptie] : null;

    return new EmbedBuilder()
        .setTitle(`👤 ${s.name} / ${s.nameEn}`)
        .setColor(0x5865f2)
        .addFields(
            { name: '📊 等級 / 連結提升', value: `Lv.**${lv}** ｜ ${tierStars}`, inline: true },
            { name: '❤️ 基礎HP',  value: `${s.hp}`, inline: true },
            { name: '⚡ 速度',     value: `${s.minSpd}~${s.maxSpd}`, inline: true },
            { name: '⚔️ 主動技能', value: skillLines, inline: false },
            { name: '🛡️ 防禦',    value: `防禦力: ${s.defense.defense} ｜ 碰撞: ${s.defense.clashpower}×${s.defense.coins}硬幣`, inline: true },
            { name: '💨 迴避',    value: `碰撞: ${s.evade.clashpower}×${s.evade.coins}硬幣 ｜ 防禦力: ${s.evade.defense}`, inline: true },
            { name: '🌟 被動',    value: `**${s.passive.name}**：${s.passive.desc}`, inline: false },
            { name: '🔧 裝備身分', value: getSinnerEquipped(player, sinnerName), inline: false },
            nextUptie
                ? { name: '🔗 下次連結提升費用', value: `🧵 紡錘 ×${nextUptie}`, inline: true }
                : { name: '🔗 連結提升', value: '已達最高 T4', inline: true },
        )
        .setFooter({ text: `主要罪業：${s.primarySin} | 防禦等級：${s.defLevel}` });
}

// ─── !sinner ──────────────────────────────────────────────────
async function handleSinner(client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');

    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);

    if (!name) {
        const lines = SINNER_NAMES.map(n => {
            const uptie = getSinnerUptie(player, n);
            const lv    = player.identityLevels?.[`LCB ${n}`] || player.identityLevels?.[n] || 1;
            return `• **${n}** Lv.${lv} T${uptie}`;
        });
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('📋 所有罪人狀態')
                .setColor(0x74b9ff)
                .setDescription(lines.join('\n'))
                .addFields({ name: '🧵 紡錘', value: `${player.thread}`, inline: true })
                .setFooter({ text: '使用 !sinner [罪人名] 查看詳細資訊' })]
        });
    }

    if (!SINNERS[name]) return message.reply(`❌ 找不到「${name}」\n可用名稱：${SINNER_NAMES.join('、')}`);
    return message.reply({ embeds: [buildSinnerEmbed(name, player)] });
}

// ─── !uptie ───────────────────────────────────────────────────
async function handleUptie(client, message) {
    const args = message.content.trim().split(/\s+/);
    const name = args.slice(1).join(' ');
    if (!name) return message.reply('❌ 用法：`!uptie [罪人名]`');
    if (!SINNERS[name]) return message.reply(`❌ 找不到「${name}」`);

    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    if (!player.sinners) player.sinners = {};
    if (!player.sinners[name]) player.sinners[name] = { uptie: 1, equippedIdentity: `LCB ${name}` };

    const sd = player.sinners[name];
    if (sd.uptie >= 4) return message.reply(`「${name}」已達最高連結等級 T4。`);

    const cost = UPTIE_COSTS[sd.uptie];
    if (player.thread < cost) return message.reply(`❌ 紡錘不足！需要 🧵×${cost}，目前 🧵×${player.thread}`);

    player.thread -= cost;
    sd.uptie      += 1;
    await savePlayerData(client, message.author.id, player);

    const stars = '◆'.repeat(sd.uptie) + '◇'.repeat(4 - sd.uptie);
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔗 連結提升成功！')
            .setColor(0xffd166)
            .setDescription(`**${name}** → T${sd.uptie} ${stars}\n消耗：🧵 ×${cost}　剩餘：🧵 ×${player.thread}`)
            .setTimestamp()]
    });
}

// ─── !equip ───────────────────────────────────────────────────
async function handleEquip(client, message) {
    const m = message.content.trim().match(/^!equip\s+(.+?)\s*\|\s*(.+)$/);
    if (!m) return message.reply('❌ 用法：`!equip [罪人名] | [身分名稱]`\n例：`!equip 李箱 | ［劍契 殺手］李箱`');
    const [, sinnerName, identityName] = m;
    if (!SINNERS[sinnerName]) return message.reply(`❌ 找不到「${sinnerName}」`);

    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    if (!player.sinners) player.sinners = {};
    if (!player.sinners[sinnerName]) player.sinners[sinnerName] = { uptie: 1, equippedIdentity: `LCB ${sinnerName}` };
    player.sinners[sinnerName].equippedIdentity = identityName.trim();
    await savePlayerData(client, message.author.id, player);

    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🔧 裝備更新')
            .setColor(0x2ed573)
            .setDescription(`**${sinnerName}** 現在裝備：\n${identityName.trim()}`)
            .setTimestamp()]
    });
}

// ─── !threads ─────────────────────────────────────────────────
async function handleThreads(client, message) {
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🧵 紡錘持有量')
            .setColor(0xa55eea)
            .setDescription(
                `目前擁有：**🧵 ${player.thread} 紡錘**\n\n` +
                `**連結提升費用：**\nT1→T2：×20　T2→T3：×40　T3→T4：×80\n\n` +
                `_透過戰鬥勝利或完成鏡光迷宮獲得紡錘_`
            )
            .setTimestamp()]
    });
}

module.exports = { handleSinner, handleUptie, handleEquip, handleThreads };
