// Functions/GameSystem/BattleSystem.js
// 戰鬥引擎（碰撞系統，仿 Limbus Company）
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SINNERS, getSkillList }    = require('./Data/SinnersData.js');
const { randomEnemy }              = require('./Data/EnemyData.js');
const { getOrCreatePlayer }        = require('./PacksAndData.js');

const SKILL_TIMEOUT  = 45_000;  // 45秒技能選擇
const TYPE_EMOJI     = { 斬: '⚔️', 刺: '🗡️', 鈍: '🔨' };
const STATUS_EMOJI   = { 流血: '🩸', 燃燒: '🔥', 震顫: '🌀', 沉沒: '🌊', 破裂: '💥', 束縛: '⛓️', 倒地: '💫' };
const THREAD_REWARD  = { normal: 5, elite: 15, boss: 40 };

// ─── 工具函式 ─────────────────────────────────────────────────
function rollCoins(count) {
    let heads = 0;
    const icons = [];
    for (let i = 0; i < count; i++) {
        if (Math.random() < 0.5) { heads++; icons.push('🟡'); }
        else                       icons.push('⚫');
    }
    return { heads, icons };
}

function calcClashPower(skill, identityLv = 1) {
    const lvBonus = Math.floor((identityLv - 1) * 0.5);
    const { heads } = rollCoins(skill.coins);
    return skill.clashbase + heads * skill.clashpower + lvBonus;
}

function applyStatus(target, name, stacks) {
    if (!target.statuses) target.statuses = {};
    target.statuses[name] = (target.statuses[name] || 0) + stacks;
}

function processEoT(unit) {
    const effects = [];
    if (!unit.statuses) return '';
    if ((unit.statuses['流血'] || 0) > 0) {
        const dmg = Math.floor(unit.statuses['流血'] * 1.5);
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['流血'] = Math.max(0, unit.statuses['流血'] - 1);
        effects.push(`🩸 流血 → **${unit.name}** 受到 ${dmg} 傷害`);
    }
    if ((unit.statuses['燃燒'] || 0) > 0) {
        const dmg = unit.statuses['燃燒'] * 2;
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['燃燒'] = Math.max(0, unit.statuses['燃燒'] - 1);
        effects.push(`🔥 燃燒 → **${unit.name}** 受到 ${dmg} 傷害`);
    }
    return effects.join('\n');
}

function buildHPBar(cur, max, len = 10) {
    const f = Math.max(0, Math.round((cur / max) * len));
    return '█'.repeat(f) + '░'.repeat(len - f);
}

function formatStatuses(s = {}) {
    return Object.entries(s).filter(([, v]) => v > 0).map(([k, v]) => `${STATUS_EMOJI[k] || ''}${k}×${v}`).join(' ') || '無';
}

// ─── 建立戰況 Embed ────────────────────────────────────────────
function buildBattleEmbed(state, log = '') {
    const allyLines = state.ally.map(u => {
        const bar = buildHPBar(u.hp, u.maxHp);
        return `${u.hp > 0 ? '🟢' : '💀'} **${u.name}** \`${bar}\` ${u.hp}/${u.maxHp} | ${formatStatuses(u.statuses)}`;
    });
    const e = state.enemy;
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ 戰鬥中 — 第 ${state.turn} 回合`)
        .setColor(e.hp <= 0 ? 0x2ed573 : state.ally.every(u => u.hp <= 0) ? 0xff4757 : 0x5865f2)
        .addFields(
            { name: `👹 ${e.name} [${e.tier === 'boss' ? 'BOSS' : e.tier === 'elite' ? '精英' : '一般'}]`,
              value: `\`${buildHPBar(e.hp, e.maxHp)}\` ${e.hp}/${e.maxHp} HP | ${formatStatuses(e.statuses)}`, inline: false },
            { name: '👥 我方隊伍', value: allyLines.join('\n'), inline: false }
        );
    if (log) embed.addFields({ name: '📜 本回合記錄', value: log.slice(-900), inline: false });
    embed.setFooter({ text: `第 ${state.turn} 回合 ｜ 請在 ${SKILL_TIMEOUT / 1000} 秒內選擇技能` });
    return embed;
}

// ─── 技能按鈕（選擇主動出擊的罪人）─────────────────────────────
function buildSkillRow(activeUnit, disabled = false) {
    if (!activeUnit || activeUnit.hp <= 0) return null;
    const sinner = SINNERS[activeUnit.sinnerName];
    if (!sinner) return null;
    const skills = getSkillList(sinner);
    const buttons = skills.map((sk, i) =>
        new ButtonBuilder()
            .setCustomId(`bs_${activeUnit.sinnerName}_${i}`)
            .setLabel(`${i + 1}.${sk.name}`)
            .setEmoji(TYPE_EMOJI[sk.type] || '⚔️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
    );
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`bs_${activeUnit.sinnerName}_defend`)
            .setLabel('🛡️ 防禦')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );
    return new ActionRowBuilder().addComponents(buttons.slice(0, 4));
}

// ─── 主戰鬥入口 ───────────────────────────────────────────────
async function startBattle(client, message, tier = 'normal') {
    const player = await getOrCreatePlayer(client, message.author.id, message.author.username);
    const partyNames = (player.party && player.party.length) ? player.party : Object.keys(SINNERS).slice(0, 4);
    const aliveParty = partyNames.filter(n => SINNERS[n]).slice(0, 4);

    if (!aliveParty.length) {
        return message.reply('❌ 隊伍是空的！先用 `!party add [罪人名]` 組建隊伍，或 `!pack` 編制戰隊。');
    }

    const enemy = randomEnemy(tier);

    const state = {
        userId: message.author.id,
        turn:   1,
        ally:   aliveParty.map(name => {
            const s  = SINNERS[name];
            const lv = player.identityLevels?.[`LCB ${name}`] || player.identityLevels?.[name] || 1;
            const hp = s.hp + (lv - 1) * 3;
            return { sinnerName: name, name, hp, maxHp: hp, defLevel: s.defLevel, statuses: {}, lv };
        }),
        enemy: { ...enemy, maxHp: enemy.hp, statuses: {} },
    };

    const firstAlive = state.ally.find(u => u.hp > 0);
    const battleMsg  = await message.reply({
        embeds:     [buildBattleEmbed(state, `🔔 **戰鬥開始！** 遭遇 **${enemy.name}**`)],
        components: [buildSkillRow(firstAlive)].filter(Boolean),
    });

    const pendingSkills = {}; // sinnerName → skillIndex | 'defend'
    let turnTimer;

    // ── 處理回合 ────────────────────────────────────────────────
    async function processTurn() {
        const logs = [];

        // 按速度排序
        const order = state.ally
            .filter(u => u.hp > 0)
            .map(u => {
                const s = SINNERS[u.sinnerName];
                return { unit: u, spd: s.minSpd + Math.random() * (s.maxSpd - s.minSpd) };
            })
            .sort((a, b) => b.spd - a.spd)
            .map(o => o.unit);

        for (const u of order) {
            if (state.enemy.hp <= 0) break;

            const sinner    = SINNERS[u.sinnerName];
            const skills    = getSkillList(sinner);
            const skillIdx  = pendingSkills[u.sinnerName];
            const isDefend  = skillIdx === 'defend' || skillIdx === undefined;
            const mySkill   = isDefend ? null : skills[skillIdx];

            if (isDefend) {
                const healed = Math.min(u.maxHp - u.hp, 5);
                u.hp += healed;
                logs.push(`🛡️ **${u.name}** 防禦${healed > 0 ? `，回復 ${healed} HP` : ''}`);
                continue;
            }

            // 敵方出技
            const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
            const myPow  = calcClashPower(mySkill, u.lv);
            const ePow   = calcClashPower({ clashbase: eSkill.base, coins: eSkill.coins, clashpower: eSkill.coin }, 1);

            const { icons: myIcons } = rollCoins(mySkill.coins);
            const { icons: eIcons  } = rollCoins(eSkill.coins);
            const myWins = myPow >= ePow;

            logs.push(`${TYPE_EMOJI[mySkill.type] || ''}**${u.name}** ${mySkill.name} \`[${myPow}]\` ${myIcons.join('')}`);
            logs.push(`    ${myWins ? '◀勝▶' : '◀敗▶'} **${state.enemy.name}** ${eSkill.name} \`[${ePow}]\` ${eIcons.join('')}`);

            if (myWins) {
                const dmg = Math.max(1, mySkill.attack - Math.floor(state.enemy.defLevel * 0.2) + Math.floor(Math.random() * 3));
                state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
                logs.push(`    💥 ${state.enemy.name} 受到 **${dmg}** 傷害`);
                if (mySkill.effect) { applyStatus(state.enemy, mySkill.effect.name, mySkill.effect.stacks); logs.push(`    ${STATUS_EMOJI[mySkill.effect.name] || ''} 附加 ${mySkill.effect.name}×${mySkill.effect.stacks}`); }
            } else {
                const dmg = Math.max(1, eSkill.base - Math.floor(u.defLevel * 0.2) + Math.floor(Math.random() * 3));
                u.hp = Math.max(0, u.hp - dmg);
                logs.push(`    💥 ${u.name} 受到 **${dmg}** 傷害`);
            }
        }

        // 敵方主動攻擊未被碰撞的我方
        if (state.enemy.hp > 0) {
            const target  = state.ally.filter(u => u.hp > 0 && !pendingSkills[u.sinnerName])[0]
                         || state.ally.filter(u => u.hp > 0)[0];
            if (target) {
                const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
                const dmg    = Math.max(1, eSkill.base - Math.floor(target.defLevel * 0.2) + Math.floor(Math.random() * 3));
                target.hp    = Math.max(0, target.hp - dmg);
                logs.push(`👹 **${state.enemy.name}** 對 **${target.name}** 發動 ${eSkill.name}，造成 **${dmg}** 傷害`);
            }
        }

        // 回合結束狀態效果
        state.ally.forEach(u => { const r = processEoT(u); if (r) logs.push(r); });
        const er = processEoT(state.enemy);
        if (er) logs.push(er);

        Object.keys(pendingSkills).forEach(k => delete pendingSkills[k]);
        state.turn++;

        const aliveAllies = state.ally.filter(u => u.hp > 0);
        if (state.enemy.hp <= 0) return endBattle(true, logs.join('\n'));
        if (!aliveAllies.length) return endBattle(false, logs.join('\n'));

        const nextUnit = aliveAllies[0];
        await battleMsg.edit({
            embeds:     [buildBattleEmbed(state, logs.join('\n'))],
            components: [buildSkillRow(nextUnit)].filter(Boolean),
        }).catch(() => {});
    }

    async function endBattle(win, lastLog = '') {
        clearTimeout(turnTimer);
        collector.stop();

        const player2 = await getOrCreatePlayer(client, message.author.id, message.author.username);
        player2.totalBattles = (player2.totalBattles || 0) + 1;

        let desc = '';
        if (win) {
            player2.totalWins = (player2.totalWins || 0) + 1;
            const t = THREAD_REWARD[tier] || 5;
            player2.thread = (player2.thread || 0) + t;
            desc = `🎉 **勝利！** 獲得 🧵 紡錘 ×${t}\n\n${lastLog.slice(-600)}`;
        } else {
            desc = `💀 **失敗...** 全員倒下，戰鬥結束。\n\n${lastLog.slice(-600)}`;
        }

        const { savePlayerData } = require('./PacksAndData.js');
        await savePlayerData(client, message.author.id, player2);

        await battleMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(win ? '🏆 戰鬥勝利' : '💀 戰鬥失敗')
                .setColor(win ? 0x2ed573 : 0xff4757)
                .setDescription(desc)
                .setTimestamp()],
            components: [],
        }).catch(() => {});
    }

    // ── 按鈕收集器 ────────────────────────────────────────────
    const collector = battleMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id && i.customId.startsWith('bs_'),
        time:   10 * 60_000,
    });

    // 啟動自動回合計時器
    turnTimer = setTimeout(() => processTurn().catch(console.error), SKILL_TIMEOUT);

    collector.on('collect', async interaction => {
        const parts = interaction.customId.split('_');
        const sinnerName = parts[1];
        const skillPart  = parts[2];
        pendingSkills[sinnerName] = skillPart === 'defend' ? 'defend' : parseInt(skillPart);

        await interaction.deferUpdate().catch(() => {});

        const aliveAllies   = state.ally.filter(u => u.hp > 0);
        const allSelected   = aliveAllies.every(u => pendingSkills[u.sinnerName] !== undefined);

        if (allSelected) {
            clearTimeout(turnTimer);
            await processTurn().catch(console.error);
            if (state.enemy.hp > 0 && state.ally.some(u => u.hp > 0)) {
                turnTimer = setTimeout(() => processTurn().catch(console.error), SKILL_TIMEOUT);
            }
        } else {
            // 讓使用者知道還要為其他罪人選技能
            const remaining = aliveAllies.filter(u => pendingSkills[u.sinnerName] === undefined);
            const nextUnit  = remaining[0];
            await battleMsg.edit({
                embeds:     [buildBattleEmbed(state, `✅ **${sinnerName}** 已選擇技能（${aliveAllies.length - remaining.length}/${aliveAllies.length}）\n⏳ 請為 **${nextUnit?.name}** 選擇技能...`)],
                components: [buildSkillRow(nextUnit)].filter(Boolean),
            }).catch(() => {});
        }
    });

    collector.on('end', (_, reason) => {
        clearTimeout(turnTimer);
        if (reason !== 'user') {
            battleMsg.edit({ components: [] }).catch(() => {});
        }
    });
}

module.exports = { startBattle };
