// Functions/GameSystem/MarriageSystem.js 
'use strict';

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLanguage } = require('./LanguageSystem.js');

const DATA_PATH = path.join(process.cwd(), 'data', 'marriages.json');
const SUPER_ADMIN_ID = '1330463890122735642';
const REQUEST_TTL = 7 * 24 * 60 * 60 * 1000;

function load() {
    try {
        if (!fs.existsSync(DATA_PATH)) return { marriages: [], pending: [] };
        const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
        return {
            marriages: Array.isArray(data.marriages) ? data.marriages : [],
            pending:   Array.isArray(data.pending)   ? data.pending   : [],
        };
    } catch {
        return { marriages: [], pending: [] };
    }
}

function save(data) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function pairKey(a, b) {
    return [String(a), String(b)].sort().join(':');
}

function getMarriages(userId) {
    return load().marriages.filter(m => m.a === userId || m.b === userId);
}

function partnerId(m, userId) {
    return m.a === userId ? m.b : m.a;
}

function cleanExpired(data) {
    const now = Date.now();
    data.pending = data.pending.filter(r => now - Number(r.createdAt) < REQUEST_TTL);
    return data;
}

function resolveUser(interaction, raw) {
    const text = String(raw || '').trim();
    const id = text.match(/^<@!?(\d+)>$/)?.[1] || text.match(/^(\d{10,})$/)?.[1];
    if (id) {
        return interaction.client.users.cache.get(id)
            || interaction.guild?.members?.cache.get(id)?.user
            || null;
    }
    return interaction.guild?.members?.cache.find(m =>
        m.user.username.toLowerCase() === text.toLowerCase() ||
        m.displayName.toLowerCase() === text.toLowerCase()
    )?.user || null;
}

function displayPartners(client, userId, language) {
    const names = getMarriages(userId).map(m => {
        const id = partnerId(m, userId);
        const user = client.users.cache.get(id);
        const date = new Date(m.createdAt).toLocaleString(
            language === 'en' ? 'en-US' : 'zh-TW',
            { timeZone: 'Asia/Taipei' }
        );
        return `<@${id}> (${user?.username || id}) — ${date}`;
    });
    return names.length
        ? names.join('\n')
        : (language === 'en' ? 'No marriage records.' : '目前沒有婚姻紀錄。');
}

function requestEmbed(client, from, to, language) {
    const en = language === 'en';
    const fromPartners = getMarriages(from.id).map(m => `<@${partnerId(m, from.id)}>`).join(', ') || (en ? 'None' : '無');
    const toPartners   = getMarriages(to.id).map(m   => `<@${partnerId(m, to.id)}>`).join(', ')   || (en ? 'None' : '無');
    return new EmbedBuilder()
        .setColor(0xff6b9a)
        .setTitle(en ? '💍 Marriage Request' : '💍 結婚請求')
        .setDescription(en
            ? `<@${from.id}> wants to marry <@${to.id}>.`
            : `<@${from.id}> 想和 <@${to.id}> 結婚。`)
        .addFields(
            { name: en ? "Requester's current spouses"  : '發送者目前的配偶', value: String(fromPartners), inline: false },
            { name: en ? "Recipient's current spouses"  : '接收者目前的配偶', value: String(toPartners),   inline: false },
        )
        .setFooter({ text: en ? 'This is a multi-marriage system.' : '本系統允許多重婚姻。' })
        .setTimestamp();
}

function addMarriage(a, b) {
    const data = cleanExpired(load());
    if (a === b) return false;
    if (data.marriages.some(m => pairKey(m.a, m.b) === pairKey(a, b))) return false;
    data.marriages.push({ a, b, createdAt: Date.now() });
    data.pending = data.pending.filter(r => !(r.from === a && r.to === b));
    save(data);
    return true;
}

function removeMarriage(a, b) {
    const data = load();
    const before = data.marriages.length;
    data.marriages = data.marriages.filter(m => pairKey(m.a, m.b) !== pairKey(a, b));
    save(data);
    return before !== data.marriages.length;
}

async function handleMarry(client, interaction) {
    const raw = interaction.options?.getString('target');
    const language = getLanguage(interaction.user.id);

    if (!raw || raw.toLowerCase() === 'status' || raw.toLowerCase() === 'staus') {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xff6b9a)
                .setTitle(language === 'en' ? '💍 Your Marriages' : '💍 你的婚姻')
                .setDescription(displayPartners(client, interaction.user.id, language))
                .setTimestamp()],
        });
    }

    const target = resolveUser(interaction, raw);
    if (!target || target.bot || target.id === interaction.user.id) {
        return interaction.reply({
            content: language === 'en' ? 'Please mention another human user.' : '請標記其他使用者。',
            ephemeral: true,
        });
    }

    const data = cleanExpired(load());
    if (data.marriages.some(m => pairKey(m.a, m.b) === pairKey(interaction.user.id, target.id))) {
        return interaction.reply({
            content: language === 'en' ? 'You are already married to this user.' : '你已經和這位使用者結婚了。',
            ephemeral: true,
        });
    }

    if (interaction.user.id === SUPER_ADMIN_ID) {
        addMarriage(interaction.user.id, target.id);
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(0xffd166)
                .setTitle(language === 'en' ? '💍 Marriage Registered' : '💍 結婚登記完成')
                .setDescription(language === 'en'
                    ? `<@${interaction.user.id}> used the administrator privilege to marry <@${target.id}> without an approval step.`
                    : `<@${interaction.user.id}> 使用主管特權，無需同意即可和 <@${target.id}> 結婚。`)
                .setTimestamp()],
        });
    }

    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    data.pending.push({
        id: requestId,
        from: interaction.user.id,
        to: target.id,
        guildId: interaction.guildId,
        createdAt: Date.now(),
    });
    save(data);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('marry:accept:' + requestId).setLabel(language === 'en' ? 'Accept' : '同意').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('marry:decline:' + requestId).setLabel(language === 'en' ? 'Decline' : '拒絕').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({
        embeds: [requestEmbed(client, interaction.user, target, language)],
        components: [row],
    });
}

async function handleMarriageButton(client, interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const id = parts[2];
    const data = cleanExpired(load());
    const request = data.pending.find(r => r.id === id);

    if (!request) return interaction.reply({ content: '這個結婚請求已過期。', ephemeral: true });
    if (interaction.user.id !== request.to) return interaction.reply({ content: '只有被求婚的人可以處理這個請求。', ephemeral: true });

    data.pending = data.pending.filter(r => r.id !== id);

    if (action === 'accept') {
        if (!data.marriages.some(m => pairKey(m.a, m.b) === pairKey(request.from, request.to))) {
            data.marriages.push({ a: request.from, b: request.to, createdAt: Date.now() });
        }
        save(data);
        return interaction.update({ content: '💍 結婚請求已同意。', embeds: [], components: [] });
    }

    save(data);
    return interaction.update({ content: '💔 結婚請求已拒絕。', embeds: [], components: [] });
}

async function handleDivorce(client, interaction) {
    const language = getLanguage(interaction.user.id);
    const raw = interaction.options?.getString('target');
    let target = raw ? resolveUser(interaction, raw) : null;
    const spouses = getMarriages(interaction.user.id);

    if (raw && !target) return interaction.reply({ content: language === 'en' ? 'Could not find that user.' : '找不到這位使用者。', ephemeral: true });
    if (!spouses.length) return interaction.reply({ content: language === 'en' ? 'You are not married.' : '你目前沒有婚姻紀錄。', ephemeral: true });

    if (!target && spouses.length > 1) {
        const buttons = spouses.slice(0, 5).map(m => {
            const id = partnerId(m, interaction.user.id);
            return new ButtonBuilder()
                .setCustomId('divorce:choose:' + interaction.user.id + ':' + id)
                .setLabel((client.users.cache.get(id)?.username || id).slice(0, 80))
                .setStyle(ButtonStyle.Danger);
        });
        return interaction.reply({
            content: language === 'en' ? 'Choose a spouse to divorce:' : '請選擇要離婚的配偶：',
            components: [new ActionRowBuilder().addComponents(buttons)],
            ephemeral: true,
        });
    }

    if (!target) target = client.users.cache.get(partnerId(spouses[0], interaction.user.id));
    if (!target || !removeMarriage(interaction.user.id, target.id)) {
        return interaction.reply({ content: language === 'en' ? 'No marriage with that user.' : '沒有找到和這位使用者的婚姻。', ephemeral: true });
    }

    return interaction.reply({
        content: language === 'en' ? `💔 Divorce completed with <@${target.id}>.` : `💔 已和 <@${target.id}> 離婚。`,
    });
}

async function handleDivorceButton(client, interaction) {
    const parts = interaction.customId.split(':');
    const owner = parts[2];
    const spouse = parts[3];

    if (interaction.user.id !== owner) {
        return interaction.reply({ content: '這不是你的離婚選單。', ephemeral: true });
    }

    removeMarriage(owner, spouse);
    return interaction.update({ content: '💔 離婚完成。', components: [] });
}

module.exports = {
    handleMarry,
    handleMarriageButton,
    handleDivorce,
    handleDivorceButton,
    getMarriages,
    addMarriage,
    removeMarriage,
};
