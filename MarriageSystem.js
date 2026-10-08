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
    const fromAvatar = from.displayAvatarURL({ dynamic: true, size: 128 });
    const toAvatar = to.displayAvatarURL({ dynamic: true, size: 128 });
    return new EmbedBuilder()
        .setColor(0xe91e63)
        .setTitle(en ? '\u200b💍 Marriage Request\u200b' : '\u200b💍 結婚請求\u200b')
        .setThumbnail(fromAvatar)
        .setDescription(en
            ? `### 💕 <@${from.id}> wants to marry <@${to.id}>!\n\nA new bond is about to be formed. Will you accept?`
            : `### 💕 <@${from.id}> 想和 <@${to.id}> 結婚！\n\n一段新的羈絆即將建立。你願意接受嗎？`)
        .addFields(
            { name: en ? "💝 Requester's current spouses"  : '💝 發送者目前的配偶', value: String(fromPartners), inline: true },
            { name: en ? "💝 Recipient's current spouses"  : '💝 接收者目前的配偶', value: String(toPartners),   inline: true },
        )
        .setImage(toAvatar)
        .setFooter({ text: en ? 'This is a multi-marriage system. Click the button below to respond.' : '本系統允許多重婚姻。點擊下方按鈕來回應。' })
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
    const subcommand = interaction.options?.getSubcommand?.(false) || 'status';
    const targetOption = subcommand === 'request'
        ? interaction.options?.getUser('target')
        : null;
    const language = getLanguage(interaction.user.id);

    if (subcommand === 'status' || !targetOption) {
        const spouses = getMarriages(interaction.user.id);
        const en = language === 'en';
        const embed = new EmbedBuilder()
            .setColor(0xe91e63)
            .setTitle(en ? '💍 Your Marriages' : '💍 你的婚姻')
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }));

        if (spouses.length) {
            const lines = spouses.map(m => {
                const id = partnerId(m, interaction.user.id);
                const user = client.users.cache.get(id);
                const days = Math.floor((Date.now() - m.createdAt) / (24 * 60 * 60 * 1000));
                const date = new Date(m.createdAt).toLocaleDateString(
                    en ? 'en-US' : 'zh-TW',
                    { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric' }
                );
                return `### 💕 <@${id}>${user ? ` (${user.username})` : ''}\n📅 ${date} ｜ ❤️ ${en ? `Day ${days}` : `第 ${days} 天`}`;
            });
            embed.setDescription(lines.join('\n\n'));
        } else {
            embed.setDescription(en ? '*You are not married yet. Use `/marry request` to send a marriage request!*' : '*你還沒有結婚。使用 `/marry request` 發送結婚請求吧！*');
        }

        return interaction.reply({ embeds: [embed.setTimestamp()] });
    }

    const target = targetOption;
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

    if (data.pending.some(r => r.from === interaction.user.id && r.to === target.id)) {
        return interaction.reply({
            content: language === 'en' ? 'A marriage request is already waiting for this user.' : '你已經向這位使用者發送過結婚請求，請等待對方處理。',
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
                    ? `### 💕 <@${interaction.user.id}> & <@${target.id}>\n\nThe administrator privilege was used to register this marriage without an approval step.`
                    : `### 💕 <@${interaction.user.id}> & <@${target.id}>\n\n使用主管特權，無需同意即可完成結婚登記。`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
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
        new ButtonBuilder().setCustomId('marry:accept:' + requestId).setLabel(language === 'en' ? '💕 Accept' : '💕 同意').setStyle(ButtonStyle.Success).setEmoji('💕'),
        new ButtonBuilder().setCustomId('marry:decline:' + requestId).setLabel(language === 'en' ? '💔 Decline' : '💔 拒絕').setStyle(ButtonStyle.Danger).setEmoji('💔'),
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
    let target = interaction.options?.getUser('target') || null;
    const spouses = getMarriages(interaction.user.id);
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

// ─── 結婚週年紀念 LightSeeds 獎勵 ───────────────────────────────
const ANNIVERSARY_REWARDS = {
    7:   { lightSeeds: 100,  label: '一週年', labelEn: '1 Week' },
    30:  { lightSeeds: 500,  label: '一個月', labelEn: '1 Month' },
    90:  { lightSeeds: 1500, label: '三個月', labelEn: '3 Months' },
    180: { lightSeeds: 3000, label: '半年', labelEn: '6 Months' },
    365: { lightSeeds: 10000, label: '一週年', labelEn: '1 Year' },
};

const ANNIVERSARY_STATE_PATH = path.join(process.cwd(), 'data', 'anniversary-state.json');

function loadAnniversaryState() {
    try {
        if (!fs.existsSync(ANNIVERSARY_STATE_PATH)) return {};
        return JSON.parse(fs.readFileSync(ANNIVERSARY_STATE_PATH, 'utf8'));
    } catch { return {}; }
}

function saveAnniversaryState(state) {
    try {
        fs.mkdirSync(path.dirname(ANNIVERSARY_STATE_PATH), { recursive: true });
        fs.writeFileSync(ANNIVERSARY_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) { console.error('[Marriage] 儲存週年狀態失敗:', err.message); }
}

async function checkAnniversaries(client) {
    const data = load();
    const state = loadAnniversaryState();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    let awarded = 0;

    for (const m of data.marriages) {
        const days = Math.floor((Date.now() - m.createdAt) / (24 * 60 * 60 * 1000));
        const reward = ANNIVERSARY_REWARDS[days];
        if (!reward) continue;

        const pairKeyStr = pairKey(m.a, m.b);
        const stateKey = `${pairKeyStr}:${days}`;
        if (state[stateKey] === today) continue;
        state[stateKey] = today;

        try {
            const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
            for (const uid of [m.a, m.b]) {
                const user = client.users.cache.get(uid);
                const player = getOrCreatePlayer(client, uid, user?.username || 'Player');
                player.lightSeeds = (Number(player.lightSeeds) || 0) + reward.lightSeeds;
                savePlayerData(client, uid, player);
            }

            const { getLevelChannel } = require('./LevelSystem.js');
            for (const guild of client.guilds.cache.values()) {
                const channelId = getLevelChannel(guild.id);
                if (!channelId) continue;
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;
                await channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0xff6b9a)
                        .setTitle(`💝 ${reward.label} / ${reward.labelEn}!`)
                        .setDescription(
                            `🎉 <@${m.a}> & <@${m.b}> ${reward.labelEn === '1 Week' ? 'have been married for a week!' : reward.labelEn === '1 Month' ? 'have been married for a month!' : reward.labelEn === '3 Months' ? 'have been married for 3 months!' : reward.labelEn === '6 Months' ? 'have been married for 6 months!' : 'have been married for a full year!'}\n\n` +
                            `🌱 Each receives **${reward.lightSeeds.toLocaleString()}** LightSeeds!`
                        )
                        .setTimestamp()]
                }).catch(() => {});
                break;
            }
            awarded++;
        } catch (err) { console.error('[Marriage] 週年獎勵發放失敗:', err.message); }
    }

    if (awarded > 0) saveAnniversaryState(state);
    return awarded;
}

function init() {}

module.exports = {
    handleMarry,
    handleMarriageButton,
    handleDivorce,
    handleDivorceButton,
    getMarriages,
    addMarriage,
    removeMarriage,
    checkAnniversaries,
    init,
};
