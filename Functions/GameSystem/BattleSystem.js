// Functions/GameSystem/BattleSystem.js
// 戰鬥引擎 — 5難度+狂氣獎勵+敵人選擇UI+StatusEffects整合
'use strict';

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { SINNERS, SINNER_NAMES, getSkillList } = require('./Data/SinnersData.js');
const { randomEnemy, getEnemiesForTier } = require('./Data/EnemyData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const {
    applyStatus, processTurnEnd, processOnHit,
    formatStatuses, isBindRestricted, getKnockdownMultiplier,
} = require('./Data/StatusEffects.js');

const SKILL_TIMEOUT = 45_000;
const TYPE_EMOJI = { 斬: '⚔️', 刺: '🗡️', 鈍: '🔨' };

// ─── 5難度設定 ────────────────────────────────────────────────
const DIFFICULTY = {
    super_easy: { enemyHpMult: 0.55, enemyAtkMult: 0.70, lunacyReward: 20,  threadReward: 2,  label: '超簡單 🟢' },
    easy:       { enemyHpMult: 0.75, enemyAtkMult: 0.85, lunacyReward: 40,  threadReward: 5,  label: '簡單 🟡' },
    normal:     { enemyHpMult: 1.00, enemyAtkMult: 1.00, lunacyReward: 70,  threadReward: 10, label: '一般 🟠' },
    hard:       { enemyHpMult: 1.40, enemyAtkMult: 1.20, lunacyReward: 130, threadReward: 20, label: '困難 🔴' },
    insane:     { enemyHpMult: 2.00, enemyAtkMult: 1.50, lunacyReward: 200, threadReward: 35, label: '瘋狂 💀' },
    // 相容舊版 MirrorDungeon 呼叫
    normal_md:  { enemyHpMult: 1.00, enemyAtkMult: 1.00, lunacyReward: 0,   threadReward: 10, label: '一般' },
    elite:      { enemyHpMult: 1.30, enemyAtkMult: 1.15, lunacyReward: 0,   threadReward: 20, label: '精英' },
    boss:       { enemyHpMult: 1.80, enemyAtkMult: 1.30, lunacyReward: 0,   threadReward: 35, label: 'BOSS' },
};

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function rollCoins(count, headChance = 0.5) {
    let heads = 0;
    const icons = [];
    for (let i = 0; i < count; i++) {
        if (Math.random() < headChance) { heads++; icons.push('🟡'); }
        else icons.push('⚫');
    }
    return { heads, icons };
}

function resolveSkillPower(skill, identityLv = 1, headChance = 0.5) {
    const coins = Math.max(1, Number(skill?.coins || 1));
    const base  = Number(skill?.clashbase ?? skill?.base ?? 0);
    const cp    = Number(skill?.clashpower ?? skill?.coin ?? 0);
    const lvBonus = Math.floor((identityLv - 1) * 0.5);
    const { heads, icons } = rollCoins(coins, headChance);
    return { power: base + heads * cp + lvBonus, icons, heads };
}

function buildHPBar(cur, max, len = 10) {
    const f = clamp(Math.round((cur / Math.max(1, max)) * len), 0, len);
    return '█'.repeat(f) + '░'.repeat(len - f);
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
        identities = party.map(s => !SINNERS[s] ? null : player.sinners?.[s]?.equippedIdentity || `LCB ${s}`).filter(Boolean);
    }
    if (!identities.length) {
        identities = SINNER_NAMES.slice(0, 4).map(s => `LCB ${s}`);
    }

    const allies = [];
    for (const identityName of identities) {
        const sinnerName = inferSinnerFromIdentity(identityName) || identityName.replace(/^LCB\s+/i, '');
        if (!SINNERS[sinnerName] || used.has(sinnerName)) continue;
        used.add(sinnerName);

        const s = SINNERS[sinnerName];
        const lv = player.identityLevels?.[identityName] || player.identityLevels?.[`LCB ${sinnerName}`] || 1;
        const uptie = player.sinners?.[sinnerName]?.uptie || 1;
        const maxHp = Math.max(1, s.hp + (lv - 1) * 3 + (uptie - 1) * 5);
        allies.push({ sinnerName, identityName, name: identityName, hp: maxHp, maxHp, defLevel: s.defLevel || 0, statuses: {}, lv, uptie });
        if (allies.length >= 6) break;
    }
    return allies;
}

function buildBattleEmbed(state, log = '') {
    const allyLines = state.ally.map(u => {
        const selected = state.pendingSkills?.[u.sinnerName] !== undefined;
        const icon = u.hp <= 0 ? '💀' : selected ? '✅' : '🟢';
        return `${icon} **${u.name}** \`${buildHPBar(u.hp, u.maxHp)}\` ${u.hp}/${u.maxHp} | ${formatStatuses(u.statuses)}`;
    });
    const e = state.enemy;
    const alive = state.ally.filter(u => u.hp > 0);
    const selected = Object.keys(state.pendingSkills || {}).filter(k => alive.some(u => u.sinnerName === k)).length;

    const embed = new EmbedBuilder()
        .setTitle(`⚔️ 第 ${state.turn} 回合 ｜ ${state.difficultyLabel}`)
        .setColor(e.hp <= 0 ? 0x2ed573 : alive.length === 0 ? 0xff4757 : 0x5865f2)
        .addFields(
            { name: `${e.attributeEmoji || '👹'} ${e.name} [${e.attribute || ''}]`, value: `\`${buildHPBar(e.hp, e.maxHp)}\` ${e.hp}/${e.maxHp} HP | ${formatStatuses(e.statuses)}`, inline: false },
            { name: '👥 我方隊伍', value: allyLines.join('\n') || '（無）', inline: false }
        );
    if (log) embed.addFields({ name: '📜 本回合記錄', value: log.slice(-900), inline: false });
    embed.setFooter({ text: `第 ${state.turn} 回合 ｜ 已選 ${selected}/${alive.length} ｜ ${SKILL_TIMEOUT / 1000}s 後自動執行` });
    return embed;
}

function buildSkillRow(activeUnit, disabled = false, restricted = false) {
    if (!activeUnit || activeUnit.hp <= 0) return null;
    const sinner = SINNERS[activeUnit.sinnerName];
    if (!sinner) return null;

    const skills = getSkillList(sinner);
    const buttons = skills.slice(0, restricted ? 2 : 3).map((sk, i) =>
        new ButtonBuilder()
            .setCustomId(`bs_${activeUnit.sinnerName}_${i}`)
            .setLabel(`${i + 1}.${sk.name}`.slice(0, 80))
            .setEmoji(TYPE_EMOJI[sk.type] || '⚔️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
    );
    buttons.push(
        new ButtonBuilder().setCustomId(`bs_${activeUnit.sinnerName}_defend`)
            .setLabel('🛡️ 防禦').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
    );
    return new ActionRowBuilder().addComponents(buttons);
}

// ─── !battle 主入口：難度選擇 UI ─────────────────────────────
async function handleBattle(client, message) {
    const args = message.content.trim().split(/\s+/);
    const tier = (args[1] || '').toLowerCase();

    if (DIFFICULTY[tier] && !['elite', 'boss', 'normal_md'].includes(tier)) {
        return startBattleFlow(client, message, tier);
    }

    const embed = new EmbedBuilder()
        .setTitle('⚔️ 出戰 — 選擇難度')
        .setColor(0x5865f2)
        .setDescription(
            '「主管，敵人的強度各有不同。請做好準備。」\n\n' +
            '🟢 **超簡單** — 🌙 狂氣 ×20\n' +
            '🟡 **簡單** — 🌙 狂氣 ×40\n' +
            '🟠 **一般** — 🌙 狂氣 ×70\n' +
            '🔴 **困難** — 🌙 狂氣 ×130\n' +
            '💀 **瘋狂** — 🌙 狂氣 ×200'
        ).setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bt_super_easy').setLabel('🟢 超簡單').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bt_easy').setLabel('🟡 簡單').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bt_normal').setLabel('🟠 一般').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bt_hard').setLabel('🔴 困難').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bt_insane').setLabel('💀 瘋狂').setStyle(ButtonStyle.Danger),
    );

    const reply = await message.reply({ embeds: [embed], components: [row] });
    const col = reply.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) { i.reply({ content: '❌ 這不是你的戰鬥指令。', ephemeral: true }); return false; }
            return i.customId.startsWith('bt_');
        },
        time: 30_000, max: 1,
    });

    col.on('collect', async i => {
        const selectedTier = i.customId.replace('bt_', '');
        await i.update({ components: [] }).catch(() => {});
        return startBattleFlow(client, message, selectedTier);
    });
    col.on('end', collected => { if (!collected.size) reply.edit({ components: [] }).catch(() => {}); });
}

// ─── 敵人選擇 UI ─────────────────────────────────────────────
async function startBattleFlow(client, message, tier) {
    const enemies = getEnemiesForTier(tier);
    if (!enemies.length) return startBattle(client, message, tier);

    // 最多顯示 5 個選項
    const options = enemies.slice(0, 5).map(e => ({
        label: `${e.attributeEmoji} ${e.name}`,
        description: `${e.attribute} ｜ HP ${e.hp} ｜ 防禦等級 ${e.defLevel}`,
        value: e.key,
    }));

    const menu = new StringSelectMenuBuilder()
        .setCustomId('bt_enemy_select')
        .setPlaceholder('🔍 選擇要挑戰的異想體...')
        .addOptions(options);

    const randomBtn = new ButtonBuilder()
        .setCustomId('bt_enemy_random')
        .setLabel('🎲 隨機敵人')
        .setStyle(ButtonStyle.Secondary);

    const diff = DIFFICULTY[tier] || DIFFICULTY.normal;
    const reply = await message.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`⚔️ ${diff.label} — 選擇異想體`)
            .setColor(0x5865f2)
            .setDescription(`難度：**${diff.label}**\n獎勵：🌙 狂氣 ×${diff.lunacyReward}\n\n請選擇你要挑戰的目標：`)
            .setTimestamp()],
        components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(randomBtn)],
    });

    const col = reply.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) { i.reply({ content: '❌ 這不是你的戰鬥指令。', ephemeral: true }); return false; }
            return true;
        },
        time: 30_000, max: 1,
    });

    col.on('collect', async i => {
        await i.update({ components: [] }).catch(() => {});
        if (i.customId === 'bt_enemy_random') {
            return startBattle(client, message, tier);
        }
        // 指定敵人
        const { ENEMIES } = require('./Data/EnemyData.js');
        const enemyKey = i.values?.[0];
        const enemyData = ENEMIES[enemyKey];
        return startBattle(client, message, tier, enemyData ? JSON.parse(JSON.stringify(enemyData)) : null);
    });

    col.on('end', collected => {
        if (!collected.size) {
            reply.edit({ components: [] }).catch(() => {});
        }
    });
}

// ─── 主戰鬥引擎 ─────────────────────────────────────────────
async function startBattle(client, message, tier = 'normal', presetEnemy = null) {
    const diff = DIFFICULTY[tier] || DIFFICULTY.normal;
    const player = getOrCreatePlayer(client, message.author.id, message.author.username);
    const allies = resolveBattleRoster(player);

    if (!allies.length) {
        return message.reply('❌ 隊伍是空的！先在 `!pack` → **⚔️ 出擊編成** 選好人格。');
    }

    let enemy = presetEnemy || randomEnemy(tier);
    enemy = {
        ...enemy,
        tier,
        attribute: enemy.attribute || '一般',
        attributeEmoji: enemy.attributeEmoji || '👹',
        maxHp: Math.max(1, Math.floor((enemy.hp || 1) * diff.enemyHpMult)),
        hp:    Math.max(1, Math.floor((enemy.hp || 1) * diff.enemyHpMult)),
        defLevel: Math.max(0, Math.floor((enemy.defLevel || 0) * diff.enemyAtkMult)),
        statuses: {},
    };

    const pendingSkills = {};
    const state = {
        userId: message.author.id, turn: 1, difficulty: tier,
        difficultyLabel: diff.label, ally: allies, enemy, pendingSkills,
    };

    const firstAlive = state.ally.find(u => u.hp > 0);
    const startMsg = `🔔 **戰鬥開始！** 遭遇 **${enemy.name}** [${enemy.attribute}]\n⏳ 請為 **${firstAlive?.name || '罪人'}** 選擇技能...`;
    const battleMsg = await message.reply({
        embeds: [buildBattleEmbed(state, startMsg)],
        components: [buildSkillRow(firstAlive, false, isBindRestricted(firstAlive))].filter(Boolean),
    });

    let turnTimer, finished = false;
    let resolvePromise;
    const battlePromise = new Promise(r => { resolvePromise = r; });

    function clearTurnTimer() { if (turnTimer) clearTimeout(turnTimer); turnTimer = null; }

    async function endBattle(win, lastLog = '') {
        if (finished) return;
        finished = true;
        clearTurnTimer();
        collector.stop('end');

        const p2 = getOrCreatePlayer(client, message.author.id, message.author.username);
        p2.totalBattles = (p2.totalBattles || 0) + 1;

        let desc = '';
        if (win) {
            p2.totalWins = (p2.totalWins || 0) + 1;
            p2.lunacy    = (p2.lunacy  || 0) + diff.lunacyReward;
            p2.thread    = (p2.thread  || 0) + diff.threadReward;
            desc = `🎉 **勝利！**\n🌙 狂氣 +${diff.lunacyReward} ｜ 🧵 紡錘 +${diff.threadReward}\n\n${lastLog.slice(-600)}`;
        } else {
            desc = `💀 **失敗...** 全員倒下或超時。\n\n${lastLog.slice(-600)}`;
        }

        savePlayerData(client, message.author.id, p2);

        await battleMsg.edit({
            embeds: [new EmbedBuilder()
                .setTitle(win ? '🏆 戰鬥勝利' : '💀 戰鬥失敗')
                .setColor(win ? 0x2ed573 : 0xff4757)
                .setDescription(desc).setTimestamp()],
            components: [],
        }).catch(() => {});

        resolvePromise({ win, lunacyReward: win ? diff.lunacyReward : 0, threadReward: win ? diff.threadReward : 0, tier, state });
    }

    async function processTurn() {
        if (finished) return;
        const logs = [];

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

            // 束縛：不能使用 S3（最後一個技能）
            const restricted = isBindRestricted(u);
            const maxSkillIdx = restricted ? skills.length - 2 : skills.length - 1;
            const actualIdx = (typeof skillIdx === 'number') ? Math.min(skillIdx, maxSkillIdx) : skillIdx;
            const mySkill = (actualIdx === 'defend' || actualIdx === undefined) ? null : skills[actualIdx];

            if (!mySkill) {
                const healed = Math.min(u.maxHp - u.hp, 5);
                u.hp += healed;
                if (restricted) logs.push(`⛓️ **${u.name}** 被束縛，強制防禦${healed > 0 ? `（回復 ${healed} HP）` : ''}`);
                else logs.push(`🛡️ **${u.name}** 防禦${healed > 0 ? `（回復 ${healed} HP）` : ''}`);
                continue;
            }

            const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
            const myRoll = resolveSkillPower(mySkill, u.lv, 0.5);
            const eRoll  = resolveSkillPower({ clashbase: eSkill.base ?? eSkill.clashbase ?? 0, coins: eSkill.coins ?? 1, clashpower: eSkill.coin ?? eSkill.clashpower ?? 0 }, 1, 0.5);
            const myWins = myRoll.power >= eRoll.power;

            logs.push(`${TYPE_EMOJI[mySkill.type] || ''}**${u.name}** ${mySkill.name} \`[${myRoll.power}]\` ${myRoll.icons.join('')}`);
            logs.push(`    ${myWins ? '◀勝▶' : '◀敗▶'} **${state.enemy.name}** ${eSkill.name} \`[${eRoll.power}]\` ${eRoll.icons.join('')}`);

            if (myWins) {
                const mult = getKnockdownMultiplier(state.enemy);
                const dmg = Math.max(1, Math.floor(((mySkill.attack || 1) - Math.floor((state.enemy.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3)) * mult));
                state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
                logs.push(`    💥 ${state.enemy.name} 受到 **${dmg}** 傷害`);

                // 流血在被攻擊時觸發（敵人出血）
                if ((state.enemy.statuses?.['流血'] || 0) > 0) {
                    const bleedDmg = state.enemy.statuses['流血'];
                    state.enemy.hp = Math.max(0, state.enemy.hp - bleedDmg);
                    state.enemy.statuses['流血'] = Math.max(0, state.enemy.statuses['流血'] - 1);
                    logs.push(`    🩸 出血 → ${state.enemy.name} 額外受到 ${bleedDmg} 傷害`);
                }

                if (mySkill.effect) {
                    applyStatus(state.enemy, mySkill.effect.name, mySkill.effect.stacks || 1);
                    logs.push(`    ➕ 附加 ${mySkill.effect.name}×${mySkill.effect.stacks || 1}`);
                }

                // 破裂觸發
                const ruptureLogs = processOnHit(state.enemy, dmg);
                ruptureLogs.forEach(l => logs.push(`    ${l}`));
            } else {
                const mult = getKnockdownMultiplier(u);
                const dmg = Math.max(1, Math.floor(((eSkill.base ?? eSkill.clashbase ?? 1) - Math.floor((u.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3)) * mult));
                u.hp = Math.max(0, u.hp - dmg);
                logs.push(`    💥 ${u.name} 受到 **${dmg}** 傷害`);

                // 敵方技能效果
                if (eSkill.effect) {
                    applyStatus(u, eSkill.effect.name, eSkill.effect.stacks || 1);
                    logs.push(`    ➕ ${u.name} 附加 ${eSkill.effect.name}×${eSkill.effect.stacks || 1}`);
                }
            }
        }

        // 敵人額外攻擊未選技能的隊員
        if (state.enemy.hp > 0) {
            const target = state.ally.filter(u => u.hp > 0 && pendingSkills[u.sinnerName] === undefined)[0]
                        || state.ally.filter(u => u.hp > 0)[0];
            if (target) {
                const eSkill = state.enemy.skills[Math.floor(Math.random() * state.enemy.skills.length)];
                const mult = getKnockdownMultiplier(target);
                const dmg = Math.max(1, Math.floor(((eSkill.base ?? eSkill.clashbase ?? 1) - Math.floor((target.defLevel || 0) * 0.2) + Math.floor(Math.random() * 3)) * mult));
                target.hp = Math.max(0, target.hp - dmg);
                logs.push(`👹 **${state.enemy.name}** 對 **${target.name}** 發動 ${eSkill.name}，造成 **${dmg}** 傷害`);
                if (eSkill.effect) {
                    applyStatus(target, eSkill.effect.name, eSkill.effect.stacks || 1);
                    logs.push(`    ➕ 附加 ${eSkill.effect.name}×${eSkill.effect.stacks || 1}`);
                }
            }
        }

        // 回合結束：處理燃燒、震顫、沉沒等
        state.ally.forEach(u => {
            if (u.hp <= 0) return;
            const r = processTurnEnd(u);
            r.forEach(l => logs.push(l));
        });
        {
            const r = processTurnEnd(state.enemy);
            r.forEach(l => logs.push(l));
        }

        Object.keys(pendingSkills).forEach(k => delete pendingSkills[k]);
        state.turn += 1;

        const aliveAllies = state.ally.filter(u => u.hp > 0);
        if (state.enemy.hp <= 0) return endBattle(true, logs.join('\n'));
        if (!aliveAllies.length) return endBattle(false, logs.join('\n'));

        const nextUnit = aliveAllies[0];
        await battleMsg.edit({
            embeds: [buildBattleEmbed(state, logs.join('\n'))],
            components: [buildSkillRow(nextUnit, false, isBindRestricted(nextUnit))].filter(Boolean),
        }).catch(() => {});
    }

    const collector = battleMsg.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) { i.reply({ content: '❌ 這不是你的戰鬥。', ephemeral: true }); return false; }
            return i.customId.startsWith('bs_');
        },
        time: 10 * 60_000,
    });

    turnTimer = setTimeout(() => processTurn().catch(console.error), SKILL_TIMEOUT);

    collector.on('collect', async interaction => {
        const parts = interaction.customId.split('_');
        const sinnerName = parts[1];
        const skillPart  = parts[2];

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
            const nextUnit  = remaining[0];
            await battleMsg.edit({
                embeds: [buildBattleEmbed(state, `✅ **${sinnerName}** 已選（${aliveAllies.length - remaining.length}/${aliveAllies.length}）\n⏳ 請為 **${nextUnit?.name || '下一位'}** 選擇技能...`)],
                components: [buildSkillRow(nextUnit, false, isBindRestricted(nextUnit))].filter(Boolean),
            }).catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        clearTurnTimer();
        if (!finished) {
            if (reason !== 'end') await endBattle(false, '⏰ 戰鬥超時。').catch(() => {});
            else { await battleMsg.edit({ components: [] }).catch(() => {}); resolvePromise({ win: false, lunacyReward: 0, threadReward: 0, tier, state }); }
        }
    });

    return battlePromise;
}

module.exports = { handleBattle, startBattle };
