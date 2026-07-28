'use strict';

const {
SlashCommandBuilder,
EmbedBuilder,
ActionRowBuilder,
StringSelectMenuBuilder,
ButtonBuilder,
ButtonStyle,
} = require('discord.js');

const identitiesData = require('./GameSystem/Pulls/identitiesData.js');
const { executePull } = require('./GameSystem/Pulls/PullSystem.js');

// ─────────────────────────────────────────────
// 工具：取得所有有效卡池
// ─────────────────────────────────────────────

function getBanners() {
return identitiesData?.BANNERS || {};
}

// ─────────────────────────────────────────────
// 建立卡池資訊 Embed
// ─────────────────────────────────────────────

function createBannerEmbed(banner) {
if (!banner) {
return new EmbedBuilder()
.setTitle('🚂 狂氣提取')
.setColor(0xff0000)
.setDescription('❌ 目前沒有可用的提取卡池。');
}

```
const rateUp = banner.rateUp || {};

const rateUpS3 = Array.isArray(rateUp.S3)
    ? rateUp.S3.filter(Boolean)
    : [];

const rateUpS2 = Array.isArray(rateUp.S2)
    ? rateUp.S2.filter(Boolean)
    : [];

const rateUpEGO = Array.isArray(rateUp.EGOS)
    ? rateUp.EGOS.filter(Boolean)
    : [];

const rateUpSpecial = Array.isArray(rateUp.SPECIAL)
    ? rateUp.SPECIAL.filter(Boolean)
    : [];

let rateUpText = '';

if (rateUpS3.length) {
    rateUpText += `✨ **★★★ UP**\n• ${rateUpS3.join('\n• ')}\n\n`;
}

if (rateUpS2.length) {
    rateUpText += `⭐ **★★ UP**\n• ${rateUpS2.join('\n• ')}\n\n`;
}

if (rateUpEGO.length) {
    rateUpText += `🔮 **E.G.O UP**\n• ${rateUpEGO.join('\n• ')}\n\n`;
}

if (rateUpSpecial.length) {
    rateUpText += `🌌 **Special UP**\n• ${rateUpSpecial.join('\n• ')}\n\n`;
}

if (!rateUpText) {
    rateUpText = '目前沒有設定 Rate Up 對象。';
}

const singleCost = banner.cost?.single ?? 130;
const tenCost = banner.cost?.ten ?? 1300;

return new EmbedBuilder()
    .setTitle(`🚂 ${banner.name || '未命名卡池'}`)
    .setDescription(
        banner.description ||
        '目前沒有提供此卡池的詳細說明。'
    )
    .setColor(0xffa502)
    .addFields(
        {
            name: '✨ Rate Up',
            value: rateUpText.slice(0, 1024),
            inline: false,
        },
        {
            name: '💰 提取花費',
            value:
                `單抽：**${singleCost} 狂氣**\n` +
                `十連：**${tenCost} 狂氣**`,
            inline: false,
        }
    )
    .setFooter({
        text: '選擇下方按鈕進行提取｜抽卡結果將只顯示給你',
    });
```

}

// ─────────────────────────────────────────────
// 建立卡池選擇器
//
// 注意：
// 這裡使用 BANNERS 的「外層 Key」作為 value
//
// 例如：
//
// const BANNERS = {
//     Season: {
//         id: 'Season',
//         name: 'Season-7 賽季池'
//     },
//     focus: {
//         id: 'focus',
//         name: 'Rodion Focus UP'
//     }
// };
//
// 選單傳出去的就是：
// Season
// focus
//
// 這樣可以直接對應 PullSystem.js 的：
// banners[bannerKey]
// ─────────────────────────────────────────────

function createBannerSelectMenu(banners) {
const options = Object.entries(banners)
.filter(
([bannerKey, banner]) =>
banner &&
bannerKey
)
.slice(0, 25)
.map(
([bannerKey, banner]) => ({
label: String(
banner.name ||
banner.id ||
bannerKey
).slice(0, 100),

```
            description: String(
                banner.description ||
                '沒有卡池說明'
            ).slice(0, 100),

            // 使用 BANNERS 外層 Key
            // 不使用 banner.id
            value: String(
                bannerKey
            ),
        })
    );

const menu =
    new StringSelectMenuBuilder()
        .setCustomId(
            'pull_select_banner'
        )
        .setPlaceholder(
            '🚂 選擇要進行提取的卡池...'
        );

if (options.length > 0) {
    menu.addOptions(options);
} else {
    menu.setDisabled(true);
}

return new ActionRowBuilder()
    .addComponents(menu);
```

}

// ─────────────────────────────────────────────
// 建立抽卡按鈕
//
// 注意：這裡傳入的是 BANNERS 外層 Key
// ─────────────────────────────────────────────

function createPullButtons(
banner,
bannerKey
) {
const finalBannerKey =
String(
bannerKey ||
'standard'
);

```
const singleCost =
    banner?.cost?.single ??
    130;

const tenCost =
    banner?.cost?.ten ??
    1300;

return new ActionRowBuilder()
    .addComponents(
        new ButtonBuilder()
            .setCustomId(
                `pull_execute_${finalBannerKey}_1`
            )
            .setLabel(
                `單抽 (${singleCost} 狂氣)`
            )
            .setStyle(
                ButtonStyle.Primary
            ),

        new ButtonBuilder()
            .setCustomId(
                `pull_execute_${finalBannerKey}_10`
            )
            .setLabel(
                `十連 (${tenCost} 狂氣)`
            )
            .setStyle(
                ButtonStyle.Success
            )
    );
```

}

// ─────────────────────────────────────────────
// 停用抽卡介面
// ─────────────────────────────────────────────

function disableComponents(
components
) {
return components.map(row => {
const newRow =
ActionRowBuilder.from(row);

```
    newRow.components.forEach(
        component => {
            component.setDisabled(true);
        }
    );

    return newRow;
});
```

}

// ─────────────────────────────────────────────
// 找預設卡池
//
// 不固定 Season / focus / standard
// 自動取得 BANNERS 第一個有效卡池
//
// 回傳格式：
// {
//     key: 'Season',
//     banner: { ... }
// }
// ─────────────────────────────────────────────

function getDefaultBanner(
banners
) {
const entry =
Object.entries(banners)
.find(
([bannerKey, banner]) =>
banner &&
bannerKey
);

```
if (!entry) {
    return null;
}

return {
    key: entry[0],
    banner: entry[1],
};
```

}

// ─────────────────────────────────────────────
// Slash Command
// ─────────────────────────────────────────────

module.exports = {
data:
new SlashCommandBuilder()
.setName('pull')
.setDescription(
'開啟狂氣提取介面'
),

```
async execute(
    interaction
) {
    const banners =
        getBanners();

    // ─────────────────────────────────
    // 檢查卡池
    // ─────────────────────────────────

    if (
        !Object.keys(banners).length
    ) {
        return interaction.reply({
            content:
                '❌ 目前沒有任何可用的抽卡卡池。',
            ephemeral: true,
        });
    }

    // ─────────────────────────────────
    // 自動取得預設卡池
    // ─────────────────────────────────

    const defaultBannerData =
        getDefaultBanner(
            banners
        );

    if (
        !defaultBannerData
    ) {
        return interaction.reply({
            content:
                '❌ 找不到可用的抽卡卡池。',
            ephemeral: true,
        });
    }

    const defaultBannerKey =
        defaultBannerData.key;

    const defaultBanner =
        defaultBannerData.banner;

    // ─────────────────────────────────
    // 建立介面
    // ─────────────────────────────────

    const selectRow =
        createBannerSelectMenu(
            banners
        );

    const buttonRow =
        createPullButtons(
            defaultBanner,
            defaultBannerKey
        );

    const embed =
        createBannerEmbed(
            defaultBanner
        );

    const response =
        await interaction.reply({
            embeds: [
                embed,
            ],

            components: [
                selectRow,
                buttonRow,
            ],

            fetchReply: true,
        });

    // ─────────────────────────────────
    // 建立 Component Collector
    // ─────────────────────────────────

    const collector =
        response.createMessageComponentCollector({
            time: 120000,
        });

    collector.on(
        'collect',
        async componentInteraction => {

            // ─────────────────────────
            // 玩家驗證
            // ─────────────────────────

            if (
                componentInteraction.user.id !==
                interaction.user.id
            ) {
                return componentInteraction.reply({
                    content:
                        '❌ 這不是你的抽卡介面。',
                    ephemeral: true,
                });
            }

            try {

                // ─────────────────────
                // 選擇卡池
                // ─────────────────────

                if (
                    componentInteraction.isStringSelectMenu() &&
                    componentInteraction.customId ===
                        'pull_select_banner'
                ) {

                    // 這裡取得的是
                    // BANNERS 外層 Key
                    //
                    // 例如：
                    // Season
                    // focus
                    // standard

                    const bannerKey =
                        componentInteraction
                            .values?.[0];

                    if (
                        !bannerKey
                    ) {
                        return componentInteraction.reply({
                            content:
                                '❌ 無法取得選擇的卡池。',
                            ephemeral: true,
                        });
                    }

                    // 直接使用外層 Key
                    const selectedBanner =
                        banners[
                            bannerKey
                        ];

                    if (
                        !selectedBanner
                    ) {
                        return componentInteraction.reply({
                            content:
                                '❌ 找不到這個卡池。',
                            ephemeral: true,
                        });
                    }

                    const newEmbed =
                        createBannerEmbed(
                            selectedBanner
                        );

                    const newButtons =
                        createPullButtons(
                            selectedBanner,
                            bannerKey
                        );

                    await componentInteraction.update({
                        embeds: [
                            newEmbed,
                        ],

                        components: [
                            selectRow,
                            newButtons,
                        ],
                    });

                    return;
                }

                // ─────────────────────
                // 執行抽卡
                // ─────────────────────

                if (
                    componentInteraction.isButton() &&
                    componentInteraction.customId.startsWith(
                        'pull_execute_'
                    )
                ) {

                    /*
                     * Custom ID：
                     *
                     * pull_execute_Season_1
                     * pull_execute_Season_10
                     *
                     * pull_execute_focus_1
                     * pull_execute_focus_10
                     *
                     * 最後一段是抽卡次數。
                     */

                    const parts =
                        componentInteraction
                            .customId
                            .split('_');

                    // 最後一段是 1 或 10
                    const count =
                        parseInt(
                            parts.pop(),
                            10
                        );

                    // 剩餘部分重新組合
                    // 得到 BANNERS 外層 Key
                    const bannerKey =
                        parts
                            .slice(2)
                            .join('_');

                    // ─────────────────
                    // 驗證抽卡次數
                    // ─────────────────

                    if (
                        !Number.isInteger(
                            count
                        ) ||
                        ![1, 10].includes(
                            count
                        )
                    ) {
                        return componentInteraction.reply({
                            content:
                                '❌ 無效的抽卡次數。',
                            ephemeral: true,
                        });
                    }

                    // ─────────────────
                    // 驗證卡池
                    // ─────────────────

                    if (
                        !banners[
                            bannerKey
                        ]
                    ) {
                        return componentInteraction.reply({
                            content:
                                '❌ 找不到指定的卡池。',
                            ephemeral: true,
                        });
                    }

                    // ─────────────────
                    // 延遲回覆
                    // ─────────────────

                    await componentInteraction.deferReply({
                        ephemeral: false,
                    });

                    // ─────────────────
                    // 執行抽卡
                    //
                    // 直接傳 BANNERS 外層 Key
                    //
                    // PullSystem.js：
                    // banners[bannerKey]
                    // ─────────────────

                    await executePull(
                        componentInteraction.client,
                        componentInteraction.user,
                        bannerKey,
                        count,
                        componentInteraction
                    );

                    return;
                }

            } catch (
                error
            ) {

                console.error(
                    '[PullMenu] Component Error:',
                    error
                );

                const errorMessage = {
                    content:
                        `❌ 抽卡介面發生錯誤：\n` +
                        `\`${error.message}\``,
                };

                if (
                    componentInteraction.deferred ||
                    componentInteraction.replied
                ) {
                    await componentInteraction
                        .editReply(
                            errorMessage
                        )
                        .catch(
                            () => {}
                        );
                } else {
                    await componentInteraction
                        .reply({
                            ...errorMessage,
                            ephemeral: true,
                        })
                        .catch(
                            () => {}
                        );
                }
            }
        }
    );

    // ─────────────────────────────────
    // Collector 結束
    // ─────────────────────────────────

    collector.on(
        'end',
        async () => {
            try {

                const disabledRows =
                    disableComponents([
                        selectRow,
                        buttonRow,
                    ]);

                await interaction.editReply({
                    components:
                        disabledRows,
                });

            } catch {
                // 訊息已被刪除
                // 或無法更新時忽略
            }
        }
    );
},
```

};
