// Functions/GameSystem/MirrorDungeon.js
// 鏡光迷宮（鏡牢）— 完整 UI 版本，無需打字
'use strict';

const {
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { getOrCreatePlayer, savePlayerData } = require('./PacksAndData.js');
const { startBattle } = require('./BattleSystem.js');

const FLOORS = 7;

const EGO_GIFTS = [
    { name: '赤血聖杯',     desc: '每次戰勝後回復 10% 最大 HP',              id: 'heal_on_win' },
    { name: '翻轉銀幣',     desc: '所有技能硬幣投擲時有 60% 機率為正面',      id: 'coin_boost' },
    { name: '受難者的棘冠', desc: '受到傷害時有 20% 機率完全免疫',            id: 'dmg_immunity' },
    { name: '不燃之芯',     desc: '免疫燃燒狀態',                            id: 'burn_immunity' },
    { name: '深淵之眼',     desc: '攻擊力量 +2',                             id: 'power_up' },
    { name: '空白的日記',   desc: '每回合開始時回復 5 HP',                   id: 'regen' },
    { name: '鐵絲義肢',     desc: '防禦等級 +5',                             id: 'def_up' },
    { name: '彩虹糖果',     desc: '獲得隨機狀態抗性',                        id: 'status_resist' },
    { name: '折斷的時針',   desc: '第一回合所有技能力量翻倍',                 id: 'first_turn_boost' },
    { name: '血腥的契約書', desc: '攻擊力 +5，但每回合損失 3 HP',            id: 'pact_of_blood' },
];

const DUNGEON_EVENTS = [
    {
        name: '廢棄的實驗室',
        desc: '你們在實驗室角落發現了一瓶奇怪的液體…散發著淡淡的金色光芒。',
        choices: ['🧪 飲下液體（獲得 EGO 禮物）', '🚶 忽略繼續前進'],
        outcomes: ['gift', 'skip'],
    },
    {
        name: '折磨的迴音',
        desc: '走廊中迴盪著奇怪的聲音，讓人精神緊張。那是什麼聲音…？',
        choices: ['😤 鎮定前進（無事）', '🏃 匆忙通過（觸發戰鬥）'],
        outcomes: ['skip', 'battle'],
    },
    {
        name: '倒塌的書架',
        desc: '你發現了一堆散落的文件，其中有公司機密…以及一些珍貴的資源。',
        choices: ['📄 仔細研讀（獲得 🧵×20）', '💼 帶走一些（隨機結果）'],
        outcomes: ['threads', 'random'],
    },
    {
        name: '神秘的佈景',
        desc: '一個精心佈置的房間，彷彿有人在等待你。桌上擺著精緻的杯子。',
        choices: ['🪑 坐下來等（觸發精英戰）', '💥 破壞佈景（普通戰鬥）'],
        outcomes: ['elite_battle', 'battle'],
    },
    {
        name: '鏡中的倒影',
        desc: '你的倒影在鏡中做出了不同的動作。它伸出了手。',
        choices: ['🪞 觸碰鏡子（50% 禮物 or 受傷）', '🔨 打破鏡子（獲得 🧵×15）'],
        outcomes: ['mirror_gamble', 'threads_15'],
    },
    {
        name: '廢棄的診所',
        desc: '診所中有未使用的醫療器材，散發出消毒藥水的氣味。',
        choices: ['💊 使用器材（隊伍全體回復）', '🚪 繼續前進'],
        outcomes: ['heal', 'skip'],
    },
    {
        name: '神秘商人',
        desc: '一個戴著面具的商人出現在你們面前。「我能給你們想要的東西。」',
        choices: ['💎 交易（消耗 🧵×25，獲得 EGO 禮物）', '🚶 婉拒離開'],
        outcomes: ['buy_gift', 'skip'],
    },
    {
        name: '受傷的罪人',
        desc: '你們發現了一位受傷的陌生罪人，倒在走廊上。',
        choices: ['❤️ 救助他（獲得友好道具）', '⚔️ 戒備（觸發戰鬥）'],
        outcomes: ['item', 'battle'],
    },
];

const SHOP_ITEMS = [
    { name: '急救包',       desc: '隊伍全體回復 30% HP',  cost: 20, id: 'heal_30' },
    { name: '強化藥劑',     desc: '本次鏡牢攻擊力 +3',     cost: 30, id: 'atk_up' },
    { name: 'EGO 禮物箱',  desc: '獲得一件隨機 EGO 禮物', cost: 40, id: 'gift_box' },
    { name: '紡錘補充包',   desc: '立即獲得 🧵×30',        cost: 0,  id: 'free_threads', free: true },
];

function randomGift() {
    return EGO_GIFTS[Math.floor(Math.random() * EGO_GIFTS.length)];
}

function buildFloorMap(floor, maxFloor) {
    const rooms = [];
    for (let f = 1; f <= maxFloor; f++) {
        if      (f === maxFloor) rooms.push(f === floor ? `▶️ 樓層 ${f} 👹 BOSS` : `${f < floor ? '✅' : '🔒'} 樓層 ${f} 👹 BOSS`);
        else if (f === Math.floor(maxFloor / 2)) rooms.push(f === floor ? `▶️ 樓層 ${f} 💀 精英` : `${f < floor ? '✅' : '🔒'} 樓層 ${f} 💀 精英`);
        else if (f === floor) rooms.push(`▶️ 樓層 ${f}`);
        else if (f < floor)  rooms.push(`✅ 樓層 ${f}`);
        else                 rooms.push(`🔒 樓層 ${f}`);
    }
    return rooms.join('\n');
}

function roomTypeLabel(type) {
    return ({
        battle:       '⚔️ 戰鬥房間',
        elite:        '💀 精英戰鬥',
        boss:         '👹 BOSS 房間',
        event:        '❓ 神秘事件',
        rest:         '🌙 休息室',
        shop:         '🛒 移動商店',
    })[type] || type;
}

// ─── 主入口 ────────────────────────────────────────────────────
async function handleMirrorDungeon(client, message) {
    const args = message.content.trim().split(/\s+/);

    // 保留文字指令作為快捷
    if (args[1] === 'start' || args[1] === '開始') return startMirrorDungeon(client, message);
    if (args[1] === 'status' || args[1] === '狀態') return showDungeonStatus(client, message);

    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    const inProgress = player.dungeon && !player.dungeon.completed;

    const embed = new EmbedBuilder()
        .setTitle('🪞 鏡光迷宮（鏡牢）')
        .setColor(0xa55eea)
        .setDescription(
            '「主管，無限的鏡像正在交錯，請準備好你的人格。」\n\n' +
            `共 **${FLOORS}** 層，第 ${Math.floor(FLOORS / 2)} 層為精英戰，最終層為 BOSS 戰。\n` +
            '每層可能遭遇：⚔️ 戰鬥 / ❓ 事件 / 🌙 休息 / 🛒 商店\n\n' +
            '**完成獎勵：** 🧵×80 + EGO 禮物加成\n\n' +
            (inProgress
                ? `⚠️ 你有進行中的鏡牢（第 **${player.dungeon.floor}** / **${player.dungeon.maxFloor}** 層）`
                : '你目前沒有進行中的鏡牢。')
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('md_btn_start')
            .setLabel('🚀 開始新的鏡牢')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('md_btn_resume')
            .setLabel('▶️ 繼續上次進度')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!inProgress),
        new ButtonBuilder()
            .setCustomId('md_btn_status')
            .setLabel('📊 查看詳細進度')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!inProgress),
    );

    const reply = await message.reply({ embeds: [embed], components: [row] });
    const col = reply.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) {
                i.reply({ content: '❌ 這不是你的鏡牢。', ephemeral: true });
                return false;
            }
            return true;
        },
        time: 30_000,
        max: 1,
    });

    col.on('collect', async i => {
        await i.update({ components: [] }).catch(() => {});
        if (i.customId === 'md_btn_start') return startMirrorDungeon(client, message);
        if (i.customId === 'md_btn_resume') {
            const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);
            if (p2.dungeon && !p2.dungeon.completed) {
                return runFloor(client, message, p2.dungeon);
            }
            return message.channel.send('❌ 找不到進行中的鏡牢。');
        }
        if (i.customId === 'md_btn_status') return showDungeonStatus(client, message);
    });

    col.on('end', collected => {
        if (!collected.size) reply.edit({ components: [] }).catch(() => {});
    });
}

async function startMirrorDungeon(client, message) {
    const dungeonState = { floor: 1, maxFloor: FLOORS, gifts: [], completed: false };
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    player.dungeon = dungeonState;
    savePlayerData(null, message.author.id, player);

    await message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('🪞 鏡牢啟動')
            .setColor(0xa55eea)
            .setDescription('「進入鏡像迷宮。主管，願你和你的罪人們都能撐過去。」\n\n鏡牢已開始！')
            .setTimestamp()]
    });

    await runFloor(client, message, dungeonState);
}

async function showDungeonStatus(client, message) {
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    const d = player.dungeon;
    if (!d || d.completed) {
        return message.reply({
            embeds: [new EmbedBuilder()
                .setTitle('🪞 鏡牢狀態')
                .setColor(0x57606f)
                .setDescription('你目前沒有進行中的鏡牢。使用下方按鈕開始！')],
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('md_resume_now').setLabel('▶️ 繼續前進').setStyle(ButtonStyle.Success),
    );

    const reply = await message.reply({
        embeds: [new EmbedBuilder()
            .setTitle('🪞 鏡光迷宮進度')
            .setColor(0xa55eea)
            .addFields(
                { name: '📍 進度', value: buildFloorMap(d.floor, d.maxFloor), inline: false },
                { name: '🎁 EGO 禮物', value: d.gifts.length ? d.gifts.map(g => `• **${g.name}**：${g.desc}`).join('\n') : '（尚未獲得）', inline: false }
            )
            .setTimestamp()],
        components: [row],
    });

    const col = reply.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 30_000,
        max: 1,
    });

    col.on('collect', async i => {
        await i.update({ components: [] }).catch(() => {});
        return runFloor(client, message, d);
    });
    col.on('end', collected => {
        if (!collected.size) reply.edit({ components: [] }).catch(() => {});
    });
}

async function runFloor(client, message, state) {
    if (state.floor > state.maxFloor) return completeDungeon(client, message, state);

    const isBoss  = state.floor === state.maxFloor;
    const isElite = state.floor === Math.floor(state.maxFloor / 2);

    const roomTypes = isBoss   ? ['boss']
                    : isElite  ? ['elite', 'event']
                    : ['battle', 'battle', 'event', 'rest', 'shop'];
    const roomType  = roomTypes[Math.floor(Math.random() * roomTypes.length)];

    const embed = new EmbedBuilder()
        .setTitle(`🪞 鏡牢 — 第 ${state.floor} 層`)
        .setColor(isBoss ? 0xff4757 : isElite ? 0xffd166 : 0xa55eea)
        .setDescription(buildFloorMap(state.floor, state.maxFloor))
        .addFields(
            { name: '🚪 房間類型', value: roomTypeLabel(roomType), inline: true },
            { name: '🎁 EGO 禮物', value: state.gifts.length ? state.gifts.map(g => g.name).join('、') : '無', inline: true }
        )
        .setFooter({ text: `第 ${state.floor}/${state.maxFloor} 層` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('md_enter').setLabel('🚪 進入房間').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('md_skip').setLabel('⏩ 跳過（損失 🧵×5）').setStyle(ButtonStyle.Secondary),
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });
    const col = msg.createMessageComponentCollector({
        filter: i => {
            if (i.user.id !== message.author.id) {
                i.reply({ content: '❌ 這不是你的鏡牢。', ephemeral: true });
                return false;
            }
            return true;
        },
        time: 120_000,
        max: 1,
    });

    col.on('collect', async interaction => {
        await interaction.deferUpdate().catch(() => {});
        await msg.edit({ components: [] }).catch(() => {});

        if (interaction.customId === 'md_skip') {
            const p = getOrCreatePlayer(null, message.author.id, message.author.username);
            p.thread = Math.max(0, (p.thread || 0) - 5);
            state.floor++;
            p.dungeon = state;
            savePlayerData(null, message.author.id, p);
            await message.channel.send(`⏩ 跳過第 ${state.floor - 1} 層，損失 🧵×5。`);
            return runFloor(client, message, state);
        }

        await handleRoom(client, message, state, roomType);
    });

    col.on('end', collected => {
        if (!collected.size) {
            msg.edit({ components: [] }).catch(() => {});
            message.channel.send('⏰ 鏡牢超時，進度已暫停。使用 `!md` 查看並繼續進度。').catch(() => {});
        }
    });
}

async function handleRoom(client, message, state, roomType) {
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);

    // ─── 休息室 ───────────────────────────────────────────────
    if (roomType === 'rest') {
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🌙 休息室')
                .setColor(0x2ed573)
                .setDescription(
                    '隊伍在此稍作休整。\n\n' +
                    '「即使是短暫的休息，也是戰鬥的一部分。」\n\n' +
                    '✅ 所有成員的狀態得到舒緩，戰鬥力小幅恢復。'
                )
                .setTimestamp()]
        });
        state.floor++;
        player.dungeon = state;
        savePlayerData(null, message.author.id, player);
        return runFloor(client, message, state);
    }

    // ─── 商店 ─────────────────────────────────────────────────
    if (roomType === 'shop') {
        const offer = randomGift();
        const threadCost = 30 + Math.floor(Math.random() * 20); // 30~49

        const shopEmbed = new EmbedBuilder()
            .setTitle('🛒 移動商店')
            .setColor(0xffd166)
            .setDescription(
                '一個神秘商人向你們走來。\n\n' +
                `**本日商品：** ${offer.name}\n` +
                `📖 效果：${offer.desc}\n\n` +
                `**費用：** 🧵×${threadCost}\n` +
                `**你的紡錘：** 🧵×${player.thread || 0}`
            );

        const shopMsg = await message.channel.send({
            embeds: [shopEmbed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('shop_buy').setLabel(`💰 購買（🧵×${threadCost}）`).setStyle(ButtonStyle.Success).setDisabled((player.thread || 0) < threadCost),
                new ButtonBuilder().setCustomId('shop_skip').setLabel('🚶 離開').setStyle(ButtonStyle.Secondary),
            )]
        });

        const col = shopMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 60_000,
            max: 1,
        });

        col.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            await shopMsg.edit({ components: [] }).catch(() => {});
            const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);
            if (i.customId === 'shop_buy') {
                if ((p2.thread || 0) >= threadCost) {
                    p2.thread -= threadCost;
                    state.gifts.push(offer);
                    await message.channel.send(`✅ 購買了 **${offer.name}**！效果：${offer.desc} | 🧵-${threadCost}`);
                } else {
                    await message.channel.send('❌ 紡錘不足，無法購買。');
                }
            } else {
                await message.channel.send('🚶 你選擇離開商店。');
            }
            state.floor++;
            p2.dungeon = state;
            savePlayerData(null, message.author.id, p2);
            return runFloor(client, message, state);
        });

        col.on('end', async collected => {
            if (!collected.size) {
                await shopMsg.edit({ components: [] }).catch(() => {});
                const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);
                state.floor++;
                p2.dungeon = state;
                savePlayerData(null, message.author.id, p2);
                return runFloor(client, message, state);
            }
        });
        return;
    }

    // ─── 事件 ─────────────────────────────────────────────────
    if (roomType === 'event') {
        const event = DUNGEON_EVENTS[Math.floor(Math.random() * DUNGEON_EVENTS.length)];

        const evMsg = await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle(`❓ 神秘事件：${event.name}`)
                .setColor(0x74b9ff)
                .setDescription(event.desc + '\n\n請做出選擇：')],
            components: [new ActionRowBuilder().addComponents(
                event.choices.map((c, i) =>
                    new ButtonBuilder()
                        .setCustomId(`event_choice_${i}`)
                        .setLabel(c.slice(0, 80))
                        .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
                )
            )]
        });

        const col = evMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 60_000,
            max: 1,
        });

        col.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            await evMsg.edit({ components: [] }).catch(() => {});
            const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);
            const choiceIdx = parseInt(i.customId.split('_')[2]);
            const outcome = event.outcomes[choiceIdx];
            const choiceText = event.choices[choiceIdx];
            await message.channel.send(`你選擇了：**${choiceText}**`);
            await handleEventOutcome(message, p2, state, outcome);
            state.floor++;
            p2.dungeon = state;
            savePlayerData(null, message.author.id, p2);
            return runFloor(client, message, state);
        });

        col.on('end', async collected => {
            if (!collected.size) {
                await evMsg.edit({ components: [] }).catch(() => {});
                const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);
                await message.channel.send('⏰ 事件超時，自動跳過。');
                state.floor++;
                p2.dungeon = state;
                savePlayerData(null, message.author.id, p2);
                return runFloor(client, message, state);
            }
        });
        return;
    }

    // ─── 戰鬥（一般 / 精英 / BOSS）──────────────────────────
    const tier = roomType === 'boss' ? 'boss' : roomType === 'elite' ? 'elite' : 'normal';
    const tierLabel = roomTypeLabel(roomType);

    await message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle(`${tierLabel} — 開始！`)
            .setColor(tier === 'boss' ? 0xff4757 : tier === 'elite' ? 0xffd166 : 0x5865f2)
            .setDescription(`「敵人出現了！」\n\n**難度：** ${tier === 'boss' ? 'BOSS 決戰' : tier === 'elite' ? '精英戰鬥' : '一般戰鬥'}\n準備迎戰...`)
            .setTimestamp()]
    });

    const fakeBattleMsg = {
        reply: c => message.channel.send(c),
        channel: message.channel,
        author: message.author,
    };

    const result = await startBattle(client, fakeBattleMsg, tier).catch(err => {
        console.error('[MirrorDungeon] 戰鬥錯誤:', err.message);
        return { win: false, threadReward: 0 };
    });

    const reward = result?.win
        ? (tier === 'boss' ? 30 : tier === 'elite' ? 20 : 10)
        : 0;

    const p2 = getOrCreatePlayer(null, message.author.id, message.author.username);

    if (result?.win) {
        p2.thread = (p2.thread || 0) + reward;

        // EGO 禮物加成：heal_on_win
        if (state.gifts.some(g => g.id === 'heal_on_win')) {
            await message.channel.send('🍷 **赤血聖杯**：戰勝後隊伍回復了 HP！');
        }

        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('✅ 戰鬥完成')
                .setColor(0x2ed573)
                .setDescription(`獲得 🧵×${reward} 紡錘。\n繼續前往下一層...`)
                .setTimestamp()]
        });
    } else {
        if (tier === 'boss') {
            // BOSS 敗北 — 鏡牢失敗
            p2.dungeon = { completed: true, failed: true, floor: state.floor };
            savePlayerData(null, message.author.id, p2);
            return message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('💀 鏡牢失敗')
                    .setColor(0xff4757)
                    .setDescription('「你們在鏡像的折射中迷失了。」\n\n在 BOSS 戰中落敗，鏡牢強制結束。\n使用 `!md` 重新挑戰。')
                    .setTimestamp()]
            });
        }
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('💀 戰鬥失敗')
                .setColor(0xff4757)
                .setDescription('雖然落敗，但仍可繼續前進...\n（失敗不獲得紡錘）')
                .setTimestamp()]
        });
    }

    state.floor++;
    p2.dungeon = state;
    savePlayerData(null, message.author.id, p2);
    return runFloor(client, message, state);
}

async function handleEventOutcome(message, player, state, outcome) {
    if (outcome === 'gift') {
        const g = randomGift();
        state.gifts.push(g);
        await message.channel.send({
            embeds: [new EmbedBuilder()
                .setTitle('🎁 獲得 EGO 禮物！')
                .setColor(0xa55eea)
                .setDescription(`**${g.name}**\n效果：${g.desc}`)
                .setTimestamp()]
        });
    } else if (outcome === 'threads') {
        const t = 15 + Math.floor(Math.random() * 15); // 15~29
        player.thread = (player.thread || 0) + t;
        await message.channel.send(`🧵 仔細研讀文件後，找到了藏起來的資源！獲得 🧵×${t}`);
    } else if (outcome === 'threads_15') {
        player.thread = (player.thread || 0) + 15;
        await message.channel.send(`🔨 你打破了鏡子，碎片中發現了一些珍貴材料！獲得 🧵×15`);
    } else if (outcome === 'heal') {
        await message.channel.send('💊 使用了診所的器材，隊伍全體狀態好轉！');
    } else if (outcome === 'mirror_gamble') {
        if (Math.random() < 0.5) {
            const g = randomGift();
            state.gifts.push(g);
            await message.channel.send({
                embeds: [new EmbedBuilder()
                    .setTitle('🪞 鏡子的贈禮')
                    .setColor(0xa55eea)
                    .setDescription(`鏡中倒影向你微笑，遞給你一件禮物。\n\n🎁 **${g.name}**：${g.desc}`)
                    .setTimestamp()]
            });
        } else {
            const dmg = 5 + Math.floor(Math.random() * 10);
            await message.channel.send(`💔 鏡中倒影突然攻擊！隊伍受到 **${dmg}** 傷害。`);
        }
    } else if (outcome === 'buy_gift') {
        if ((player.thread || 0) >= 25) {
            player.thread -= 25;
            const g = randomGift();
            state.gifts.push(g);
            await message.channel.send(`💎 交易完成！🧵-25\n🎁 獲得 **${g.name}**：${g.desc}`);
        } else {
            await message.channel.send('❌ 紡錘不足（需要 🧵×25），商人無奈地搖搖頭。');
        }
    } else if (outcome === 'item') {
        const t = 10 + Math.floor(Math.random() * 10);
        player.thread = (player.thread || 0) + t;
        await message.channel.send(`❤️ 你救助了那位罪人。他感謝你，留下了一些補給品。獲得 🧵×${t}`);
    } else if (outcome === 'battle') {
        await message.channel.send('⚔️ 觸發了戰鬥！');
        const fakeBattleMsg = { reply: c => message.channel.send(c), channel: message.channel, author: message.author };
        await startBattle(null, fakeBattleMsg, 'normal').catch(console.error);
    } else if (outcome === 'elite_battle') {
        await message.channel.send('💀 等待你的竟是一場精英戰！');
        const fakeBattleMsg = { reply: c => message.channel.send(c), channel: message.channel, author: message.author };
        await startBattle(null, fakeBattleMsg, 'elite').catch(console.error);
    } else if (outcome === 'random') {
        const r = Math.random();
        if (r < 0.4) {
            const g = randomGift();
            state.gifts.push(g);
            await message.channel.send(`🎁 幸運！文件中藏著一件 EGO 禮物：**${g.name}**（${g.desc}）`);
        } else if (r < 0.7) {
            const t = 5 + Math.floor(Math.random() * 15);
            player.thread = (player.thread || 0) + t;
            await message.channel.send(`🧵 獲得了一些資源，🧵×${t}`);
        } else {
            await message.channel.send('💨 什麼都沒找到，只是浪費了時間。');
        }
    } else {
        await message.channel.send('➡️ 你選擇繼續前進。');
    }
}

async function completeDungeon(client, message, state) {
    const player = getOrCreatePlayer(null, message.author.id, message.author.username);
    const baseReward = 80;
    const giftBonus = state.gifts.length * 10;
    const totalReward = baseReward + giftBonus;

    player.thread = (player.thread || 0) + totalReward;
    player.dungeon = { completed: true, failed: false, floor: state.maxFloor };
    savePlayerData(null, message.author.id, player);

    const giftText = state.gifts.length
        ? state.gifts.map(g => `• **${g.name}**：${g.desc}`).join('\n')
        : '未獲得 EGO 禮物';

    return message.channel.send({
        embeds: [new EmbedBuilder()
            .setTitle('🏆 鏡光迷宮完成！')
            .setColor(0xffd166)
            .setDescription(
                '「主管，你們撐過了所有的鏡像折射。做得很好。」\n\n' +
                `**基礎獎勵：** 🧵×${baseReward}\n` +
                `**EGO 禮物加成：** 🧵×${giftBonus}（共 ${state.gifts.length} 件禮物）\n` +
                `**總計：** 🧵×${totalReward}`
            )
            .addFields({ name: '🎁 攜帶的 EGO 禮物', value: giftText, inline: false })
            .setTimestamp()]
    });
}

module.exports = { handleMirrorDungeon };
