// Functions/GameSystem/BattleSystem.js
// 戰鬥引擎：碰撞系統 / 技能 / 狀態效果

const {
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { SINNERS } = require('./Data/SinnersData.js');
const { randomEnemy } = require('./Data/EnemyData.js');
const { getPartyWithData, calcHP } = require('./PartySystem.js');
const { loadCharData, saveCharData } = require('./CharacterSystem.js');

const THREAD_REWARDS = { normal: 5, elite: 15, boss: 40 };
const EXP_REWARDS    = { normal: 10, elite: 30, boss: 80 };
const SKILL_TIMEOUT  = 20_000;

const SIN_EMOJI = { 憤: '🔴', 情: '🟠', 怠: '🟡', 貪: '🟢', 幽: '🔵', 傲: '🟣', 嫉: '⚫' };
const TYPE_EMOJI = { 斬: '⚔️', 刺: '🗡️', 鈍: '🔨' };
const STATUS_EMOJI = { 流血: '🩸', 燃燒: '🔥', 震顫: '🌀', 沉沒: '🌊', 破裂: '💥', 束縛: '⛓️', 倒地: '💫' };

// ─── 工具 ─────────────────────────────────────────────────────
function rollCoins(count) {
    let heads = 0;
    const results = [];
    for (let i = 0; i < count; i++) {
        const h = Math.random() < 0.5;
        if (h) heads++;
        results.push(h ? '🟡' : '⚫');
    }
    return { heads, results };
}

function calcSkillPower(skill, level = 1, uptie = 1) {
    const bonus = Math.floor((level - 1) * 0.5) + (uptie - 1);
    const { heads } = rollCoins(skill.coins);
    return skill.base + heads * skill.coin + bonus;
}

function applyStatus(target, statusName, stacks) {
    if (!target.statuses) target.statuses = {};
    target.statuses[statusName] = (target.statuses[statusName] || 0) + stacks;
}

function processEndOfTurn(unit) {
    if (!unit.statuses) return '';
    const effects = [];
    if (unit.statuses['流血'] > 0) {
        const dmg = Math.floor(unit.statuses['流血'] * 1.5);
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['流血'] = Math.max(0, unit.statuses['流血'] - 1);
        effects.push(`🩸 流血造成 ${dmg} 傷害`);
    }
    if (unit.statuses['燃燒'] > 0) {
        const dmg = unit.statuses['燃燒'] * 2;
        unit.hp = Math.max(0, unit.hp - dmg);
        unit.statuses['燃燒'] = Math.max(0, unit.statuses['燃燒'] - 1);
        effects.push(`🔥 燃燒造成 ${dmg} 傷害`);
    }
    return effects.join('\n');
}

function calcDamage(winPower, losePower, defLevel) {
    const base = Math.max(1, winPower - losePower);
    const effective = Math.max(0, base - Math.floor(defLevel * 0.3));
    return Math.max(1, effective + Math.floor(Math.random() * 3));
}

function buildHPBar(current, max, len = 10) {
    const filled = Math.round((current / max) * len);
    return '█'.repeat(filled) + '░'.repeat(Math.max(0, len - filled));
}

function formatStatuses(statuses = {}) {
    return Object.entries(statuses)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${STATUS_EMOJI[k] || ''}${k}×${v}`)
        .join(' ') || '無';
}

// ─── 建立戰鬥嵌入 ──────────────────────────────────────────────
function buildBattleEmbed(state, log = '') {
    const ally = state.ally;
    const enemy = state.enemy;

    const allyLines = ally.units.map((u, i) => {
        const alive = u.hp > 0;
        const bar = buildHPBar(u.hp, u.maxHp);
        const st = formatStatuses(u.statuses);
        return `${alive ? '🟢' : '💀'} **${u.name}** ${bar} ${u.hp}/${u.maxHp} ｜ ${st}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`⚔️ 戰鬥中 — 第 ${state.turn} 回合`)
        .setColor(enemy.hp <= enemy.maxHp * 0.3 ? 0x2ed573 : ally.units.every(u => u.hp <= 0) ? 0xff4757 : 0x5865f2)
        .addFields(
            { name: `👹 敵人：${enemy.name} [${enemy.tier === 'boss' ? 'BOSS' : enemy.tier === 'elite' ? '精英' : '一般'}]`, value: `${buildHPBar(enemy.hp, enemy.maxHp)} ${enemy.hp}/${enemy.maxHp} HP\n狀態：${formatStatuses(enemy.statuses)}`, inline: false },
            { name: '👥 我方', value: allyLines.join('\n'), inline: false }
        );

    if (log) embed.addFields({ name: '📜 戰鬥記錄', value: log.slice(-1000), inline: false });
    embed.setFooter({ text: `回合 ${state.turn} | 選擇技能或等待 ${SKILL_TIMEOUT / 1000}s 自動出擊` });
    return embed;
}

// ─── 建立技能選擇列 ────────────────────────────────────────────
function buildSkillRow(unit, disabled = false) {
    const sinner = SINNERS[unit.sinnerName];
    const buttons = sinner.skills.map((sk, i) =>
        new ButtonBuilder()
            .setCustomId(`battle_skill_${unit.sinnerName}_${i}`)
            .setLabel(`${i + 1}.${sk.name} [${sk.coins}幣 基:${sk.base}]`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled || unit.hp <= 0)
    );
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`battle_skill_${unit.sinnerName}_defend`)
            .setLabel('🛡️ 防禦')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || unit.hp <= 0)
    );
    return new ActionRowBuilder().addComponents(buttons.slice(0, 4));
}

// ─── 執行一次碰撞 ─────────────────────────────────────────────
function doClash(attacker, attackerSkill, defender, defenderSkill, atkData, defData) {
    const atkPow = calcSkillPower(attackerSkill, atkData?.level || 1, atkData?.uptie || 1);
    const defPow = defenderSkill ? calcSkillPower(defenderSkill, defData?.level || 1, defData?.uptie || 1) : 0;

    const atkWins = atkPow >= defPow;
    const winner = atkWins ? attacker : defender;
    const loser  = atkWins ? defender : attacker;
    const winSkill = atkWins ? attackerSkill : defenderSkill;
    const loseSkill = atkWins ? defenderSkill : attackerSkill;
    const winPow = atkWins ? atkPow : defPow;
    const losePow = atkWins ? defPow : atkPow;

    const damage = calcDamage(winPow, losePow, loser.defLevel || 0);
    loser.hp = Math.max(0, loser.hp - damage);

    if (winSkill?.effect && Math.random() < 0.6) {
        applyStatus(loser, winSkill.effect.name, winSkill.effect.stacks);
    }

    const atkCoins = rollCoins(attackerSkill.coins).results.join('');
    const defCoins = defenderSkill ? rollCoins(defenderSkill.coins).results.join('') : '──';

    return {
        atkWins,
        log: `${TYPE_EMOJI[attackerSkill.type] || ''}**${attacker.name}** ${attackerSkill.name} [${atkPow}] ${atkCoins}\n` +
             `    ${atkWins ? '◀ 勝' : '▶ 敗'} vs **${defender.name}** ${defenderSkill?.name || '防禦'} [${defPow}] ${defCoins}\n` +
             `    💥 ${loser.name} 受到 ${damage} 傷害` +
             (winSkill?.effect ? ` ＋ ${winSkill.effect.name}×${winSkill.effect.stacks}` : ''),
    };
}

// ─── 主戰鬥入口 ───────────────────────────────────────────────
async function startBattle(client, message, tier = 'normal') {
    const { party, charData } = await getPartyWithData(client, message.author.id);
    const aliveParty = party.filter(n => SINNERS[n]).slice(0, 4);

    if (aliveParty.length === 0) {
        return message.reply('❌ 隊伍是空的！先用 `!party add [罪人名]` 組建隊伍。');
    }

    const enemy = randomEnemy(tier);

    const state = {
        userId: message.author.id,
        turn: 1,
        ally: {
            units: aliveParty.map(name => {
                const s = SINNERS[name];
                const sd = charData.sinners[name] || { level: 1, uptie: 1 };
                const maxHp = calcHP(s, sd);
                return {
                    sinnerName: name,
                    name,
                    hp: maxHp,
                    maxHp,
                    defLevel: s.defLevel,
                    statuses: {},
                    sd,
                };
            }),
        },
        enemy: { ...enemy, maxHp: enemy.hp, statuses: {} },
    };

    let battleLog = `🔔 **戰鬥開始！** 遭遇 **${enemy.name}**\n`;

    const embed = buildBattleEmbed(state, battleLog);
    const skillRows = aliveParty.slice(0, 2).map(name =>
        buildSkillRow(state.ally.units.find(u => u.sinnerName === name))
    );

    const battleMsg = await message.reply({
        embeds: [embed],
        components: skillRows.slice(0, 1),
    });

    const pendingSkills = {};

    const collector = battleMsg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id && i.customId.startsWith('battle_skill_'),
        time: 5 * 60_000,
    });

    async function processTurn() {
        const turnLogs = [];

        // 決定回合順序（按速度降序）
        const allUnits = [
            ...state.ally.units.filter(u => u.hp > 0).map(u => ({ ...u, side: 'ally' })),
            { ...state.enemy, side: 'enemy' }
        ].sort((a, b) => {
            const spdA = a.side === 'ally' ? SINNERS[a.sinnerName].minSpd + Math.random() * (SINNERS[a.sinnerName].maxSpd - SINNERS[a.sinnerName].minSpd) : state.enemy.minSpd + Math.random() * (state.enemy.maxSpd - state.enemy.minSpd);
            const spdB = b.side === 'ally' ? SINNERS[b.sinnerName].minSpd + Math.random() * (SINNERS[b.sinnerName].maxSpd - SINNERS[b.sinnerName].minSpd) : state.enemy.minSpd + Math.random() * (state.enemy.maxSpd - state.enemy.minSpd);
            return spdB - spdA;
        });

        for (const unit of allUnits) {
            if (state.enemy.hp <= 0) break;
            const aliveAllies = state.ally.units.filter(u => u.hp > 0);
            if (!aliveAllies.length) break;

            if (unit.side === 'ally') {
                const allyUnit = state.ally.units.find(u => u.sinnerName === unit.sinnerName);
                if (!allyUnit || allyUnit.hp <= 0) continue;
                const sinner = SINNERS[allyUnit.sinnerName];

                const skillIdx = pendingSkills[allyUnit.sinnerName] ?? Math.floor(Math.random() * sinner.skills.length);
                const skill = typeof skillIdx === 'number' ? sinner.skills[skillIdx] : null;

                if (!skill) {
                    allyUnit.hp = Math.min(allyUnit.maxHp, allyUnit.hp + 5);
                    turnLogs.push(`🛡️ **${allyUnit.name}** 防禦，回復 5 HP`);
                    continue;
                }

                const enemySkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
                const clash = doClash(allyUnit, skill, state.enemy, enemySkill, allyUnit.sd, null);
                turnLogs.push(clash.log);
            } else {
                const target = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
                const enemySkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
                const sinner = SINNERS[target.sinnerName];
                const defSkill = sinner.skills[0];
                const clash = doClash(state.enemy, enemySkill, target, defSkill, null, target.sd);
                turnLogs.push(clash.log);
            }
        }

        // 回合結束狀態效果
        for (const u of state.ally.units) {
            const eot = processEndOfTurn(u);
            if (eot) turnLogs.push(eot);
        }
        const eotEnemy = processEndOfTurn(state.enemy);
        if (eotEnemy) turnLogs.push(eotEnemy);

        Object.keys(pendingSkills).forEach(k => delete pendingSkills[k]);
        state.turn++;
        battleLog = turnLogs.join('\n');

        // 檢查勝負
        const aliveAllies = state.ally.units.filter(u => u.hp > 0);
        if (state.enemy.hp <= 0) {
            return endBattle(true);
        }
        if (!aliveAllies.length) {
            return endBattle(false);
        }

        await battleMsg.edit({
            embeds: [buildBattleEmbed(state, battleLog)],
            components: [buildSkillRow(aliveAllies[0])],
        }).catch(() => {});
    }

    async function endBattle(win) {
        collector.stop();
        const charData2 = await loadCharData(client, message.author.id);
        charData2.totalBattles = (charData2.totalBattles || 0) + 1;

        let resultDesc = '';
        if (win) {
            charData2.totalWins = (charData2.totalWins || 0) + 1;
            const threads = THREAD_REWARDS[tier];
            charData2.threads = (charData2.threads || 0) + threads;
            resultDesc = `🎉 **勝利！**\n獲得 🧵 絲線 ×${threads}`;
        } else {
            resultDesc = '💀 **失敗...**\n全員倒下，戰鬥結束。';
        }

        await saveCharData(client, message.author.id, charData2);

        const endEmbed = new EmbedBuilder()
            .setTitle(win ? '🏆 戰鬥勝利' : '💀 戰鬥失敗')
            .setColor(win ? 0x2ed573 : 0xff4757)
            .setDescription(resultDesc + '\n\n' + battleLog.slice(-800))
            .setTimestamp();

        await battleMsg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
    }

    let turnTimer = setTimeout(processTurn, SKILL_TIMEOUT);

    collector.on('collect', async interaction => {
        const parts = interaction.customId.split('_');
        const sinnerName = parts[2];
        const skillIdx = parts[3] === 'defend' ? null : parseInt(parts[3]);

        pendingSkills[sinnerName] = skillIdx;

        await interaction.deferUpdate().catch(() => {});

        const allAlive = state.ally.units.filter(u => u.hp > 0);
        const allSelected = allAlive.every(u => pendingSkills[u.sinnerName] !== undefined);

        if (allSelected) {
            clearTimeout(turnTimer);
            await processTurn();
            if (state.enemy.hp > 0 && state.ally.units.some(u => u.hp > 0)) {
                turnTimer = setTimeout(processTurn, SKILL_TIMEOUT);
            }
        } else {
            await battleMsg.edit({
                embeds: [buildBattleEmbed(state, `✅ ${sinnerName} 已選擇技能，等待其他成員...`)],
                components: [buildSkillRow(allAlive.find(u => !pendingSkills[u.sinnerName]) || allAlive[0])],
            }).catch(() => {});
        }
    });

    collector.on('end', () => {
        clearTimeout(turnTimer);
        const aliveAllies = state.ally.units.filter(u => u.hp > 0);
        if (state.enemy.hp > 0 && aliveAllies.length > 0) {
            battleMsg.edit({
                embeds: [buildBattleEmbed(state, '⏰ 戰鬥超時，已自動結束。')],
                components: [],
            }).catch(() => {});
        }
    });
}

module.exports = { startBattle };
