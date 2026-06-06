// Functions/GameSystem/MirrorDungeon.js 
'use strict';

// 鏡光迷宮（鏡牢）完整模擬
const {
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder
} = require('discord.js');

const { loadCharData, saveCharData } = require('./CharacterSystem.js');
const { startBattle } = require('./BattleSystem.js');

const MODE_CONFIG = {
    easy:   { floors: 4, rewardThreads: 45, finalThreads: 40, label: '簡單' },
    normal: { floors: 5, rewardThreads: 60, finalThreads: 60, label: '一般' },
    hard:   { floors: 6, rewardThreads: 80, finalThreads: 90, label: '困難' },
};

const EGO_GIFTS = [
    { name: '赤血聖杯', desc: '每次戰勝後回復 10% 最大 HP', id: 'heal_on_win' },
    { name: '翻轉銀幣', desc: '所有技能硬幣投擲時有更高機率出正面', id: 'coin_boost' },
    { name: '受難者的棘冠', desc: '受到傷害時有機率完全免疫', id: 'dmg_immunity' },
    { name: '不燃之芯', desc: '免疫燃燒狀態', id: 'burn_immunity' },
    { name: '深淵之眼', desc: '攻擊力量 +2', id: 'power_up' },
    { name: '空白的日記', desc: '每回合開始時回復 5 HP', id: 'regen' },
    { name: '鐵絲義肢', desc: '防禦等級 +5', id: 'def_up' },
    { name: '彩虹糖果', desc: '獲得隨機狀態抗性', id: 'status_resist' },
];

const DUNGEON_EVENTS = [
    { name: '廢棄的實驗室', desc: '你們在實驗室角落發現了一瓶奇怪的液體…', choices: ['飲下液體（獲得 EGO 禮物）', '忽略（繼續前進）'], outcomes: ['gift', 'skip'] },
    { name: '折磨的迴音', desc: '走廊中迴盪著奇怪的聲音，讓人精神緊張。', choices: ['鎮定前進（無事）', '匆忙通過（隨機觸發戰鬥）'], outcomes: ['skip', 'battle'] },
    { name: '倒塌的書架', desc: '你發現了一堆散落的文件，其中有公司機密…', choices: ['仔細研讀（獲得紡錘）', '帶走一些紙張（隨機）'], outcomes: ['threads', 'random'] },
    { name: '神秘的佈景', desc: '一個精心佈置的房間，彷彿有人在等待你。', choices: ['坐下來等（觸發精英戰）', '破壞佈景（普通戰鬥）'], outcomes: ['elite_battle', 'battle'] },
    { name: '鏡中的倒影', desc: '你的倒影在鏡中做出了不同的動作。', choices: ['觸碰鏡子（50% 獲得禮物或受傷）', '打破鏡子（獲得紡錘）'], outcomes: ['mirror_gamble', 'threads'] },
    { name: '廢棄的診所', desc: '診所中有未使用的醫療器材。', choices: ['使用器材（回復 HP）', '繼續前進'], outcomes: ['heal', 'skip'] },
];

function randomGift() {
    return EGO_GIFTS[Math.floor(Math.random() * EGO_GIFTS.length)];
}

function buildFloorMap(floor, maxFloor) {
    const rooms = [];
    for (let f = 1; f <= maxFloor; f++) {
        if (f === maxFloor) rooms.push(`👹 樓層 ${f} BOSS`);
        else if (f === floor) rooms.push(`▶️ 樓層 ${f}`);
        else if (f < floor) rooms.push(`✅ 樓層 ${f}`);
        else rooms.push(`🔒 樓層 ${f}`);
    }
    return rooms.join('\n');
}

function roomTypeLabel(type) {
    const map = {
        battle: '⚔️ 戰鬥房間',
        elite: '💀 精英戰鬥',
        boss: '👹 BOSS 房間',
        event: '❓ 事件',
        rest: '🌙 休息室',
        shop: '🛒 商店'
    };
    return map[type] || type;
}

function getDungeonConfig(mode) {
    return MODE_CONFIG[mode] || MODE_CONFIG.normal;
}

function pickRoomType(floor, maxFloor) {
    const isBoss = floor === maxFloor;
    const isElite = floor === Math.floor(maxFloor / 2);

    if (isBoss) return 'boss';
    if (isElite) return Math.random() < 0.6 ? 'elite' : 'event';

    const roomTypes = ['battle', 'battle', 'event', 'rest', 'shop'];
    return roomTypes[Math.floor(Math.random() * roomTypes.length)];
}

// ─── 主入口 ────────────────────────────────────────────────────
async function handleMirrorDungeon(client, message) {
    const args = message.content.trim().split(/\s+/);

    if (args[1] === 'start' || args[1] === '開始') {
        return startMirrorDungeon(client, message);
    }
    if (args[1] === 'status' || args[1] === '狀態') {
        return showDungeonStatus(client, message);
    }

    const embed = new EmbedBuilder()
        .setTitle('🪞 鏡光迷宮（鏡牢）')
        .setColor(0xa55eea)
        .setDescription(
            '「主管，無限的鏡像正在交錯，請準備好你的人格。」\n\n' +
            '每層可能遭遇：⚔️ 戰鬥 / ❓ 事件 / 🌙 休息 / 🛒 商店\n' +
            '完成鏡牢可獲得大量 🧵 紡錘 與 EGO 禮物加成。'
        )
        .addFields({
            name: '📋 指令',
            value: '`!md start` — 開始新的鏡牢挑戰\n`!md start hard` — 困難模式\n`!md status` — 查看當前進度\n`!md` — 顯示此說明',
        })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function startMirrorDungeon(client, message) {
    const args = message.content.trim().split(/\s+/);
    const mode = (args[2] || 'normal').toLowerCase();
    const cfg = getDungeonConfig(mode);

    const charData = loadCharData(client, message.author.id);

    const dungeonState = {
        mode,
        floor: 1,
        maxFloor: cfg.floors,
        gifts: [],
        completed: false,
        failed: false,
    };

    charData.dungeon = dungeonState;
    saveCharData(client, message.author.id, charData);

    await message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('🪞 鏡光迷宮啟動')
            .setColor(0xa55eea)
            .setDescription(`模式：**${cfg.label}**\n樓層數：**${cfg.floors}**\n準備進入鏡牢。`)
            .setTimestamp()],
    });

    return runFloor(client, message, dungeonState);
}

async function showDungeonStatus(client, message) {
    const charData = loadCharData(client, message.author.id);
    const d = charData.dungeon;

    if (!d || d.completed || d.failed) {
        return message.reply('你目前沒有進行中的鏡牢。使用 `!md start` 開始！');
    }

    const cfg = getDungeonConfig(d.mode);

    const embed = new EmbedBuilder()
        .setTitle('🪞 鏡光迷宮進度')
        .setColor(0xa55eea)
        .addFields(
            { name: '📍 進度', value: buildFloorMap(d.floor, d.maxFloor), inline: false },
            { name: '🎚️ 模式', value: `${cfg.label}`, inline: true },
            {
                name: '🎁 EGO 禮物',
                value: d.gifts.length
                    ? d.gifts.map(g => `• **${g.name}**：${g.desc}`).join('\n')
                    : '（尚未獲得）',
                inline: false,
            }
        )
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function runFloor(client, message, state) {
    const cfg = getDungeonConfig(state.mode);

    if (state.floor > state.maxFloor) {
        return completeDungeon(client, message, state);
    }

    const roomType = pickRoomType(state.floor, state.maxFloor);

    const embed = new EmbedBuilder()
        .setTitle(`🪞 鏡牢 — 第 ${state.floor} 層`)
        .setColor(state.floor === state.maxFloor ? 0xff4757 : 0xa55eea)
        .setDescription(buildFloorMap(state.floor, state.maxFloor))
        .addFields(
            { name: '🚪 房間類型', value: roomTypeLabel(roomType), inline: true },
            { name: '🎚️ 模式', value: cfg.label, inline: true },
            { name: '🎁 EGO 禮物', value: state.gifts.length ? state.gifts.map(g => g.name).join('、') : '無', inline: true }
        )
        .setFooter({ text: `第 ${state.floor}/${state.maxFloor} 層` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('md_enter').setLabel('進入房間').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('md_skip').setLabel('跳過（損失部分紡錘）').setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });

    const col = msg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 60_000,
        max: 1,
    });

    col.on('collect', async interaction => {
        await interaction.deferUpdate().catch(() => {});
        await msg.edit({ components: [] }).catch(() => {});

        if (interaction.customId === 'md_skip') {
            const charData = loadCharData(client, message.author.id);
            charData.thread = Math.max(0, (charData.thread || 0) - 5);
            state.floor += 1;
            charData.dungeon = state;
            saveCharData(client, message.author.id, charData);
            await message.channel.send(`⏩ 跳過第 ${state.floor - 1} 層，損失 🧵×5 紡錘。`);
            return runFloor(client, message, state);
        }

        return handleRoom(client, message, state, roomType);
    });

    col.on('end', collected => {
        if (!collected.size) {
            msg.edit({ components: [] }).catch(() => {});
            message.channel.send('⏰ 鏡牢超時，進度已暫停。使用 `!md status` 查看進度，`!md start` 重新開始。').catch(() => {});
        }
    });
}

async function handleRoom(client, message, state, roomType) {
    const charData = loadCharData(client, message.author.id);
    const cfg = getDungeonConfig(state.mode);

    if (roomType === 'rest') {
        const healed = 20;
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🌙 休息室')
                    .setColor(0x2ed573)
                    .setDescription(`隊伍在此稍作休整，所有成員回復 **${healed} HP**。\n\n「稍稍的休息，也是戰鬥的一部分。」`)
                    .setTimestamp(),
            ],
        });

        state.floor += 1;
        charData.dungeon = state;
        saveCharData(client, message.author.id, charData);
        return runFloor(client, message, state);
    }

    if (roomType === 'shop') {
        const offer = randomGift();
        const embed = new EmbedBuilder()
            .setTitle('🛒 鏡牢商店')
            .setColor(0xffd166)
            .setDescription(`商人正在販售：\n\n**${offer.name}**\n${offer.desc}\n\n費用：🧵 紡錘 ×30`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('shop_buy').setLabel('購買').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('shop_skip').setLabel('離開').setStyle(ButtonStyle.Secondary)
        );

        const shopMsg = await message.channel.send({ embeds: [embed], components: [row] });
        const col = shopMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 30_000,
            max: 1
        });

        col.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            await shopMsg.edit({ components: [] }).catch(() => {});

            if (i.customId === 'shop_buy') {
                if ((charData.thread || 0) >= 30) {
                    charData.thread -= 30;
                    state.gifts.push(offer);
                    await message.channel.send(`✅ 購買了 **${offer.name}**！🧵-30`);
                } else {
                    await message.channel.send('❌ 紡錘不足，無法購買。');
                }
            }

            state.floor += 1;
            charData.dungeon = state;
            saveCharData(client, message.author.id, charData);
            return runFloor(client, message, state);
        });

        col.on('end', async collected => {
            if (!collected.size) {
                await shopMsg.edit({ components: [] }).catch(() => {});
                state.floor += 1;
                charData.dungeon = state;
                saveCharData(client, message.author.id, charData);
                return runFloor(client, message, state);
            }
        });

        return;
    }

    if (roomType === 'event') {
        const event = DUNGEON_EVENTS[Math.floor(Math.random() * DUNGEON_EVENTS.length)];
        const embed = new EmbedBuilder()
            .setTitle(`❓ 事件：${event.name}`)
            .setColor(0x74b9ff)
            .setDescription(event.desc);

        const row = new ActionRowBuilder().addComponents(
            event.choices.map((c, i) =>
                new ButtonBuilder().setCustomId(`event_choice_${i}`).setLabel(c).setStyle(ButtonStyle.Primary)
            )
        );

        const evMsg = await message.channel.send({ embeds: [embed], components: [row] });
        const col = evMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 30_000,
            max: 1
        });

        col.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            await evMsg.edit({ components: [] }).catch(() => {});
            const choiceIdx = parseInt(i.customId.split('_')[2], 10);
            const outcome = event.outcomes[choiceIdx];
            await handleEventOutcome(client, message, charData, state, outcome);
            state.floor += 1;
            charData.dungeon = state;
            saveCharData(client, message.author.id, charData);
            return runFloor(client, message, state);
        });

        col.on('end', async collected => {
            if (!collected.size) {
                await evMsg.edit({ components: [] }).catch(() => {});
                state.floor += 1;
                charData.dungeon = state;
                saveCharData(client, message.author.id, charData);
                return runFloor(client, message, state);
            }
        });

        return;
    }

    // 戰鬥類型
    const tier = roomType === 'boss' ? 'boss' : roomType === 'elite' ? 'elite' : 'normal';
    await message.channel.send(`⚔️ 開始 ${roomTypeLabel(roomType)}！請選擇技能完成戰鬥。`);

    const fakeMessage = {
        author: message.author,
        channel: message.channel,
        reply: (payload) => message.channel.send(payload),
    };

    const result = await startBattle(client, fakeMessage, tier);

    // 鏡牢額外獎勵
    if (result?.win) {
        const bonusThreads = tier === 'boss' ? 15 : tier === 'elite' ? 10 : 5;
        charData.thread = (charData.thread || 0) + bonusThreads;
        await message.channel.send(`✅ 鏡牢戰鬥完成，額外獲得 🧵×${bonusThreads} 紡錘。`);
    } else {
        state.failed = true;
        charData.dungeon = { ...state, failed: true };
        saveCharData(client, message.author.id, charData);
        await message.channel.send('💀 鏡牢挑戰中止。');
        return;
    }

    state.floor += 1;
    charData.dungeon = state;
    saveCharData(client, message.author.id, charData);
    return runFloor(client, message, state);
}

async function handleEventOutcome(client, message, charData, state, outcome) {
    if (outcome === 'gift') {
        const g = randomGift();
        state.gifts.push(g);
        await message.channel.send(`🎁 獲得 EGO 禮物：**${g.name}** — ${g.desc}`);
    } else if (outcome === 'threads') {
        const t = 10 + Math.floor(Math.random() * 20);
        charData.thread = (charData.thread || 0) + t;
        await message.channel.send(`🧵 獲得紡錘 ×${t}`);
    } else if (outcome === 'heal') {
        await message.channel.send('❤️ 隊伍回復了 HP，精神狀態好轉。');
    } else if (outcome === 'mirror_gamble') {
        if (Math.random() < 0.5) {
            const g = randomGift();
            state.gifts.push(g);
            await message.channel.send(`🎁 獲得 EGO 禮物：**${g.name}**！`);
        } else {
            await message.channel.send('💔 你受到了鏡中倒影的攻擊。');
        }
    } else {
        await message.channel.send('➡️ 你選擇了繼續前進。');
    }

    saveCharData(client, message.author.id, charData);
}

async function completeDungeon(client, message, state) {
    const charData = loadCharData(client, message.author.id);
    const cfg = getDungeonConfig(state.mode);

    charData.thread = (charData.thread || 0) + cfg.finalThreads;
    charData.dungeon = { completed: true, floor: state.maxFloor, mode: state.mode };
    saveCharData(client, message.author.id, charData);

    const embed = new EmbedBuilder()
        .setTitle('🏆 鏡光迷宮完成！')
        .setColor(0xffd166)
        .setDescription(
            `「主管，你們撐過了所有的鏡像折射。」\n\n` +
            `**完成獎勵：** 🧵 紡錘 ×${cfg.finalThreads}\n` +
            (state.gifts.length
                ? `**攜帶的 EGO 禮物：** ${state.gifts.map(g => g.name).join('、')}`
                : '**未獲得 EGO 禮物**')
        )
        .setTimestamp();

    return message.channel.send({ embeds: [embed] });
}

module.exports = { handleMirrorDungeon };
