'use strict';

// ─── 預設模板函式 ────────────────────────────────────────────
function T() {
    return {
        skill1:  { skillname: '', clashbase: 0, coins: 0, clashpower: 0, attack: 0, defense: 0 },
        skill2:  { skillname: '', clashbase: 0, coins: 0, clashpower: 0, attack: 0, defense: 0 },
        skill3:  { skillname: '', clashbase: 0, coins: 0, clashpower: 0, attack: 0, defense: 0 },
        evade:   { skillname: '', coins: 0, clashpower: 0, defense: 0 },
        counter: [
            { skillname: '', canclash: true,  coins: 0, clashpower: 0, attack: 0, defense: 0 },
            { skillname: '', canclash: false, coins: 0, clashpower: 0, attack: 0, defense: 0 },
        ],
    };
}

// ─── 原始人格、E.G.O 與 異想體（Abnormality）清單 ─────────────────────────
const identityRegistry = {
    'Color Fixer': [
        { name: "［殷紅迷霧］卡莉 / The Red Mist Kali" },
        { name: "［漆黑噤默］羅蘭 / The Black Silence Roland" },
        { name: "［猩紅凝視］維吉爾 / The Red Gaze Vergilius" },
        { name: "［金色魚叉］維斯帕 / The Yellow Harpoon Vespa" },
        { name: "［紫色眼淚］伊織 / The Purple Tear Iori" },
        { name: "［朱紅十字］??? / The Vermilion Cross ???" },
        { name: "［靛藍老人］??? / The Indigo Elder ???" },
        { name: "［蒼藍殘響］阿爾加利亞 / The Blue Reverberation Argalia" },
    ],
    'Special': [
        { name: "[黃金迪］索爾茲 / Gold of The Dih Solzc" },
        { name: "[NULL] 這裡沒有任何東西 / theres nothing" },
        { name: "[Touhou Project] 芙蘭朵露·斯卡蕾特 / Flandre Scarlet" },
        { name: "[Touhou Project] 芙蘭朵露·蕾米莉亞 / Remilia Scarlet" },
        { name: "[赤月の破片] Fragment of Chaos." },
    ],
    '0000': [
        { name: "［竹帽］金 / Bamboo-hatted Kim" }, 
    ],
    '000': [
        
        { name: "［次元撕裂者］李箱 / Dimension Shredder Yi Sang" },
        { name: "［黎明事務所 幫手］辛克萊 / Dawn Office Fixer Sinclair" },
        { name: "［黎明事務所 收尾人］浮士德 / Dawn Office Fixer Faust" },
        { name: "［黎明事務所 代表］格里高爾 / Dawn Office Rep Gregor" },
        { name: "［LCD現場推理小隊］以實瑪利 / LCD OSIR Team Ishmael" },
        { name: "［S公司 推奴人］鴻路 / S Corp. Ch'unokkun Hong Lu" },
        { name: "［蜘蛛巢：拇指 父輩］羅佳 / The House of Spiders: Thumb Nursefather Rodion" },
        { name: "［蜘蛛巢：中指 父輩］奧提斯 / The House of Spiders: Middle Nursefather Outis" },
        { name: "［蜘蛛巢：環指 父輩］鴻璐 / The House of Spiders: Ring Nursefather Hong Lu" },
        { name: "［蜘蛛巢之刃］良秀 / Blade of the House of Spiders Ryōshū" },
        { name: "［環指 野獸派 講解員］羅佳 / The Ring Fauvist Lecturer Rodion" },
        { name: "［環指 點描派 學生］奧提斯 / The Ring Pointillist Student Outis" },
        { name: "［環指 點描派 學生］李箱 / The Ring Pointillist Student Yi Sang" },
        { name: "［食指 代理人 - 綻放E.G.O：代行］堂吉訶德 / The Index Proxy - Effloresced E.G.O::Procuration Don Quixote" },
        { name: "［中指 幼兄］希斯克里夫 / Middle Big Brother Heathcliff" },
        { name: "［蜘蛛巢：指環 學徒］浮士德 / The House of Spiders: Ring Apprentice Faust" },
        { name: "［蜘蛛巢：中指 學徒］以實瑪利 / The House of Spiders: Middle Apprentice Ishmael" },
        { name: "［蜘蛛巢：小指 學徒］辛克萊 / The House of Spiders: Pinky Apprentice Sinclair" },
        { name: "［蜘蛛巢：拇指 學徒］希斯克里夫 / The House of Spiders: The Thumb Apprentice Heathcliff" },
        { name: "［食指 傳令：【紙條】］浮士德 / The Index Messenger: Slip Faust" },
        { name: "［中指 幼妹］堂吉訶德 / The Middle Little Sister Don Quixote" },
        { name: "［中指 幼弟］辛克萊 / The Middle Little Brother Sinclair" },
        { name: "［鴻園之主］鴻璐 / Lord of Hongyuan Hong Lu" },
        { name: "［家主候選人］以實瑪利 / Family Hierarch Candidate Ishmael" },
        { name: "［鴻園的流浪武者］良秀 / Drifting Blade of Hongyuan Ryōshū" },
        { name: "［拇指東部指揮官 IIII］默爾索 / The Thumb East Capo IIII Meursault" },
        { name: "［東部拇指 士兵 II］辛克萊 / The Thumb East Soldato II Sinclair" },
        { name: "［黑獸-未］堂吉訶德 / Heishou Pack - Wei Branch Don Quixote" },
        { name: "［黑獸-巳］格里高爾 / Heishou Pack - Si Branch Gregor" },
        { name: "［黑獸-巳］羅佳 / Heishou Pack - Si Branch Rodion" },
        { name: "［黑獸-午 魁首］李箱 / Heishou Pack - Wu Branch Adept Yi Sang" },
        { name: "［黑獸-卯 魁首］浮士德 / Heishou Pack - Mao Branch Adept Faust" },
        { name: "［黑獸-酉 魁首］希斯克里夫 / Heishou Pack - You Branch Adept Heathcliff" },
        { name: "［黑獸-酉］辛克萊 / Heishou Pack - You Branch Sinclair" },
        { name: "［黑獸-卯］奧提斯 / Heishou Pack - Mao Branch Outis" },
        { name: "［黑獸-卯］良秀 / Heishou Pack - Mao Branch Ryōshū" },
        { name: "［拉曼查·卻領 總督］堂吉訶德 / The Manager of La Manchaland Don Quixote" },
        { name: "［拉曼查·卻領 王子］默爾索 / The Prince of La Manchaland Meursault" },
        { name: "［拉曼查·卻領 公主］羅佳 / The Princess of La Manchaland Rodion" },
        { name: "［拉曼查·卻領 神父］格里高爾 / The Priest of La Manchaland Gregor" },
        { name: "［拉曼查·卻領 理髮師］奧提斯 / The Barber of La Manchaland Outis" },
        { name: "［句點事務所收尾人］希斯克里夫 / Full-Stop Office Fixer Heathcliff" },
        { name: "［句點事務所代表］鴻璐 / Full-Stop Office Rep Hong Lu" },
        { name: "［夜錐組隊長］格里高爾 / Night Awls Capitano Gregor" },
        { name: "［腦業公司 E.G.O::哀悼］李箱 / Lobotomy E.G.O::Solemn Lament Yi Sang" },
        { name: "［腦業公司 E.G.O::赤瞳&懺悔］良秀 / Lobotomy E.G.O::Red Eyes & Penitence Ryōshū" },
        { name: "［腦業公司 E.G.O::懊悔］浮士德 / Lobotomy E.G.O::Regret Faust" },
        { name: "［腦業公司 E.G.O::以愛與恨之名］堂吉訶德 / Lobotomy E.G.O::In the Name of Love and Hate Don Quixote" },
        { name: "［腦業公司 E.G.O::幽香與孤寂］良秀 / Lobotomy E.G.O::Faint Aroma & Solitude Ryōshū" },
        { name: "［腦業公司 E.G.O::大黃蜂【變異】］默爾索 / Lobotomy E.G.O::Hornet【Alteration】Meursault" },
        { name: "［腦業公司 E.G.O::狐雨］希斯克里夫 / Lobotomy E.G.O::Sunshower Heathcliff" },
        { name: "［腦業公司 E.G.O::淚鋒之劍］羅佳 / Lobotomy E.G.O::The Sword Sharpened with Tears Rodion" },
        { name: "［腦業公司 E.G.O::魔彈］奧提斯 / Lobotomy E.G.O::Magic Bullet Outis" },
        { name: "［LCE E.G.O::AEDD］格里高爾 / LCE E.G.O::AEDD Gregor" },
        { name: "［LCE E.G.O::炎雀］浮士德 / LCE E.G.O::Ardor Blossom Star Faust" },
        { name: "［腦業公司 E.G.O::目燈］格里高爾 / Lobotomy E.G.O::Lamp Gregor" },
        { name: "［開花E.G.O：山茶花］李箱 / Effloresced E.G.O::Spicebush Yi Sang" },
        { name: "［呼嘯山莊 首席管家］奧提斯 / Wuthering Heights Chief Butler Outis" },
        { name: "［埃德加家族 首席管家］良秀 / Edgar Family Chief Butler Ryōshū" },
        { name: "［埃德加家族 繼承人］格里高爾 / Edgar Family Heir Gregor" },
        { name: "［斐廓德號 船長］以實瑪利 / Pequod Captain Ishmael" },
        { name: "［斐廓德號 魚叉手］希斯克里夫 / Pequod Harpooneer Heathcliff" },
        { name: "［狂獵］希斯克里夫 / Wild Hunt Heathcliff" },
        { name: "［豆豆幫幫主］鴻璐 / Tingtang Gang GangLeader Hong Lu" },
        { name: "［劍契 殺手］李箱 / Blade Lineage Salsu Yi Sang" },
        { name: "［劍契 殺手］浮士德 / Blade Lineage Salsu Faust" },
        { name: "［劍契 殺手］辛克萊 / Blade Lineage Salsu Sinclair" },
        { name: "［劍契 導師］默爾索 / Blade Lineage Mentor Meursault" },
        { name: "［黑雲會 組長］以實瑪利 / Kurokumo Clan Captain Ishmael" },
        { name: "［黑雲會 眾］希斯克里夫 / Kurokumo Clan Wakashu Heathcliff" },
        { name: "［黑雲會 眾］羅佳 / Kurokumo Clan Wakashu Rodion" },
        { name: "［黑雲會 眾］良秀 / Kurokumo Clan Wakashu Ryōshū" },
        { name: "［W公司 2區 清掃人員］奧提斯 / W Corp. L3 Cleanup Captain Outis" },
        { name: "［W公司 2區 清掃人員］默爾索 / W Corp. L2 Cleanup Agent Meursault" },
        { name: "［W公司 3區 清掃人員］李箱 / W Corp. L3 Cleanup Agent Yi Sang" },
        { name: "［W公司 3區 清掃人員］良秀 / W Corp. L3 Cleanup Agent Ryōshū" },
        { name: "［W公司 3區 清掃人員］堂吉訶德 / W Corp. L3 Cleanup Agent Don Quixote" },
        { name: "［W公司 4區 清掃人員］希斯克里夫 / W Corp. L4 Cleanup Agent - CCA Heathcliff" },
        { name: "［R公司 4區 兔子組］希斯克里夫 / R Corp. 4th Pack Rabbit Heathcliff" },
        { name: "［R公司 4區 馴鹿組］以實瑪利 / R Corp. 4th Pack Reindeer Ishmael" },
        { name: "［R公司 4區 馴鹿組］羅佳 / R Corp. 4th Pack Reindeer Rodion" },
        { name: "［R公司 4區 馴鹿組］鴻璐 / R Corp. 4th Pack Reindeer Hong Lu" },
        { name: "［R公司 4區 犀牛組］默爾索 / R Corp. 4th Pack Rhino Meursault" },
        { name: "［K公司 3級 剔除人員］鴻璐 / K Corp. Excision Staff Class 3 Hong Lu" },
        { name: "［T公司 3級 征收人員］堂吉訶德 / T Corp. Class 3 Collection Staff Don Quixote" },
        { name: "［G公司 下士］格里高爾 / G Corp. Corporal Gregor" },
        { name: "［N公司 執柄者］浮士德 / The One Who Grips Faust" },
        { name: "［N公司 準執柄者］辛克萊 / The One Who Shall Grip Sinclair" },
        { name: "［N公司 大錘］默爾索 / N Corp. Großhammer Meursault" },
        { name: "［N公司 E.G.O::凶彈］李箱 / N Corp. E.G.O::Fell Bullet Yi Sang" },
        { name: "［N公司 E.G.O::輕蔑, 敬畏］良秀 / N Corp. E.G.O::Contempt, Awe Ryōshū" },
        { name: "［七協會 南部6科 部長］奧提斯 / Seven Assoc. South Section 6 Director Outis" },
        { name: "［七協會 南部4科］浮士德 / Seven Assoc. South Section 4 Faust" },
        { name: "［六協會 南部4科 部長］羅佳 / Liu Assoc. South Section 4 Rodion" },
        { name: "［五協會 南部5科 科長］堂吉訶德 / Cinq Assoc. South Section 5 Director Don Quixote" },
        { name: "［Cinq協會 南部5科］堂吉訶德 / Cinq Assoc. South Section 5 Don Quixote" },
        { name: "［Cinq協會 南部5科］鴻璐 / Cinq Assoc. East Section 3 Hong Lu" },
        { name: "［Cinq協會 西部3科］默爾索 / Cinq Assoc. West Section 3 Meursault" },
        { name: "［Cinq協會 南部5科］堂吉訶德 / Cinq Assoc. South Section 5 Don Quixote" },
        { name: "［Zwei協會 西部3科］以實瑪利 / Zwei Assoc. West Section 3 Ishmael" },
        { name: "［Dieci協會 南部4科］羅佳 / Dieci Assoc. South Section 4 Rodion" },
        { name: "［Dieci協會 南部4科］鴻璐 / Dieci Assoc. South Section 4 Hong Lu" },
        { name: "［Dieci協會 南部4科］默爾索 / Dieci Assoc. South Section 4 Meursault" },
        { name: "［Devyat協會 北部3科］羅佳 / Devyat' Assoc. North Section 3 Rodion" },
        { name: "［Devyat協會 北部3科］辛克萊 / Devyat' Assoc. North Section 3 Sinclair" },
        { name: "［Öufi協會 南部3科］希斯克里夫 / Öufi Assoc. South Section 3 Heathcliff" },
        { name: "［LCA 烏加特先鋒 第三小隊 隊長］奧提斯 / LCA Udjat Vanguard Team 3 Leader Outis" },
        { name: "［臼齒事務所 幫手］奧提斯 / Molar Office Fixer Outis" },
        { name: "［鄭氏事務所 代理］以實瑪利 / Jeong's Office Representative Ishmael" },
        { name: "［多裂紋事務所 代理］浮士德 / Multicrack Office Representative Faust" },
        { name: "［火拳事務所 倖存者］格里高爾 / Firefist Office Survivor Gregor" },
        { name: "［雙鉤海賊團 一副］格里高爾 / Twinhook Pirates First Mate Gregor" },
        { name: "［Liu協會 南部3科］李箱 / Liu Assoc. South Section 3 Yi Sang" },
        { name: "［Liu協會 南部4科］以實瑪利 / Liu Assoc. South Section 4 Ishmael" },
        { name: "［臼齒船舶事務所 幫手］以實瑪利 / Molar Boatworks Fixer Ishmael" },
        { name: "［20區聖愚］鴻璐 / District 20 Yurodivy Hong Lu" },
        { name: "［玫瑰扳手工坊 代理］羅佳 / Rosespanner Workshop Rep Rodion" },
        { name: "［Shi協會 東部3科］浮士德 / Shi Assoc. East Section 3 Faust" },
        { name: "［R.B. 廚師長］良秀 / R.B. Chef de Cuisine Ryōshū" },
    ],
    '00': [
        { name: "［中指 小弟］默爾索 / Middle Brother Meursault" },
        { name: "［黑雲會 眾］鴻璐 / Kurokumo Clan Member Hong Lu" },
        { name: "［黑雲會 組長］格里高爾 / Kurokumo Clan Captain Gregor" },
        { name: "［LCE E.G.O::提燈］李箱 / LCE E.G.O::Lantern Yi Sang" },
        { name: "［腦業公司 E.G.O::紅符］辛克萊 / Lobotomy E.G.O::Red Sheet Sinclair" },
        { name: "［腦業公司 E.G.O::游移］以實瑪利 / Lobotomy E.G.O::Sloshing Ishmael" },
        { name: "［W公司 2區 清掃人員］浮士德 / W Corp. L2 Cleanup Agent Faust" },
        { name: "［W公司 2區 清掃人員］鴻璐 / W Corp. L2 Cleanup Agent Hong Lu" },
        { name: "［N公司 中錘］堂吉訶德 / N Corp. Mittelhammer Don Quixote" },
        { name: "［N公司 中錘］羅佳 / N Corp. Mittelhammer Rodion" },
        { name: "［N公司 小錘］希斯克里夫 / N Corp. Kleinhammer Heathcliff" },
        { name: "［Shi協會 南部5科 部長］堂吉訶德 / Shi Assoc. South Section 5 Director Don Quixote" },
        { name: "［Shi協會 南部5科］以實瑪利 / Shi Assoc. South Section 5 Ishmael" },
        { name: "［Shi協會 南部5科］希斯克里夫 / Shi Assoc. South Section 5 Heathcliff" },
        { name: "［Zwei協會 南部6科］辛克萊 / Zwei Assoc. South Section 6 Sinclair" },
        { name: "［Zwei協會 南部6科］格里高爾 / Zwei Assoc. South Section 6 Gregor" },
        { name: "［Zwei協會 南部4科］浮士德 / Zwei Assoc. South Section 4 Faust" },
        { name: "［Liu協會 南部6科］默爾索 / Liu Assoc. South Section 6 Meursault" },
        { name: "［Liu協會 南部6科］格里高爾 / Liu Assoc. South Section 6 Gregor" },
        { name: "［Liu協會 南部5科］鴻璐 / Liu Assoc. South Section 5 Hong Lu" },
        { name: "［Liu協會 南部4科］良秀 / Liu Assoc. South Section 4 Ryōshū" },
        { name: "［七協會 南部6科］李箱 / Seven Assoc. South Section 6 Yi Sang" },
        { name: "［七協會 南部6科］良秀 / Seven Assoc. South Section 6 Ryōshū" },
        { name: "［七協會 南部4科］希斯克里夫 / Seven Assoc. South Section 4 Heathcliff" },
        { name: "［Cinq協會 南部4科］奧提斯 / Cinq Assoc. South Section 4 Outis" },
        { name: "［咆哮山莊 管家］浮士德 / Wuthering Heights Butler Faust" },
        { name: "［埃德加族 管家］以實瑪利 / Edgar Family Butler Ishmael" },
        { name: "［劍契 殺手］堂吉訶德 / Blade Lineage Salsu Don Quixote" },
        { name: "［劍契 殺手］奧提斯 / Blade Lineage Salsu Outis" },
        { name: "［LCCB 助理經理］以實瑪利 / LCCB Assistant Manager Ishmael" },
        { name: "［LCCB 助理經理］良秀 / LCCB Assistant Manager Ryōshū" },
        { name: "［LCCB 助理經理］羅佳 / LCCB Assistant Manager Rodion" },
        { name: "［玫瑰扳手工坊 幫手］默爾索 / Rosespanner Workshop Fixer Meursault" },
        { name: "［玫瑰扳手工坊 幫手］格里高爾 / Rosespanner Workshop Fixer Gregor" },
        { name: "［臼齒船舶事務所 幫手］辛克萊 / Molar Boatworks Fixer Sinclair" },
        { name: "［臼齒事務所 幫手］李箱 / Molar Office Fixer Yi Sang" },
        { name: "［鉤子事務所 幫手］鴻璐 / Hook Office Fixer Hong Lu" },
        { name: "［20區聖愚］良秀 / District 20 Yurodivy Ryōshū" },
        { name: "［洛斯馬利亞契 老大］辛克萊 / Los Mariachis Jefe Sinclair" },
        { name: "［死兔黨 老大］默爾索 / Dead Rabbits Boss Meursault" },
        { name: "［R.B. 副主廚］格里高爾 / R.B. Sous-chef Gregor" },
        { name: "［斐廓德號 一副］李箱 / Pequod First Mate Yi Sang" },
        { name: "［Dieci協會 南部4科］李箱 / Dieci Assoc. South Section 4 Yi Sang" },
        { name: "［G公司 科長］奧提斯 / G Corp. Head Manager Outis" },
        { name: "［獵牙事務所收尾人］鴻璐 / Fanghunt Office Fixer Hong Lu" },
        { name: "［腦業公司 E.G.O::提燈］堂吉訶德 / Lobotomy E.G.O::Lantern Don Quixote" },
        { name: "［多裂紋事務所收尾人］希斯克里夫 / MultiCrack Office Fixer Heathcliff" },
        { name: "［T公司 2級征收人員］羅佳 / T Corp. Class 2 Collection Staff Rodion" },
        { name: "［Zwei協會 西部3科］辛克萊 / Zwei Assoc. West Section 3 Sinclair" },
    ],
    '0': [
        { name: "［邊獄公司 罪人］李箱 / LCB Sinner Yi Sang" },
        { name: "［邊獄公司 罪人］浮士德 / LCB Sinner Faust" },
        { name: "［邊獄公司 罪人］堂吉訶德 / LCB Sinner Don Quixote" },
        { name: "［邊獄公司 罪人］良秀 / LCB Sinner Ryōshū" },
        { name: "［邊獄公司 罪人］默爾索 / LCB Sinner Meursault" },
        { name: "［邊獄公司 罪人］希斯克里夫 / LCB Sinner Heathcliff" },
        { name: "［邊獄公司 罪人］以實瑪利 / LCB Sinner Ishmael" },
        { name: "［邊獄公司 罪人］鴻璐 / LCB Sinner Hong Lu" },
        { name: "［邊獄公司 罪人］羅佳 / LCB Sinner Rodion" },
        { name: "［邊獄公司 罪人］辛克萊 / LCB Sinner Sinclair" },
        { name: "［邊獄公司 罪人］奧提斯 / LCB Sinner Outis" },
        { name: "［邊獄公司 罪人］格里高爾 / LCB Sinner Gregor" },
    ],
    'Egos': [
    { name: "[ZAYIN] 烏鴉之眼 - 李箱 / [ZAYIN] Crow's Eye View - Yi Sang" },
    { name: "[ZAYIN] 往昔歲月 - 李箱 / [ZAYIN] Bygone Days - Yi Sang" },
    { name: "[TETH] 第四火焰 - 李箱 / [TETH] 4th Match Flame - Yi Sang" },
    { name: "[TETH] 願望石冢 - 李箱 / [TETH] Wishing Cairn - Yi Sang" },
    { name: "[HE] 次元撕裂者 - 李箱 / [HE] Dimension Shredder - Yi Sang" },
    { name: "[HE] 墮彈 - 李箱 / [HE] Fell Bullet - Yi Sang" },
    { name: "[WAW] 太陽雨 - 李箱 / [WAW] Sunshower - Yi Sang" },
    { name: "[WAW] 三千大世界 - 李箱 / [WAW] Great Trichiliocosm - Yi Sang" },
    { name: "[HE] 莊嚴的哀歌 - 李箱 / [HE] Solemn Lament - Yi Sang" },

    { name: "[ZAYIN] 表象放射器 - 浮士德 / [ZAYIN] Representation Emitter - Faust" },
    { name: "[TETH] 咒釘 - 浮士德 / [TETH] Hex Nail - Faust" },
    { name: "[TETH] 9:2 - 浮士德 / [TETH] 9:2 - Faust" },
    { name: "[TETH] 套索 - 浮士德 / [TETH] Lasso - Faust" },
    { name: "[HE] 液囊 - 浮士德 / [HE] Fluid Sac - Faust" },
    { name: "[HE] 電線桿 - 浮士德 / [HE] Telepole - Faust" },
    { name: "[HE] 胸痛 - 浮士德 / [HE] Thoracalgia - Faust" },
    { name: "[HE] 熔毀指令 - 浮士德 / [HE] Command : Meltdown - Faust" },
    { name: "[HE] 熾花星 - 浮士德 / [HE] Ardor Blossom Star - Faust" },
    { name: "[WAW] 永恆 - 浮士德 / [WAW] Everlasting - Faust" },

    { name: "[ZAYIN] 桑丘之血 - 唐吉訶德 / [ZAYIN] La Sangre de Sancho - Don Quixote" },
    { name: "[TETH] 一生燉湯 - 唐吉訶德 / [TETH] Lifetime Stew - Don Quixote" },
    { name: "[TETH] 願望石冢 - 唐吉訶德 / [TETH] Wishing Cairn - Don Quixote" },
    { name: "[TETH] 電擊尖叫 - 唐吉訶德 / [TETH] Electric Screaming - Don Quixote" },
    { name: "[HE] 液囊 - 唐吉訶德 / [HE] Fluid Sac - Don Quixote" },
    { name: "[HE] 電線桿 - 唐吉訶德 / [HE] Telepole - Don Quixote" },
    { name: "[HE] 紅紙片 - 唐吉訶德 / [HE] Red Sheet - Don Quixote" },
    { name: "[WAW] 渴望-米爾卡拉 - 唐吉訶德 / [WAW] Yearning-Mircalla - Don Quixote" },
    { name: "[WAW] 愛與恨之名 - 唐吉訶德 / [WAW] In the Name of Love and Hate - Don Quixote" },
    { name: "[ZAYIN] 我拿剪刀去，你呢？ - 唐吉訶德 / [ZAYIN] I ll Go fer Scissors. How Bout You? - Don Quixote" },

    { name: "[ZAYIN] 森林與火焰 - 良秀 / [ZAYIN] Forest for the Flames - Ryoshu" },
    { name: "[ZAYIN] 蘇打 - 良秀 / [ZAYIN] Soda - Ryoshu" },
    { name: "[TETH] 紅眼 - 良秀 / [TETH] Red Eyes - Ryoshu" },
    { name: "[TETH] 盲目痴迷 - 良秀 / [TETH] Blind Obsession - Ryoshu" },
    { name: "[HE] 第四火焰 - 良秀 / [HE] 4th Match Flame - Ryoshu" },
    { name: "[HE] 紅眼開 - 良秀 / [HE] Red Eyes (Open) - Ryoshu" },
    { name: "[HE] 胸痛 - 良秀 / [HE] Thoracalgia - Ryoshu" },
    { name: "[WAW] 輕蔑，敬畏 - 良秀 / [WAW] Contempt, Awe - Ryoshu" },
    { name: "[WAW] 三千大世界 - 良秀 / [WAW] Great Trichiliocosm - Ryoshu" },

    { name: "[ZAYIN] 他人之繩 - 默爾索 / [ZAYIN] Chains of Others - Meursault" },
    { name: "[TETH] 亂槍亂打 - 默爾索 / [TETH] Screwloose Wallop - Meursault" },
    { name: "[TETH] 悔恨 - 默爾索 / [TETH] Regret - Meursault" },
    { name: "[TETH] 電擊尖叫 - 默爾索 / [TETH] Electric Screaming - Meursault" },
    { name: "[HE] 執行 - 默爾索 / [HE] Pursuance - Meursault" },
    { name: "[HE] 卡波特 - 默爾索 / [HE] Capote - Meursault" },
    { name: "[HE] 著影揮刀 - 默爾索 / [HE] Shadow-Vested Bladesinger - Meursault" },
    { name: "[WAW] 渴望-米爾卡拉 - 默爾索 / [WAW] Yearning-Mircalla - Meursault" },
    { name: "[WAW] 壓裂往昔 - 默爾索 / [WAW] Crushbound Past - Meursault" },

    { name: "[ZAYIN] 幻境之地 - 鴻璐 / [ZAYIN] Land of Illusion - Hong Lu" },
    { name: "[TETH] 玫瑰慾望 - 鴻璐 / [TETH] Roseate Desire - Hong Lu" },
    { name: "[TETH] 蘇打 - 鴻璐 / [TETH] Soda - Hong Lu" },
    { name: "[TETH] 空洞哀鳴 - 鴻璐 / [TETH] Cavernous Wailing - Hong Lu" },
    { name: "[TETH] 套索 - 鴻璐 / [TETH] Lasso - Hong Lu" },
    { name: "[HE] 次元撕裂者 - 鴻璐 / [HE] Dimension Shredder - Hong Lu" },
    { name: "[HE] 泡沫腐蝕 - 鴻璐 / [HE] Effervescent Corrosion - Hong Lu" },
    { name: "[HE] 留住自我 - 鴻璐 / [HE] To Remain Oneself - Hong Lu" },
    { name: "[WAW] 被玷污的血之淚 - 鴻璐 / [WAW] Tears of the Tarnished Blood - Hong Lu" },

    { name: "[ZAYIN] 破布袋 - 希斯克里夫 / [ZAYIN] Bodysack - Heathcliff" },
    { name: "[ZAYIN] 假日 - 希斯克里夫 / [ZAYIN] Holiday - Heathcliff" },
    { name: "[TETH] AEDD - 希斯克里夫 / [TETH] AEDD - Heathcliff" },
    { name: "[TETH] 墮彈 - 希斯克里夫 / [TETH] Fell Bullet - Heathcliff" },
    { name: "[TETH] 搬入規章 - 希斯克里夫 / [TETH] Move-in Reg. - Heathcliff" },
    { name: "[HE] 電線桿 - 希斯克里夫 / [HE] Telepole - Heathcliff" },
    { name: "[HE] 那 Śūnyatā 即 Rūpam - 希斯克里夫 / [HE] Ya Śūnyatā Tad Rūpam - Heathcliff" },
    { name: "[HE] 非對稱慣性 - 希斯克里夫 / [HE] Asymmetrical Inertia - Heathcliff" },
    { name: "[WAW] 束縛 - 希斯克里夫 / [WAW] Binds - Heathcliff" },

    { name: "[ZAYIN] 魚叉 - 以實瑪利 / [ZAYIN] Snagharpoon - Ishmael" },
    { name: "[ZAYIN] 百足死亡蛆 - 以實瑪利 / [ZAYIN] Hundred-Footed Death Maggot - Ishmael" },
    { name: "[TETH] 玫瑰慾望 - 以實瑪利 / [TETH] Roseate Desire - Ishmael" },
    { name: "[TETH] 卡波特 - 以實瑪利 / [TETH] Capote - Ishmael" },
    { name: "[TETH] 往昔歲月 - 以實瑪利 / [TETH] Bygone Days - Ishmael" },
    { name: "[HE] 熾花星 - 以實瑪利 / [HE] Ardor Blossom Star - Ishmael" },
    { name: "[HE] 振翅 - 以實瑪利 / [HE] Wingbeat - Ishmael" },
    { name: "[HE] 聖誕惡夢 - 以實瑪利 / [HE] Christmas Nightmare - Ishmael" },
    { name: "[HE] 潮汐輓歌 - 以實瑪利 / [HE] Tidal Elegy - Ishmael" },
    { name: "[WAW] 盲目痴迷 - 以實瑪利 / [WAW] Blind Obsession - Ishmael" },

    { name: "[ZAYIN] 所謂之物 - 羅佳 / [ZAYIN] What is Cast - Rodion" },
    { name: "[ZAYIN] 夕陽之下 - 羅佳 / [ZAYIN] Into the Sunset - Rodion" },
    { name: "[TETH] 霜脊 - 羅佳 / [TETH] Rime Shank - Rodion" },
    { name: "[TETH] 泡沫腐蝕 - 羅佳 / [TETH] Effervescent Corrosion - Rodion" },
    { name: "[HE] 第四火焰 - 羅佳 / [HE] 4th Match Flame - Rodion" },
    { name: "[HE] 執行 - 羅佳 / [HE] Pursuance - Rodion" },
    { name: "[HE] 咒釘 - 羅佳 / [HE] Hex Nail - Rodion" },
    { name: "[WAW] 血色慾望 - 羅佳 / [WAW] Sanguine Desire - Rodion" },
    { name: "[WAW] 指引者的試煉 - 羅佳 / [WAW] Indicant's Trial - Rodion" },

    { name: "[ZAYIN] 知識之枝 - 辛克萊 / [ZAYIN] Branch of Knowledge - Sinclair" },
    { name: "[ZAYIN] 空洞哀鳴 - 辛克萊 / [ZAYIN] Cavernous Wailing - Sinclair" },
    { name: "[TETH] 迫近之日 - 辛克萊 / [TETH] Impending Day - Sinclair" },
    { name: "[TETH] 一生燉湯 - 辛克萊 / [TETH] Lifetime Stew - Sinclair" },
    { name: "[TETH] 咒釘 - 辛克萊 / [TETH] Hex Nail - Sinclair" },
    { name: "[HE] 燈籠 - 辛克萊 / [HE] Lantern - Sinclair" },
    { name: "[HE] 9:2 - 辛克萊 / [HE] 9:2 - Sinclair" },
    { name: "[HE] 和諧 - 辛克萊 / [HE] Harmony - Sinclair" },
    { name: "[WAW] 被玷污的血之淚 - 辛克萊 / [WAW] Tears of the Tarnished Blood - Sinclair" },

    { name: "[ZAYIN] 知識之路 - 奧提斯 / [ZAYIN] To Páthos Máthos - Outis" },
    { name: "[ZAYIN] 我拿剪刀去，你呢？ - 奧提斯 / [ZAYIN] I'll Go fer Scissors. How 'Bout You? - Outis" },
    { name: "[TETH] 那 Śūnyatā 即 Rūpam - 奧提斯 / [TETH] Ya Śūnyatā Tad Rūpam - Outis" },
    { name: "[TETH] 太陽雨 - 奧提斯 / [TETH] Sunshower - Outis" },
    { name: "[HE] 黑檀樹幹 - 奧提斯 / [HE] Ebony Stem - Outis" },
    { name: "[HE] 假日 - 奧提斯 / [HE] Holiday - Outis" },
    { name: "[HE] 次元撕裂者 - 奧提斯 / [HE] Dimension Shredder - Outis" },
    { name: "[HE] 魔彈 - 奧提斯 / [HE] Magic Bullet - Outis" },
    { name: "[WAW] 束縛 - 奧提斯 / [WAW] Binds - Outis" },

    { name: "[ZAYIN] 突然某日 - 格里高爾 / [ZAYIN] Suddenly, One Day - Gregor" },
    { name: "[ZAYIN] 苟延殘喘 - 格里高爾 / [ZAYIN] Legerdemain - Gregor" },
    { name: "[TETH] 燈籠 - 格里高爾 / [TETH] Lantern - Gregor" },
    { name: "[TETH] 往昔歲月 - 格里高爾 / [TETH] Bygone Days - Gregor" },
    { name: "[HE] AEDD - 格里高爾 / [HE] AEDD - Gregor" },
    { name: "[HE] 莊嚴哀歌 - 格里高爾 / [HE] Solemn Lament - Gregor" },
    { name: "[HE] 聖誕惡夢 - 格里高爾 / [HE] Christmas Nightmare - Gregor" },
    { name: "[WAW] 荊棘之園 - 格里高爾 / [WAW] Garden of Thorns - Gregor" },
    { name: "[WAW] 無光榮輝 - 格里高爾 / [WAW] Unbrilliant Glory - Gregor" },
    { name: "[TETH] 租借申請 - 格里高爾 / [TETH] Move-in Reg - Gregor" },
],
    'ABN_ZAYIN': [
    /* 腦葉公司 原版 */
    { name: "[O-03-03] 一罪與百善 / [O-03-03] One Sin and Hundreds of Good Deeds" },
    { name: "[O-00-00] 不要按我 / [O-00-00] Don't Touch Me" },
    { name: "[O-09-95] 你可以變得幸福 / [O-09-95] You Must Be Happy" },
    { name: "[O-01-45] 瘟疫醫師 / [O-01-45] Plague Doctor" },
    /* Tuantu 獨創 */
    { name: "復古方塊 <TUANTU> / Retro Brick <TUANTU>" },
    { name: "春烏拉拉 <TUANTU> / Haru Urara <TUANTU>" },
],

'ABN_TETH': [
    /* 腦葉公司 原版 */
    { name: "[T-06-27] 1.76 MHz / [T-06-27] 1.76 MHz" },
    { name: "[F-02-44] 美麗與野獸 / [F-02-44] Beauty and the Beast" },
    { name: "[O-09-96] 行為矯正 / [O-09-96] Behavior Adjustment" },
    { name: "[T-05-51] 浴血 / [T-05-51] Bloodbath" },
    { name: "[O-05-61] 破碎盔甲 / [O-05-61] Crumbling Armor" },
    { name: "[T-01-54] 被遺棄的殺人犯 / [T-01-54] Forsaken Murderer" },
    { name: "[O-03-60] 宇宙碎片 / [O-03-60] Fragment of the Universe" },
    { name: "[O-04-100] 櫻花墳墓 / [O-04-100] Grave of Cherry Blossoms" },
    { name: "[O-01-12] 老婦人 / [O-01-12] Old Lady" },
    { name: "[O-04-84] 肉燈籠 / [O-04-84] Meat Lantern" },
    { name: "[O-02-56] 懲戒鳥 / [O-02-56] Punishing Bird" },
    { name: "[D-02-107] Ppodae / [D-02-107] Ppodae" },
    { name: "[F-01-02] 燃燒的少女 / [F-01-02] Scorched Girl" },
    { name: "[T-09-90] 皮膚預言 / [T-09-90] Skin Prophecy" },
    { name: "[T-02-43] 蜘蛛巢穴 / [T-02-43] Spider Bud" },
    { name: "[T-09-77] 渴望之心 / [T-09-77] The Heart of Aspiration" },
    { name: "[F-01-18] 面壁的女人 / [F-01-18] The Lady Facing the Wall" },
    { name: "[T-09-09] 泰蕾莎 / [T-09-09] Theresia" },
    { name: "[O-01-92] 今日的害羞模樣 / [O-01-92] Today's Shy Look" },
    { name: "[T-02-99] 虛空夢境 / [T-02-99] Void Dream" },
    { name: "[O-05-48] 開罐即飲威路士 / [O-05-48] Open Can of Wellcheers" },
    /* Tuantu 獨創 (含已移除) */
    { name: "[R-01-198] 外殼 <TUANTU> / Husk <TUANTU>" },
    { name: "史丹 <TUANTU> / Stan <TUANTU>" },
    { name: "危險礦車 <TUANTU> / CaLide <TUANTU>" },
    { name: "高波 <TUANTU> / Golbo <TUANTU>" },
    { name: "重音西洋梨 <TUANTU> / Pear <TUANTU>" },
    { name: "DVD 人 <TUANTU> / DvD Man <TUANTU>" },
    { name: "在路燈下 <TUANTU> / Under The Streetlight <TUANTU>" },
    { name: "咯咯笑者 <TUANTU> / Giggler <TUANTU>" },
    { name: "極樂愚昧 <TUANTU> / Blissful Ignorance <TUANTU>" },
    { name: "卡比尼 <TUANTU> / Cabini <TUANTU>" },
    { name: "白樺樹 <TUANTU> / Birch Tree <TUANTU>" },
    { name: "槍手 700 <TUANTU> / 700 <TUANTU>" },
    { name: "主角 <TUANTU> / A Main Character <TUANTU>" },
    { name: "勝利笑臉 <TUANTU> / Winning Smile <TUANTU>" },
    { name: "TangoMangles <TUANTU> / TangoMangles <TUANTU>" },
],

'ABN_HE': [
    /* 腦葉公司 原版 */
    { name: "[T-04-06] 幸福泰迪熊 / [T-04-06] Happy Teddy Bear" },
    { name: "[O-04-08] 紅鞋 / [O-04-08] The Red Shoes" },
    { name: "[O-01-15] 無名胎兒 / [O-01-15] Nameless Fetus" },
    { name: "[O-05-30] 歌唱機 / [O-05-30] Singing Machine" },
    { name: "[F-05-32] 有溫暖心腸的木偶 / [F-05-32] Warm-hearted Woodsman" },
    { name: "[F-01-37] 白雪女王 / [F-01-37] The Snow Queen" },
    { name: "[T-05-41] 全能助手 / [T-05-41] All-Around Helper" },
    { name: "[O-01-55] 銀河之子 / [O-01-55] Child of the Galaxy" },
    { name: "[O-05-76] 幸災樂禍 / [O-05-76] Schadenfreude" },
    { name: "[T-09-78] 瘋狂研究員的筆記 / [T-09-78] Notes from a Crazed Researcher" },
    { name: "[T-09-80] 巨樹樹液 / [T-09-80] Giant Tree Sap" },
    { name: "[T-09-82] 3月27日的庇護所 / [T-09-82] Shelter from the 27th of March" },
    { name: "[F-01-87] 尋求智慧的稻草人 / [F-01-87] Scarecrow Searching for Wisdom" },
    { name: "[O-09-91] 異世界的肖像 / [O-09-91] Portrait of Another World" },
    { name: "[O-02-98] 豪豬 / [O-02-98] Porccubus" },
    { name: "[F-02-49] 魯道夫 / [F-02-49] Rudolta of Sleigh" },
    { name: "[F-01-69] 魔彈射手 / [F-01-69] Der Freischütz" },
    { name: "[O-01-67] 蕾蒂西亞 / [O-01-67] Laetitia" },
    { name: "[T-01-68] 月光 / [T-01-68] La Luna" },
    { name: "[T-01-53] 死蝶葬儀 / [T-01-53] Funeral of the Dead Butterflies" },
    /* Tuantu 獨創 */
    { name: "尊嚴 <TUANTU> / Dignity <TUANTU>" },
],

'ABN_WAW': [
    /* 腦葉公司 原版 */
    { name: "[T-04-53] 阿麗烏涅 / [T-04-53] Alriune" },
    { name: "[D-09-104] 倒退的時鐘 / [D-09-104] Backward Clock" },
    { name: "[F-02-58] 大而且可能是壞狼 / [F-02-58] Big and Might be Bad Wolf" },
    { name: "[O-02-40] 大鳥 / [O-02-40] Big Bird" },
    { name: "[D-01-110] 雲中僧侶 / [D-01-110] Clouded Monk" },
    { name: "[O-03-88] 次元折射變體 / [O-03-88] Dimensional Refraction Variant" },
    { name: "[F-01-57] 小紅帽僱傭兵 / [F-01-57] Little Red Riding Hooded Mercenary" },
    { name: "[O-02-62] 審判鳥 / [O-02-62] Judgement Bird" },
    { name: "[O-01-64] 貪婪之王 / [O-01-64] The King of Greed" },
    { name: "[O-04-66] 小王子 / [O-04-66] The Little Prince" },
    { name: "[O-01-04] 憎恨女王 / [O-01-04] The Queen of Hatred" },
    { name: "[T-04-50] 蜂后 / [T-04-50] Queen Bee" },
    { name: "[D-04-108] 寄生樹 / [D-04-108] Parasite Tree" },
    { name: "[D-01-105] 月之泣 / [D-01-105] Il Pianto della Luna" },
    { name: "[O-02-101] 火鳥 / [O-02-101] The Firebird" },
    { name: "[O-05-102] 陰 / [O-05-102] Yin" },
    { name: "[O-07-103] 陽 / [O-07-103] Yang" },
    { name: "[T-09-79] 血肉圖騰 / [T-09-79] Flesh Idol" },
    { name: "[T-09-86] 通往地獄的特快列車 / [T-09-86] Express Train to Hell" },
    { name: "[F-02-70] 夢中的黑天鵝 / [F-02-70] Dream of a Black Swan" },
    { name: "[O-04-72] 掘天之夢 / [O-04-72] The Burrowing Heaven" },
    { name: "[D-01-106] 黑色軍隊 / [D-01-106] Army in Black" },
    { name: "[O-01-73] 絕望騎士 / [O-01-73] Knight of Despair" },
    { name: "[O-01-08] 白雪公主的蘋果 / [O-01-08] Snow White's Apple" },
    /* Tuantu 獨創 (含已移除) */
    { name: "願望之根 <TUANTU> / Wishroot <TUANTU>" },
    { name: "未認證假人 <TUANTU> / Uncertified <TUANTU>" },
    { name: "世界機器 <TUANTU> / The World Machine <TUANTU>" },
    { name: "天空盒 <TUANTU> / The Skybox <TUANTU>" },
    { name: "石中劍 <TUANTU> / The Illumina <TUANTU>" },
    { name: "世界樹 <TUANTU> / Yggdrasil <TUANTU>" },
],

'ABN_ALEPH': [
    /* 腦葉公司 原版 */
    { name: "[O-02-63] 終末鳥 / [O-02-63] Apocalypse Bird" },
    { name: "[O-03-93] 蒼藍星 / [O-03-93] Blue Star" },
    { name: "[O-03-89] CENSORED / [O-03-89] CENSORED" },
    { name: "[D-03-109] 融化之愛 / [D-03-109] Melting Love" },
    { name: "[T-01-75] 微笑的屍山 / [T-01-75] Mountain of Smiling Bodies" },
    { name: "[O-06-20] 一無所有 / [O-06-20] Nothing There" },
    { name: "[T-01-31] 沉默樂團 / [T-01-31] The Silent Orchestra" },
    { name: "[T-03-46] 白夜 / [T-03-46] WhiteNight" },
    /* Tuantu 獨創 (含已移除) */
    { name: "國王 <TUANTU> / King <TUANTU>" },
    { name: "伊凡 <TUANTU> / Ivan <TUANTU>" },
    { name: "亞茲拉爾 <TUANTU> / Azrail <TUANTU>" },
    { name: "割穗者 <TUANTU> / Sickler <TUANTU>" },
    { name: "虛空之刺 <TUANTU> / The Influence <TUANTU>" },
    { name: "瘟疫 <TUANTU> / Nosoi <TUANTU>" },
    { name: "否定一切者 <TUANTU> / The One Who Denies All <TUANTU>" },
],
    'ABN_ANGELA': [
        { name: "［LC 總指揮］安吉拉 / Angela" },
        { name: "［LibraryofRuina］安吉拉 / Director Angela" },
    ],
};

// ─── 數值實體覆蓋區 ──────────────────────────────────────────
const identityDetails = {
    '［漆黑噤默］羅蘭 / The Black Silence Roland': {
        skill1: { skillname: '杜蘭達爾 / Durandal', clashbase: 5, coins: 2, clashpower: 3, attack: 11, defense: 0 },
    },
};

// ─── Rate Up 對象（Pickup）────────────────────────────────────
const upTargets = {
    'Color Fixer': [
        "［蒼藍殘響］阿爾加利亞 / The Blue Reverberation Argalia",
    ], 
    '000': [
        "［次元折斷者］李箱 / Dimension Shredder Yi Sang",
    ],
};

// ─── 🛠️ 動態篩選工具 ──────────────────────────────────────────────
function filterIdentities(rarity, keyword) {
    const list = identityRegistry[rarity] || [];
    return list
        .filter(item => item && item.name && item.name.includes(keyword))
        .map(item => item.name);
}

// ─── 🎯 卡池設定檔 ──────────────────────────────────────────────
const BANNERS = {
    'Season': {
        id: 'Season',
        name: 'Season-7 賽季池 — 梅菲斯特號',
        description: '第七賽季人格概率 UP！',
        cost: { single:  65, ten: 650 },
        rateUp: {
            S3: ['［Cinq協會 南部5科］鴻璐 / Cinq Assoc. East Section 3 Hong Lu'],
            EGOS: [],
            S2: []
        }
    },
    
    'Season - 2': {
        id: 'Season',
        name: 'Season-7 賽季池 — 梅菲斯特號',
        description: '第七賽季人格概率 UP！',
        cost: { single:  65, ten: 650 },
        rateUp: {
            S3: [],
            EGOS: ['[ZAYIN] 我拿剪刀去，你呢？ - 唐吉訶德 / [ZAYIN] I ll Go fer Scissors. How Bout You? - Don Quixote'],
            S2: []
        }
    },
    'Season - 3': {
        id: 'Season',
        name: 'Season-7 賽季池 — 梅菲斯特號',
        description: '第七賽季人格概率 UP！',
        cost: { single:  65, ten: 650 },
        rateUp: {
            S3: [],
            EGOS: ['[TETH] 租借申請 - 格里高爾 / [TETH] Move-in Reg - Gregor'],
            S2: []
        }
    },
    'focus': {
        id: 'focus',
        name: '罪人特定提取 — Ryoshu Focus UP',
        description: '所有良秀 (Ryoshu) 的人格與 E.G.O 出現機率大幅提升！',
        cost: { single: 65, ten: 650 },
        rateUp: {
            S3: filterIdentities('000', '良秀'),
            S2: filterIdentities('00', '良秀'),
            EGOS: filterIdentities('Egos', '良秀')
        }
    },
    'standard': {
        id: 'standard',
        name: '常駐提取 — 邊獄公司',
        description: '包含所有基礎人格與 E.G.O 的常駐提取卡池。',
        cost: { single: 0, ten: 0 },
        rateUp: { S3: [], EGOS: [], S2: [] }
    }
};

// ─── 自動建構抽卡快取池 ──────────────────────────────────────────
const pool = {};
for (const [rarity, arr] of Object.entries(identityRegistry)) {
    pool[rarity] = arr.map(obj => obj.name);
}

function getIdentityData(name) {
    let exists = false;
    for (const arr of Object.values(identityRegistry)) {
        if (arr.some(obj => obj.name === name)) {
            exists = true;
            break;
        }
    }
    if (!exists) return null;

    const base = { name };
    const details = identityDetails[name];

    if (details) {
        for (const key of Object.keys(details)) {
            if (details[key] && typeof details[key] === 'object') {
                base[key] = { ...base[key], ...details[key] };
            } else {
                base[key] = details[key];
            }
        }
    }
    return base;
}

module.exports = {
    identities: identityDetails,
    registry: identityRegistry,
    pool,
    BANNERS,
    upTargets,
    filterIdentities,
    getIdentityData
};
