// Functions/GameSystem/BattleSystem.js 
'use strict';

// 戰鬥引擎（碰撞系統，偏 Limbus 風格）
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES, getSkillList } = require('./Data/SinnersData.js');
const { randomEnemy } = require('./Data/EnemyData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const SKILL_TIMEOUT = 45_000;

const TYPE_EMOJI = { 斬: '⚔️', 刺: '🗡️', 鈍: '🔨' };
const STATUS_EMOJI = { 流血: '🩸', 燃燒: '🔥', 震顫: '🌀', 沉沒: '🌊', 破裂: '💥', 束縛: '⛓️', 倒地: '💫' };

const DIFFICULTY = {
    normal: { enemyHp: 1.00, enemyAtk: 1.00, reward: 1.00, label: '一般' },
    elite:  { enemyHp: 1.30, enemyAtk: 1.15, reward: 1.60, label: '精英' },
    boss:   { enemyHp: 1.80, enemyAtk: 1.30, reward: 2.40, label: 'BOSS' },
};

const THREAD_REWARD = {
    normal: 5,
    elite: 15,
    boss: 40,
};

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function rollCoins(count, headChance = 0.5) {
    let heads = 0;
    const icons = [];
    for (let i = 0; i < count; i++) {
        if (Math.random() < headChance) {
            heads++;
            icons.push('🟡');
        } else {
            icons.push('⚫');
        }
    }
    return { heads, icons };
}

function resolveSkillPower(skill, identityLv = 1, headChance = 0.5) {
    const coins = Math.max(1, Number(skill?.coins || 1));
    const base = Number(skill?.clashbase ?? skill?.base ?? 0);
    const clashPower = Number(skill?.clashpower ?? skill?.coin ?? 0);
    const lvBonus = Math.floor((identityLv - 1) * 0.5);
    const { heads, icons } = rollCoins(coins, headChance);
    return {
        power: base + heads * clashPower + lvBonus,
        icons,
        heads,
    };
}

function applyStatus(target, name, stacks) {
    if (!target.statuses) target.statuses = {};
    target.statuses[name] = (target.statuses[name] || 0) + stacks;
}

function processEoT(unit) {
    const effects = [];
    if (!unit.statuses) return '';

    if ((unit.statuses['流血'] || 0) > 0) {
        const dmg = Math.max(1, Math.floor(unit.statuses['流血'] * 1.5));
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['流血'] = Math.max(0, unit.statuses['流血'] - 1);
        effects.push(`🩸 流血 → **${unit.name}** 受到 ${dmg} 傷害`);
    }

    if ((unit.statuses['燃燒'] || 0) > 0) {
        const dmg = Math.max(1, unit.statuses['燃燒'] * 2);
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['燃燒'] = Math.max(0, unit.statuses['燃燒'] - 1);
        effects.push(`🔥 燃燒 → **${unit.name}** 受到 ${dmg} 傷害`);
    }

    return effects.join('\n');
}

function buildHPBar(cur, max, len = 10) {
    const safeMax = Math.max(1, max);
    const f = clamp(Math.round((cur / safeMax) * len), 0, len);
    return '█'.repeat(f) + '░'.repeat(len - f);
}

function formatStatuses(s = {}) {
    return Object.entries(s)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${STATUS_EMOJI[k] || ''}${k}×${v}`)
        .join(' ') || '無';
}

function inferSinnerFromIdentity(identityName) {
    const text = String(identityName || '');
    return SINNER_NAMES.find(n => text.includes(n)) || null;
}

function resolveBattleRoster(player) {
    const used = new Set();
    let identities = Array.isArray(player.team) ? player.team.filter(Boolean) : [];

    if (!identities.length) {
        const party = Array.isArray(player.party) ? player.party : [];
        identities = party
            .map(sinnerName => {
                if (!SINNERS[sinnerName]) return null;
                return player.sinners?.[sinnerName]?.equippedIdentity || `LCB ${sinnerName}`;
            })
            .filter(Boolean);
    }

    if (!identities.length) {
        identities = SINNER_NAMES.slice(0, 4).map(sinnerName => `LCB ${sinnerName}`);
    }

    const allies = [];
    for (const identityName of identities) {
        const sinnerName = inferSinnerFromIdentity(identityName) || identityName.replace(/^LCB\s+/i, '');
        if (!SINNERS[sinnerName]) continue;
        if (used.has(sinnerName)) continue;
        used.add(sinnerName);

        const s = SINNERS[sinnerName];
        const lv = player.identityLevels?.[identityName] || player.identityLevels?.[`LCB ${sinnerName}`] || player.identityLevels?.[sinnerName] || 1;
        const uptie = player.sinners?.[sinnerName]?.uptie || 1;
        const maxHp = Math.max(1, s.hp + (lv - 1) * 3 + (uptie - 1) * 5);

        allies.push({
            sinnerName,
            identityName,
            name: identityName,
            hp: maxHp,
            maxHp,
            defLevel: s.defLevel || 0,
            statuses: {},
            lv,
            uptie,
        });

        if (allies.length >= 6) break;
    }

    return allies;
}

function buildBattleEmbed(state, log = '') {
    const allyLines = state.ally.map(u => {
        const bar = buildHPBar(u.hp, u.maxHp);
        return `${u.hp > 0 ? '🟢' : '💀'} **${u.name}** \`${bar}\` ${u.hp}/${u.maxHp} | ${formatStatuses(u.statuses)}`;
    });

    const e = state.enemy;
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ 戰鬥中 — 第 ${state.turn} 回合 ｜ ${state.difficultyLabel}`)
        .setColor(e.hp <= 0 ? 0x2ed573 : state.ally.every(u => u.hp <= 0) ? 0xff4757 : 0x5865f2)
        .addFields(
            {
                name: `👹 ${e.name} [${e.tier === 'boss' ? 'BOSS' : e.tier === 'elite' ? '精英' : '一般'}]`,
                value: `\`${buildHPBar(e.hp, e.maxHp)}\` ${e.hp}/${e.maxHp} HP | ${formatStatuses(e.statuses)}`,
                inline: false
            },
            { name: '👥 我方隊伍', value: allyLines.join('\n') || '（無）', inline: false }
        );

    if (log) embed.addFields({ name: '📜 本回合記錄', value: log.slice(-900), inline: false });
    embed.setFooter({ text: `第 ${state.turn} 回合 ｜ 請在 ${SKILL_TIMEOUT / 1000} 秒內選擇技能` });
    return embed;
}

function buildSkillRow(activeUnit, disabled = false) {
    if (!activeUnit || activeUnit.hp <= 0) return null;

    const sinner = SINNERS[activeUnit.sinnerName];
    if (!sinner) return null;

    const skills = getSkillList(sinner);
    const buttons = skills.slice(0, 3).map((sk, i) =>
        new ButtonBuilder()
            .setCustomId(`bs_${activeUnit.sinnerName}_${i}`)
            .setLabel(`${i + 1}.${sk.name}`.slice(0, 80))
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

    return new ActionRowBuilder().addComponents(buttons);
}

function promptBattleHelp(message) {
    return message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('⚔️ 戰鬥難度選擇')
            .setColor(0x5865f2)
            .setDescription(
                '用法：\n' +
                '`!battle normal` — 一般戰鬥\n' +
                '`!battle elite` — 精英戰鬥\n' +
                '`!battle boss` — BOSS 戰\n\n' +
                '如果你直接呼叫 `startBattle()`，預設也是 `normal`。'
            )
            .setTimestamp()]
    });
}

async function handleBattle(client, message) {
    const args = message.content.trim().split(/\s+/);
    const tier = (args[1] || '').toLowerCase();

    if (!tier) return promptBattleHelp(message);
    if (!DIFFICULTY[tier]) {
        return message.reply('❌ 難度錯誤。可用：`normal`、`elite`、`boss`');
    }

    return startBattle(client, message, tier);
}

// ─── 主戰鬥入口 ───────────────────────────────────────────────
async function startBattle(client, message, tier = 'normal') {
    const diff = DIFFICULTY[tier] || DIFFICULTY.normal;
    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const allies = resolveBattleRoster(player);

    if (!allies.length) {
        return message.reply('❌ 隊伍是空的！先用 `!party` 組建隊伍，或在 `!pack` 編成出戰人格。');
    }

    let enemy = randomEnemy(tier);
    enemy = {
        ...enemy,
        tier,
        maxHp: Math.max(1, Math.floor((enemy.hp || 1) * diff.enemyHp)),
        hp: Math.max(1, Math.floor((enemy.hp || 1) * diff.enemyHp)),
        defLevel: Math.max(0, Math.floor((enemy.defLevel || 0) * diff.enemyAtk)),
        statuses: {},
    };

    const state = {
        userId: message.author.id,
        turn: 1,
        difficulty: tier,
        difficultyLabel: diff.label,
        ally: allies,
        enemy,
    };

    const battleMsg = await message.reply({
        embeds: [buildBattleEmbed(state, `🔔 **戰鬥開始！** 遭遇 **${enemy.name}**`)],
        components: [buildSkillRow(state.ally.find(u => u.hp > 0))].filter(Boolean),
    });

    const pendingSkills = {}; // sinnerName -> skillIndex | 'defend'
    let turnTimer;
    let finished = false;

    let resolvePromise;
    const battlePromise = new Promise(resolve => {
        resolvePromise = resolve;
    });

    function clearTurnTimer() {
        if (turnTimer) clearTimeout(turnTimer);
        turnTimer = null;
    }

    async function endBattle(win, lastLog = '') {
        if (finished) return;
        finished = true;
        clearTurnTimer();
        collector.stop('end');

        const player2 = getOrCreatePlayer(client, message.author.id, message.author.username);
        player2.totalBattles = (player2.totalBattles || 0) + 1;

        const threadRewardBase = THREAD_REWARD[tier] || 5;
        const threadReward = Math.max(1, Math.floor(threadRewardBase * diff.reward));

        let desc = '';
        if (win) {
            player2.totalWins = (player2.totalWins || 0) + 1;
            player2.thread = (player2.thread || 0) + threadReward;
            desc = `🎉 **勝利！** 獲得 🧵 紡錘 ×${threadReward}\n\n${lastLog.slice(-600)}`;
        } else {
            desc = `💀 **失敗...** 全員倒下或超時，戰鬥結束。\n\n${lastLog.slice(-600)}`;
        }

        savePlayerData(client, message.author.id, player2);

        await battleMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(win ? '🏆 戰鬥勝利' : '💀 戰鬥失敗')
                .setColor(win ? 0x2ed573 : 0xff4757)
                .setDescription(desc)
                .setTimestamp()],
            components: [],
        }).catch(() => {});

        resolvePromise({ win, threadReward: win ? threadReward : 0, tier, state });
    }

    async function processTurn() {
        if (finished) return;

        const logs = [];

        // 按速度排序
        const order = state.ally
            .filter(u => u.hp > 0)
            .map(u => {
                const s = SINNERS[u.sinnerName];
                const spd = (s.minSpd || 0) + Math.random() * Math.max(1, (s.maxSpd || 1) - (s.minSpd || 0));
                return { unit: u, spd };
            })
            .sort((a, b) => b.spd - a.spd)
            .map(o => o.unit);

        for (const u of order) {
            if (state.enemy.hp <= 0) break;

            const sinner = SINNERS[u.sinnerName];
            const skills = getSkillList(sinner);
            const skillIdx = pendingSkills[u.sinnerName];
            const isDefend = skillIdx === 'defend' || skillIdx === undefined;
            const mySkill = isDefend ? null : skills[skillIdx];

            if (isDefend) {
                const healed = Math.min(u.maxHp - u.hp, 5);
                u.hp += healed;
                logs.push(`🛡️ **${u.name}** 防禦${healed > 0 ? `，回復 ${healed} HP` : ''}`);
                continue;
            }

            const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
            const myRoll = resolveSkillPower(mySkill, u.lv, 0.5);
            const eRoll = resolveSkillPower({
                clashbase: eSkill.base ?? eSkill.clashbase ?? 0,
                coins: eSkill.coins ?? 1,
                clashpower: eSkill.coin ?? eSkill.clashpower ?? 0,
            }, 1, 0.5);

            const myWins = myRoll.power >= eRoll.power;

            logs.push(`${TYPE_EMOJI[mySkill.type] || ''}**${u.name}** ${mySkill.name} \`[${myRoll.power}]\` ${myRoll.icons.join('')}`);
            logs.push(`    ${myWins ? '◀勝▶' : '◀敗▶'} **${state.enemy.name}** ${eSkill.name} \`[${eRoll.power}]\` ${eRoll.icons.join('')}`);

            if (myWins) {
                const dmg = Math.max(1, (mySkill.attack || 1) - Math.floor((state.enemy.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3));
                state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
                logs.push(`    💥 ${state.enemy.name} 受到 **${dmg}** 傷害`);

                if (mySkill.effect) {
                    applyStatus(state.enemy, mySkill.effect.name, mySkill.effect.stacks || 1);
                    logs.push(`    ${STATUS_EMOJI[mySkill.effect.name] || ''} 附加 ${mySkill.effect.name}×${mySkill.effect.stacks || 1}`);
                }
            } else {
                const dmg = Math.max(1, (eSkill.base ?? eSkill.clashbase ?? 1) - Math.floor((u.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3));
                u.hp = Math.max(0, u.hp - dmg);
                logs.push(`    💥 ${u.name} 受到 **${dmg}** 傷害`);
            }
        }

        if (state.enemy.hp > 0) {
            const target = state.ally.filter(u => u.hp > 0 && pendingSkills[u.sinnerName] === undefined)[0]
                || state.ally.filter(u => u.hp > 0)[0];

            if (target) {
                const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
                const dmg = Math.max(1, (eSkill.base ?? eSkill.clashbase ?? 1) - Math.floor((target.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3));
                target.hp = Math.max(0, target.hp - dmg);
                logs.push(`👹 **${state.enemy.name}** 對 **${target.name}** 發動 ${eSkill.name}，造成 **${dmg}** 傷害`);
            }
        }

        state.ally.forEach(u => {
            const r = processEoT(u);
            if (r) logs.push(r);
        });
        const er = processEoT(state.enemy);
        if (er) logs.push(er);

        Object.keys(pendingSkills).forEach(k => delete pendingSkills[k]);
        state.turn += 1;

        const aliveAllies = state.ally.filter(u => u.hp > 0);
        if (state.enemy.hp <= 0) return endBattle(true, logs.join('\n'));
        if (!aliveAllies.length) return endBattle(false, logs.join('\n'));

        const nextUnit = aliveAllies[0];
        await battleMsg.edit({
            embeds: [buildBattleEmbed(state, logs.join('\n'))],
            components: [buildSkillRow(nextUnit)].filter(Boolean),
        }).catch(() => {});
    }

    const collector = battleMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id && i.customId.startsWith('bs_'),
        time: 10 * 60_000,
    });

    turnTimer = setTimeout(() => processTurn().catch(console.error), SKILL_TIMEOUT);

    collector.on('collect', async interaction => {
        const parts = interaction.customId.split('_');
        const sinnerName = parts[1];
        const skillPart = parts[2];

        if (!state.ally.some(u => u.sinnerName === sinnerName && u.hp > 0)) {
            return interaction.deferUpdate().catch(() => {});
        }

        pendingSkills[sinnerName] = skillPart === 'defend' ? 'defend' : parseInt(skillPart, 10);
        await interaction.deferUpdate().catch(() => {});

        const aliveAllies = state.ally.filter(u => u.hp > 0);
        const allSelected = aliveAllies.every(u => pendingSkills[u.sinnerName] !== undefined);

        if (allSelected) {
            clearTurnTimer();
            await processTurn().catch(console.error);
            if (!finished && state.enemy.hp > 0 && state.ally.some(u => u.hp > 0)) {
                turnTimer = setTimeout(() => processTurn().catch(console.error), SKILL_TIMEOUT);
            }
        } else {
            const remaining = aliveAllies.filter(u => pendingSkills[u.sinnerName] === undefined);
            const nextUnit = remaining[0];

            await battleMsg.edit({
                embeds: [buildBattleEmbed(state, `✅ **${sinnerName}** 已選擇技能（${aliveAllies.length - remaining.length}/${aliveAllies.length}）\n⏳ 請為 **${nextUnit?.name || '下一位罪人'}** 選擇技能...`)],
                components: [buildSkillRow(nextUnit)].filter(Boolean),
            }).catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        clearTurnTimer();
        if (!finished) {
            if (reason !== 'end') {
                await endBattle(false, '⏰ 戰鬥超時。').catch(() => {});
            } else {
                await battleMsg.edit({ components: [] }).catch(() => {});
                resolvePromise({ win: false, threadReward: 0, tier, state });
            }
        }
    });

    return battlePromise;
}

module.exports = {
    handleBattle,
    startBattle,
};
