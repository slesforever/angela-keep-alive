// Functions/GameSystem/PartySystem.js
'use strict';

const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');

const { SINNERS, SINNER_NAMES } = require('./Data/SinnersData.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');

const MAX_PARTY = 6;
const PAGE_SIZE = 10;

function cleanName(name) {
    return String(name || '')
        .trim()
        .replace(/^["'「『【\[]|["'」』】\]]$/g, '')
        .trim();
}

function inferSinnerKey(text) {
    const value = cleanName(text);
    if (!value) return null;
    if (SINNERS[value]) return value;
    return SINNER_NAMES.find(n => value.includes(n)) || null;
}

function ownedIdentities(player) {
    return Array.isArray(player?.identities) ? player.identities : [];
}

function getOwnedSinners(player) {
    return [...new Set(ownedIdentities(player).map(inferSinnerKey).filter(Boolean))];
}

function teamIdentityList(player) {
    return Array.isArray(player?.team) ? player.team.filter(Boolean) : [];
}

function teamSinnerList(player) {
    return [...new Set(teamIdentityList(player).map(inferSinnerKey).filter(Boolean))];
}

function syncPartyFromTeam(player) {
    player.party = teamSinnerList(player);
    return player;
}

function getEquippedIdentity(player, sinnerName) {
    return player?.sinners?.[sinnerName]?.equippedIdentity || `LCB ${sinnerName}`;
}

function getOwnedIdentityOptionsForSinner(player, sinnerName) {
    return ownedIdentities(player).filter(id => inferSinnerKey(id) === sinnerName);
}

function buildOverviewEmbed(player, note = '') {
    const team = teamIdentityList(player);
    const lines = team.length
        ? team.map((id, idx) => {
            const sinner = inferSinnerKey(id) || '未知罪人';
            const equipped = getEquippedIdentity(player, sinner);
            return `${idx + 1}. **${id}** ｜ 罪人：${sinner} ｜ 裝備：${equipped}`;
        }).join('\n')
        : '（尚未編成）';

    const party = teamSinnerList(player);
    const footer = `${party.length}/${MAX_PARTY} ｜ 同一罪人不可重複`;

    const embed = new EmbedBuilder()
        .setTitle('⚔️ 出擊隊伍編成')
        .setColor(0x5865f2)
        .setDescription(
            '先選罪人，再選該罪人的已持有人格。\n' +
            '未持有的人格不會出現在清單內。'
        )
        .addFields(
            { name: '👥 當前隊伍', value: lines, inline: false },
            { name: '🧩 已選罪人', value: party.length ? party.join('、') : '（無）', inline: false },
        )
        .setFooter({ text: footer })
        .setTimestamp();

    if (note) {
        embed.addFields({ name: '📌 狀態', value: note, inline: false });
    }

    return embed;
}

function buildOverviewRows() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('party_build').setLabel('⚔️ 編成 / 更換').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('party_remove').setLabel('🗑️ 移除成員').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('party_clear').setLabel('🧹 清空隊伍').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Secondary),
        )
    ];
}

function buildSinnerSelectRows(player) {
    const owned = getOwnedSinners(player);

    if (!owned.length) {
        return {
            embeds: [new EmbedBuilder()
                .setTitle('⚔️ 出擊隊伍編成')
                .setColor(0x57606f)
                .setDescription('你目前沒有任何已持有的人格可用來編成。')],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
                )
            ],
        };
    }

    const opts = owned.slice(0, 25).map(sinner => {
        const count = ownedIdentities(player).filter(id => inferSinnerKey(id) === sinner).length;
        return {
            label: sinner.slice(0, 25),
            description: `已持有人格 ${count} 件`,
            value: sinner,
        };
    });

    const menu = new StringSelectMenuBuilder()
        .setCustomId('party_sinner_select')
        .setPlaceholder('先選擇罪人...')
        .addOptions(opts);

    return {
        embeds: [new EmbedBuilder()
            .setTitle('⚔️ 出擊隊伍編成 — 罪人選擇')
            .setColor(0x2ed573)
            .setDescription('先選擇要編成的罪人。')],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
            ),
        ],
    };
}

function buildIdentityPickerRows(player, sinnerName, page = 0) {
    const owned = getOwnedIdentityOptionsForSinner(player, sinnerName);

    if (!owned.length) {
        return {
            embeds: [new EmbedBuilder()
                .setTitle(`⚔️ 出擊隊伍編成 — ${sinnerName}`)
                .setColor(0x57606f)
                .setDescription(`你沒有任何屬於 **${sinnerName}** 的人格。`)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
                )
            ],
        };
    }

    const totalPages = Math.max(1, Math.ceil(owned.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const chunk = owned.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

    const opts = chunk.map(id => {
        const lv = player.identityLevels?.[id] || 1;
        return {
            label: id.slice(0, 25),
            description: `Lv.${lv} ｜ ${inferSinnerKey(id) || sinnerName}`,
            value: id.slice(0, 100),
        };
    });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`party_identity_select:${sinnerName}:${safePage}`)
        .setPlaceholder(`選擇 ${sinnerName} 的人格...`)
        .addOptions(opts);

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`party_page_prev:${sinnerName}:${safePage}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage <= 0),
        new ButtonBuilder()
            .setCustomId(`party_page_next:${sinnerName}:${safePage}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(safePage >= totalPages - 1),
        new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
    );

    return {
        embeds: [new EmbedBuilder()
            .setTitle(`⚔️ 出擊隊伍編成 — ${sinnerName}`)
            .setColor(0xffd166)
            .setDescription(
                `請從 **${sinnerName}** 的已持有人格中選擇 1 名。\n` +
                `分頁：${safePage + 1}/${totalPages}`
            )],
        components: [
            new ActionRowBuilder().addComponents(menu),
            navRow,
        ],
    };
}

function buildRemoveRows(player) {
    const team = teamIdentityList(player);
    const sinners = teamSinnerList(player);

    if (!sinners.length) {
        return {
            embeds: [new EmbedBuilder()
                .setTitle('🗑️ 移除成員')
                .setColor(0x57606f)
                .setDescription('目前隊伍是空的。')],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
                )
            ],
        };
    }

    const opts = sinners.slice(0, 25).map(s => ({
        label: s.slice(0, 25),
        description: `隊伍中的罪人`,
        value: s,
    }));

    const menu = new StringSelectMenuBuilder()
        .setCustomId('party_remove_select')
        .setPlaceholder('選擇要移除的罪人...')
        .addOptions(opts);

    return {
        embeds: [new EmbedBuilder()
            .setTitle('🗑️ 移除成員')
            .setColor(0xff4757)
            .setDescription('選擇一個罪人，會把該罪人對應的人格從隊伍中移除。')],
        components: [
            new ActionRowBuilder().addComponents(menu),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('party_back').setLabel('↩ 返回').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('party_close').setLabel('✖ 關閉').setStyle(ButtonStyle.Danger),
            ),
        ],
    };
}

function getReplyTarget(target) {
    if (target && typeof target.followUp === 'function' && typeof target.deferUpdate === 'function') {
        return 'interaction';
    }
    return 'message';
}

async function sendPartyUI(target, payload) {
    if (getReplyTarget(target) === 'interaction') {
        try { await target.deferUpdate(); } catch {}
        return target.followUp({ ...payload, fetchReply: true });
    }
    return target.reply(payload);
}

function setTeamIdentity(player, sinnerName, identityName) {
    const team = teamIdentityList(player);
    const currentSinners = teamSinnerList(player);
    const alreadyHasSinner = currentSinners.includes(sinnerName);

    const nextTeam = team.filter(id => inferSinnerKey(id) !== sinnerName);

    if (!alreadyHasSinner && nextTeam.length >= MAX_PARTY) {
        const err = new Error(`隊伍已滿（${MAX_PARTY}人上限）`);
        err.code = 'TEAM_FULL';
        throw err;
    }

    nextTeam.push(identityName);
    player.team = nextTeam;
    syncPartyFromTeam(player);

    return player;
}

function removeSinnerFromTeam(player, sinnerName) {
    player.team = teamIdentityList(player).filter(id => inferSinnerKey(id) !== sinnerName);
    syncPartyFromTeam(player);
    return player;
}

function clearTeam(player) {
    player.team = [];
    player.party = [];
    return player;
}

async function showPartyUI(client, target, userId, username) {
    const player = getOrCreatePlayer(client, userId, username);
    syncPartyFromTeam(player);

    const initial = {
        embeds: [buildOverviewEmbed(player)],
        components: buildOverviewRows(),
    };

    const uiMsg = await sendPartyUI(target, initial);

    const collector = uiMsg.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 10 * 60_000,
    });

    let view = { mode: 'overview', sinner: null, page: 0 };

    async function render() {
        const p = getOrCreatePlayer(client, userId, username);
        syncPartyFromTeam(p);

        let payload;
        if (view.mode === 'overview') {
            payload = {
                embeds: [buildOverviewEmbed(p)],
                components: buildOverviewRows(),
            };
        } else if (view.mode === 'choose_sinner') {
            payload = buildSinnerSelectRows(p);
        } else if (view.mode === 'choose_identity') {
            payload = buildIdentityPickerRows(p, view.sinner, view.page || 0);
        } else if (view.mode === 'remove') {
            payload = buildRemoveRows(p);
        } else {
            payload = {
                embeds: [buildOverviewEmbed(p)],
                components: buildOverviewRows(),
            };
        }

        await uiMsg.edit(payload).catch(() => {});
    }

    collector.on('collect', async ix => {
        const customId = ix.customId;

        if (customId === 'party_back') {
            view = { mode: 'overview', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            return render();
        }

        if (customId === 'party_close') {
            await ix.deferUpdate().catch(() => {});
            collector.stop('closed');
            return uiMsg.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('⚔️ 出擊隊伍編成')
                    .setColor(0x57606f)
                    .setDescription('已關閉。')],
                components: [],
            }).catch(() => {});
        }

        if (customId === 'party_build') {
            view = { mode: 'choose_sinner', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            return render();
        }

        if (customId === 'party_remove') {
            view = { mode: 'remove', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            return render();
        }

        if (customId === 'party_clear') {
            const p = getOrCreatePlayer(client, userId, username);
            clearTeam(p);
            savePlayerData(client, userId, p);
            view = { mode: 'overview', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            await render();
            return uiMsg.channel.send(`✅ **${username}** 的隊伍已清空。`).catch(() => {});
        }

        if (customId === 'party_sinner_select') {
            const sinner = ix.values[0];
            view = { mode: 'choose_identity', sinner, page: 0 };
            await ix.deferUpdate().catch(() => {});
            return render();
        }

        if (customId.startsWith('party_page_prev:') || customId.startsWith('party_page_next:')) {
            const [, sinner, pageStr] = customId.split(':');
            const currentPage = parseInt(pageStr, 10) || 0;
            view = {
                mode: 'choose_identity',
                sinner,
                page: customId.startsWith('party_page_prev:') ? Math.max(0, currentPage - 1) : currentPage + 1,
            };
            await ix.deferUpdate().catch(() => {});
            return render();
        }

        if (customId.startsWith('party_identity_select:')) {
            const [, sinner, pageStr] = customId.split(':');
            const picked = ix.values[0];
            const p = getOrCreatePlayer(client, userId, username);

            if (inferSinnerKey(picked) !== sinner) {
                return ix.reply({ content: '❌ 這個人格不屬於你剛剛選的罪人。', ephemeral: true });
            }

            const team = teamIdentityList(p);
            const currentSinners = teamSinnerList(p);
            const alreadyHasSinner = currentSinners.includes(sinner);

            if (!alreadyHasSinner && currentSinners.length >= MAX_PARTY) {
                return ix.reply({ content: `❌ 隊伍已滿（最多 ${MAX_PARTY} 名罪人）。`, ephemeral: true });
            }

            setTeamIdentity(p, sinner, picked);
            savePlayerData(client, userId, p);

            view = { mode: 'overview', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            await render();
            return uiMsg.channel.send(
                `✅ **${sinner}** 已編入：**${picked}**`
            ).catch(() => {});
        }

        if (customId === 'party_remove_select') {
            const sinner = ix.values[0];
            const p = getOrCreatePlayer(client, userId, username);
            removeSinnerFromTeam(p, sinner);
            savePlayerData(client, userId, p);

            view = { mode: 'overview', sinner: null, page: 0 };
            await ix.deferUpdate().catch(() => {});
            await render();
            return uiMsg.channel.send(`✅ **${sinner}** 已從隊伍移除。`).catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'closed') return;
        await uiMsg.edit({ components: [] }).catch(() => {});
    });

    return uiMsg;
}

async function handleParty(client, message) {
    const args = message.content.trim().split(/\s+/);
    const sub = args[1];

    if (!sub || sub === 'ui' || sub === '編成') {
        return showPartyUI(client, message, message.author.id, message.author.username);
    }

    if (sub === 'add' || sub === '加入') {
        const name = cleanName(args.slice(2).join(' '));
        const sinner = inferSinnerKey(name);
        if (!sinner) return message.reply(`❌ 找不到「${name}」\n可用：${SINNER_NAMES.join('、')}`);

        const player = getOrCreatePlayer(client, message.author.id, message.author.username);
        const current = teamSinnerList(player);
        if (current.includes(sinner)) return message.reply(`「${sinner}」已在隊伍中。`);
        if (current.length >= MAX_PARTY) return message.reply(`❌ 隊伍已滿（${MAX_PARTY}人上限）。`);

        const owned = getOwnedIdentityOptionsForSinner(player, sinner);
        if (!owned.length) return message.reply(`❌ 你沒有任何屬於「${sinner}」的人格。`);

        setTeamIdentity(player, sinner, owned[0]);
        savePlayerData(client, message.author.id, player);
        return message.reply(`✅ 「**${sinner}**」已加入隊伍，預設使用：**${owned[0]}**`);
    }

    if (sub === 'remove' || sub === '移除') {
        const name = cleanName(args.slice(2).join(' '));
        const sinner = inferSinnerKey(name);
        if (!sinner) return message.reply(`❌ 找不到「${name}」`);
        const player = getOrCreatePlayer(client, message.author.id, message.author.username);
        removeSinnerFromTeam(player, sinner);
        savePlayerData(client, message.author.id, player);
        return message.reply(`✅ 「**${sinner}**」已移出隊伍。`);
    }

    if (sub === 'set' || sub === '設定') {
        const raw = args.slice(2).join(' ');
        const names = raw.split(/[,，]/).map(cleanName).filter(Boolean);
        if (!names.length) return message.reply(`❌ 請輸入隊伍名單。\n格式：\`!party set 李箱,浮士德,...\``);

        const sinners = names.map(inferSinnerKey);
        const invalid = names.filter((_, i) => !sinners[i]);
        if (invalid.length) return message.reply(`❌ 找不到：${invalid.join('、')}\n可用：${SINNER_NAMES.join('、')}`);

        const unique = [...new Set(sinners)];
        if (unique.length !== sinners.length) return message.reply('❌ 不能有重複的罪人！');
        if (unique.length > MAX_PARTY) return message.reply(`❌ 最多 ${MAX_PARTY} 名成員。`);

        const player = getOrCreatePlayer(client, message.author.id, message.author.username);
        const nextTeam = [];

        for (const sinner of unique) {
            const owned = getOwnedIdentityOptionsForSinner(player, sinner);
            if (!owned.length) {
                return message.reply(`❌ 你沒有任何屬於「${sinner}」的人格。`);
            }
            nextTeam.push(owned[0]);
        }

        player.team = nextTeam;
        syncPartyFromTeam(player);
        savePlayerData(client, message.author.id, player);

        return message.reply(`✅ 隊伍已設定：${unique.join('、')}（${unique.length}/${MAX_PARTY}）`);
    }

    if (sub === 'clear' || sub === '清空') {
        const player = getOrCreatePlayer(client, message.author.id, message.author.username);
        clearTeam(player);
        savePlayerData(client, message.author.id, player);
        return message.reply('✅ 隊伍已清空。');
    }

    return showPartyUI(client, message, message.author.id, message.author.username);
}

module.exports = {
    handleParty,
    showPartyUI,
};
