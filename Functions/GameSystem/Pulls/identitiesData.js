// Functions/GameSystem/Pulls/identitiesData.js
// 全人格資料庫 + 技能數值模板（0 = 待補）
// 格式說明：
//   skill1/2/3: { skillname:'', clashbase:0, coins:0, clashpower:0, attack:0, defense:0 }
//   evade:      { skillname:'', coins:0, clashpower:0, defense:0 }
//   counter:  [ { skillname:'', canclash:true/false, coins:0, clashpower:0, attack:0, defense:0 } ]

// ─── 預設模板函式（用於快速建立空值）────────────────────────
function T() {
    return {
        skill1:   { skillname:'', clashbase:0, coins:0, clashpower:0, attack:0, defense:0 },
        skill2:   { skillname:'', clashbase:0, coins:0, clashpower:0, attack:0, defense:0 },
        skill3:   { skillname:'', clashbase:0, coins:0, clashpower:0, attack:0, defense:0 },
        evade:    { skillname:'', coins:0, clashpower:0, defense:0 },
        counter: [
            { skillname:'', canclash:true,  coins:0, clashpower:0, attack:0, defense:0 },
            { skillname:'', canclash:false, coins:0, clashpower:0, attack:0, defense:0 },
        ],
    };
}

function Ego() {
    return {
        buff: {
            attack: [],
            defense: [],
            status: [],
        },
        passive: [],
        awakening: {
            skillname: '',
            coins: 0,
            clashpower: 0,
            attack: 0,
            defense: 0,
            cost: {
                wrath: 0,
                lust: 0,
                sloth: 0,
                gluttony: 0,
                gloom: 0,
                pride: 0,
                envy: 0,
            },
        },
        corrosion: {
            skillname: '',
            coins: 0,
            clashpower: 0,
            attack: 0,
            defense: 0,
            cost: {
                wrath: 0,
                lust: 0,
                sloth: 0,
                gluttony: 0,
                gloom: 0,
                pride: 0,
                envy: 0,
            },
        },
        notes: '',
    };
}

// ─── 覆蓋區（有數值的人格在這裡填入，其餘保持 T() 預設）────
// 用法：在下方 identityDetails 中覆蓋該人格的 T() 屬性
// 例：'［漆黑噤默］羅蘭': { ...T(), skill1:{ skillname:'銀沉默', clashbase:5, coins:3, clashpower:4, attack:12, defense:0 } }

// ─── 人格資料庫 ────────────────────────────────────────────
const identityDetails = {

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ Color Fixer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'Color Fixer': [
    { name:"［漆黑噤默］羅蘭 / The Black Silence Roland", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ Special
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'Special': [
    { name:"［黃金迪］索爾茲 / Gold of The Dih Solzc", ...T() },
    { name:"[NULL] 這裡沒有任何東西 / theres nothing", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ 0000 (★★★★)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'0000': [
    { name:" [su31j4u/ e9 d042l45k4ke72k7.] ... ", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ 000 (★★★)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'000': 
    [ name:" LCD現場推理小隊 以實瑪麗 / LCD OSIR Team Ishmael", ...T() },
    { name:"［蜘蛛巢：食指 父輩］李箱 / The House of Spiders: Index Nursefather Yi Sang", ...T() },
    { name:"［蜘蛛巢：食指 父輩］李箱 / The House of Spiders: Index Nursefather Yi Sang", ...T() },
    { name:"［蜘蛛巢：中指 父輩］奧提斯 / The House of Spiders: Middle Nursefather Outis", ...T() },
    { name:"［蜘蛛巢：環指 父輩］鴻璐 / The House of Spiders: Ring Nursefather Hong Lu", ...T() },
    { name:"［蜘蛛巢之刃] 良秀 / Blade of the House of Spiders Ryōshū", ...T() },
    { name:"［環指 野獸派 講解員］羅佳 / The Ring Fauvist Lecturer Rodion", ...T() },
    { name:"［環指 點描派 學生］奧提斯 / The Ring Pointillist Student Outis", ...T() },
    { name:"［環指 點描派 學生］李箱 / The Ring Pointillist Student Yi Sang", ...T() },
    { name:"［食指 代理人 - 綻放E.G.O：代行］堂吉訶德 / The Index Proxy - Effloresced E.G.O::Procuration Don Quixote", ...T() },
    { name:"［中指 幼兄］希斯克里夫 / Middle Big Brother Heathcliff", ...T() },
    { name:"［蜘蛛巢：指環 學徒］浮士德 / The House of Spiders: Ring Apprentice Faust", ...T() },
    { name:"［蜘蛛巢：中指 學徒］以實瑪利 / The House of Spiders: Middle Apprentice Ishmael", ...T() },
    { name:"［蜘蛛巢：小指 學徒］辛克萊 / The House of Spiders: Pinky Apprentice Sinclair", ...T() },
    { name:"［食指 傳令：【紙條】］浮士德 / The Index Messenger: Slip Faust", ...T() },
    { name:"［中指 幼妹］堂吉訶德 / The Middle Little Sister Don Quixote", ...T() },
    { name:"［中指 幼弟］辛克萊 / The Middle Little Brother Sinclair", ...T() },
    { name:"［鴻園之主］鴻璐 / Lord of Hongyuan Hong Lu", ...T() },
    { name:"［家主候選人］以實瑪利 / Family Hierarch Candidate Ishmael", ...T() },
    { name:"［鴻園的流浪武者］良秀 / Drifting Blade of Hongyuan Ryōshū", ...T() },
    { name:"［拇指東部指揮官 IIII］默爾索 / The Thumb East Capo IIII Meursault", ...T() },
    { name:"［東部拇指 士兵 II］辛克萊 / The Thumb East Soldato II Sinclair", ...T() },
    { name:"［黑獸-未］堂吉訶德 / Heishou Pack - Wei Branch Don Quixote", ...T() },
    { name:"［黑獸-巳］格里高爾 / Heishou Pack - Si Branch Gregor", ...T() },
    { name:"［黑獸-巳］羅佳 / Heishou Pack - Si Branch Rodion", ...T() },
    { name:"［黑獸-午 魁首］李箱 / Heishou Pack - Wu Branch Adept Yi Sang", ...T() },
    { name:"［黑獸-卯 魁首］浮士德 / Heishou Pack - Mao Branch Adept Faust", ...T() },
    { name:"［黑獸-酉 魁首］希斯克里夫 / Heishou Pack - You Branch Adept Heathcliff", ...T() },
    { name:"［黑獸-酉］辛克萊 / Heishou Pack - You Branch Sinclair", ...T() },
    { name:"［黑獸-卯］奧提斯 / Heishou Pack - Mao Branch Outis", ...T() },
    { name:"［黑獸-卯］良秀 / Heishou Pack - Mao Branch Ryōshū", ...T() },
    { name:"［拉曼查·卻領 總督］堂吉訶德 / The Manager of La Manchaland Don Quixote", ...T() },
    { name:"［拉曼查·卻領 王子］默爾索 / The Prince of La Manchaland Meursault", ...T() },
    { name:"［拉曼查·卻領 公主］羅佳 / The Princess of La Manchaland Rodion", ...T() },
    { name:"［拉曼查·卻領 神父］格里高爾 / The Priest of La Manchaland Gregor", ...T() },
    { name:"［拉曼查·卻領 理髮師］奧提斯 / The Barber of La Manchaland Outis", ...T() },
    { name:"［句點事務所收尾人］希斯克里夫 / Full-Stop Office Fixer Heathcliff", ...T() },
    { name:"［句點事務所代表］鴻璐 / Full-Stop Office Rep Hong Lu", ...T() },
    { name:"［夜錐組隊長］格里高爾 / Night Awls Capitano Gregor", ...T() },
    { name:"［腦業公司 E.G.O::哀悼］李箱 / Lobotomy E.G.O::Solemn Lament Yi Sang", ...T() },
    { name:"［腦業公司 E.G.O::赤瞳&懺悔］良秀 / Lobotomy E.G.O::Red Eyes & Penitence Ryōshū", ...T() },
    { name:"［腦業公司 E.G.O::懊悔］浮士德 / Lobotomy E.G.O::Regret Faust", ...T() },
    { name:"［腦業公司 E.G.O::以愛與恨之名］堂吉訶德 / Lobotomy E.G.O::In the Name of Love and Hate Don Quixote", ...T() },
    { name:"［腦業公司 E.G.O::幽香與孤寂］良秀 / Lobotomy E.G.O::Faint Aroma & Solitude Ryōshū", ...T() },
    { name:"［腦業公司 E.G.O::大黃蜂【變異】］默爾索 / Lobotomy E.G.O::Hornet【Alteration】Meursault", ...T() },
    { name:"［腦業公司 E.G.O::狐雨］希斯克里夫 / Lobotomy E.G.O::Sunshower Heathcliff", ...T() },
    { name:"［腦業公司 E.G.O::淚鋒之劍］羅佳 / Lobotomy E.G.O::The Sword Sharpened with Tears Rodion", ...T() },
    { name:"［腦業公司 E.G.O::魔彈］奧提斯 / Lobotomy E.G.O::Magic Bullet Outis", ...T() },
    { name:"［LCE E.G.O::AEDD］格里高爾 / LCE E.G.O::AEDD Gregor", ...T() },
    { name:"［LCE E.G.O::炎雀］浮士德 / LCE E.G.O::Ardor Blossom Star Faust", ...T() },
    { name:"［腦業公司 E.G.O::目燈］格里高爾 / Lobotomy E.G.O::Lamp Gregor", ...T() },
    { name:"［開花E.G.O：山茶花］李箱 / Effloresced E.G.O::Spicebush Yi Sang", ...T() },
    { name:"［呼嘯山莊 首席管家］奧提斯 / Wuthering Heights Chief Butler Outis", ...T() },
    { name:"［埃德加家族 首席管家］良秀 / Edgar Family Chief Butler Ryōshū", ...T() },
    { name:"［埃德加家族 繼承人］格里高爾 / Edgar Family Heir Gregor", ...T() },
    { name:"［斐廓德號 船長］以實瑪利 / Pequod Captain Ishmael", ...T() },
    { name:"［斐廓德號 魚叉手］希斯克里夫 / Pequod Harpooneer Heathcliff", ...T() },
    { name:"［狂獵］希斯克里夫 / Wild Hunt Heathcliff", ...T() },
    { name:"［豆豆幫幫主］鴻璐 / Tingtang Gang GangLeader Hong Lu", ...T() },
    { name:"［劍契 殺手］李箱 / Blade Lineage Salsu Yi Sang", ...T() },
    { name:"［劍契 殺手］浮士德 / Blade Lineage Salsu Faust", ...T() },
    { name:"［劍契 殺手］辛克萊 / Blade Lineage Salsu Sinclair", ...T() },
    { name:"［劍契 導師］默爾索 / Blade Lineage Mentor Meursault", ...T() },
    { name:"［黑雲會 組長］以實瑪利 / Kurokumo Clan Captain Ishmael", ...T() },
    { name:"［黑雲會 眾］希斯克里夫 / Kurokumo Clan Wakashu Heathcliff", ...T() },
    { name:"［黑雲會 眾］羅佳 / Kurokumo Clan Wakashu Rodion", ...T() },
    { name:"［黑雲會 眾］良秀 / Kurokumo Clan Wakashu Ryōshū", ...T() },
    { name:"［W公司 2區 清掃人員］奧提斯 / W Corp. L3 Cleanup Captain Outis", ...T() },
    { name:"［W公司 2區 清掃人員］默爾索 / W Corp. L2 Cleanup Agent Meursault", ...T() },
    { name:"［W公司 3區 清掃人員］李箱 / W Corp. L3 Cleanup Agent Yi Sang", ...T() },
    { name:"［W公司 3區 清掃人員］良秀 / W Corp. L3 Cleanup Agent Ryōshū", ...T() },
    { name:"［W公司 3區 清掃人員］堂吉訶德 / W Corp. L3 Cleanup Agent Don Quixote", ...T() },
    { name:"［W公司 4區 清掃人員］希斯克里夫 / W Corp. L4 Cleanup Agent - CCA Heathcliff", ...T() },
    { name:"［R公司 4區 兔子組］希斯克里夫 / R Corp. 4th Pack Rabbit Heathcliff", ...T() },
    { name:"［R公司 4區 馴鹿組］以實瑪利 / R Corp. 4th Pack Reindeer Ishmael", ...T() },
    { name:"［R公司 4區 馴鹿組］羅佳 / R Corp. 4th Pack Reindeer Rodion", ...T() },
    { name:"［R公司 4區 馴鹿組］鴻璐 / R Corp. 4th Pack Reindeer Hong Lu", ...T() },
    { name:"［R公司 4區 犀牛組］默爾索 / R Corp. 4th Pack Rhino Meursault", ...T() },
    { name:"［K公司 3級 剔除人員］鴻璐 / K Corp. Excision Staff Class 3 Hong Lu", ...T() },
    { name:"［T公司 3級 征收人員］堂吉訶德 / T Corp. Class 3 Collection Staff Don Quixote", ...T() },
    { name:"［G公司 下士］格里高爾 / G Corp. Corporal Gregor", ...T() },
    { name:"［N公司 執柄者］浮士德 / The One Who Grips Faust", ...T() },
    { name:"［N公司 準執柄者］辛克萊 / The One Who Shall Grip Sinclair", ...T() },
    { name:"［N公司 大錘］默爾索 / N Corp. Großhammer Meursault", ...T() },
    { name:"［N公司 E.G.O::凶彈］李箱 / N Corp. E.G.O::Fell Bullet Yi Sang", ...T() },
    { name:"［N公司 E.G.O::輕蔑, 敬畏］良秀 / N Corp. E.G.O::Contempt, Awe Ryōshū", ...T() },
    { name:"［七協會 南部6科 部長］奧提斯 / Seven Assoc. South Section 6 Director Outis", ...T() },
    { name:"［七協會 南部4科］浮士德 / Seven Assoc. South Section 4 Faust", ...T() },
    { name:"［六協會 南部4科 部長］羅佳 / Liu Assoc. South Section 4 Rodion", ...T() },
    { name:"［五協會 南部5科 科長］堂吉訶德 / Cinq Assoc. South Section 5 Director Don Quixote", ...T() },
    { name:"［Cinq協會 南部5科］堂吉訶德 / Cinq Assoc. South Section 5 Don Quixote", ...T() },
    { name:"［Cinq協會 東部3科］堂吉訶德 / Cinq Assoc. East Section 3 Don Quixote", ...T() },
    { name:"［Cinq協會 西部3科］默爾索 / Cinq Assoc. West Section 3 Meursault", ...T() },
    { name:"［Zwei協會 西部3科］以實瑪利 / Zwei Assoc. West Section 3 Ishmael", ...T() },
    { name:"［Dieci協會 南部4科］羅佳 / Dieci Assoc. South Section 4 Rodion", ...T() },
    { name:"［Dieci協會 南部4科］鴻璐 / Dieci Assoc. South Section 4 Hong Lu", ...T() },
    { name:"［Dieci協會 南部4科］默爾索 / Dieci Assoc. South Section 4 Meursault", ...T() },
    { name:"［Devyat協會 北部3科］羅佳 / Devyat' Assoc. North Section 3 Rodion", ...T() },
    { name:"［Devyat協會 北部3科］辛克萊 / Devyat' Assoc. North Section 3 Sinclair", ...T() },
    { name:"［Öufi協會 南部3科］希斯克里夫 / Öufi Assoc. South Section 3 Heathcliff", ...T() },
    { name:"［LCA 烏加特先鋒 第三小隊 隊長］奧提斯 / LCA Udjat Vanguard Team 3 Leader Outis", ...T() },
    { name:"［黎明事務所 幫手］辛克萊 / Dawn Office Fixer Sinclair", ...T() },
    { name:"［臼齒事務所 幫手］奧提斯 / Molar Office Fixer Outis", ...T() },
    { name:"［鄭氏事務所 代理］以實瑪利 / Jeong's Office Representative Ishmael", ...T() },
    { name:"［多裂紋事務所 代理］浮士德 / Multicrack Office Representative Faust", ...T() },
    { name:"［火拳事務所 倖存者］格里高爾 / Firefist Office Survivor Gregor", ...T() },
    { name:"［雙鉤海賊團 一副］格里高爾 / Twinhook Pirates First Mate Gregor", ...T() },
    { name:"［Liu協會 南部3科］李箱 / Liu Assoc. South Section 3 Yi Sang", ...T() },
    { name:"［Liu協會 南部4科］以實瑪利 / Liu Assoc. South Section 4 Ishmael", ...T() },
    { name:"［臼齒船舶事務所 幫手］以實瑪利 / Molar Boatworks Fixer Ishmael", ...T() },
    { name:"［20區聖愚］鴻璐 / District 20 Yurodivy Hong Lu", ...T() },
    { name:"［玫瑰扳手工坊 代理］羅佳 / Rosespanner Workshop Rep Rodion", ...T() },
    { name:"［Shi協會 東部3科］浮士德 / Shi Assoc. East Section 3 Faust", ...T() },
    { name:"［R.B. 廚師長］良秀 / R.B. Chef de Cuisine Ryōshū", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ 00 (★★)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'00': [
    { name:"［中指 小弟］默爾索 / Middle Brother Meursault", ...T() },
    { name:"［黑雲會 眾］鴻璐 / Kurokumo Clan Member Hong Lu", ...T() },
    { name:"［黑雲會 組長］格里高爾 / Kurokumo Clan Captain Gregor", ...T() },
    { name:"［LCE E.G.O::提燈］李箱 / LCE E.G.O::Lantern Yi Sang", ...T() },
    { name:"［腦業公司 E.G.O::紅符］辛克萊 / Lobotomy E.G.O::Red Sheet Sinclair", ...T() },
    { name:"［腦業公司 E.G.O::游移］以實瑪利 / Lobotomy E.G.O::Sloshing Ishmael", ...T() },
    { name:"［W公司 2區 清掃人員］浮士德 / W Corp. L2 Cleanup Agent Faust", ...T() },
    { name:"［W公司 2區 清掃人員］鴻璐 / W Corp. L2 Cleanup Agent Hong Lu", ...T() },
    { name:"［N公司 中錘］堂吉訶德 / N Corp. Mittelhammer Don Quixote", ...T() },
    { name:"［N公司 中錘］羅佳 / N Corp. Mittelhammer Rodion", ...T() },
    { name:"［N公司 小錘］希斯克里夫 / N Corp. Kleinhammer Heathcliff", ...T() },
    { name:"［Shi協會 南部5科 部長］堂吉訶德 / Shi Assoc. South Section 5 Director Don Quixote", ...T() },
    { name:"［Shi協會 南部5科］以實瑪利 / Shi Assoc. South Section 5 Ishmael", ...T() },
    { name:"［Shi協會 南部5科］希斯克里夫 / Shi Assoc. South Section 5 Heathcliff", ...T() },
    { name:"［Zwei協會 南部6科］辛克萊 / Zwei Assoc. South Section 6 Sinclair", ...T() },
    { name:"［Zwei協會 南部6科］格里高爾 / Zwei Assoc. South Section 6 Gregor", ...T() },
    { name:"［Zwei協會 南部4科］浮士德 / Zwei Assoc. South Section 4 Faust", ...T() },
    { name:"［Liu協會 南部6科］默爾索 / Liu Assoc. South Section 6 Meursault", ...T() },
    { name:"［Liu協會 南部6科］格里高爾 / Liu Assoc. South Section 6 Gregor", ...T() },
    { name:"［Liu協會 南部5科］鴻璐 / Liu Assoc. South Section 5 Hong Lu", ...T() },
    { name:"［Liu協會 南部4科］良秀 / Liu Assoc. South Section 4 Ryōshū", ...T() },
    { name:"［七協會 南部6科］李箱 / Seven Assoc. South Section 6 Yi Sang", ...T() },
    { name:"［七協會 南部6科］良秀 / Seven Assoc. South Section 6 Ryōshū", ...T() },
    { name:"［七協會 南部4科］希斯克里夫 / Seven Assoc. South Section 4 Heathcliff", ...T() },
    { name:"［Cinq協會 南部4科］奧提斯 / Cinq Assoc. South Section 4 Outis", ...T() },
    { name:"［咆哮山莊 管家］浮士德 / Wuthering Heights Butler Faust", ...T() },
    { name:"［埃德加族 管家］以實瑪利 / Edgar Family Butler Ishmael", ...T() },
    { name:"［劍契 殺手］堂吉訶德 / Blade Lineage Salsu Don Quixote", ...T() },
    { name:"［劍契 殺手］奧提斯 / Blade Lineage Salsu Outis", ...T() },
    { name:"［LCCB 助理經理］以實瑪利 / LCCB Assistant Manager Ishmael", ...T() },
    { name:"［LCCB 助理經理］良秀 / LCCB Assistant Manager Ryōshū", ...T() },
    { name:"［LCCB 助理經理］羅佳 / LCCB Assistant Manager Rodion", ...T() },
    { name:"［玫瑰扳手工坊 幫手］默爾索 / Rosespanner Workshop Fixer Meursault", ...T() },
    { name:"［玫瑰扳手工坊 幫手］格里高爾 / Rosespanner Workshop Fixer Gregor", ...T() },
    { name:"［臼齒船舶事務所 幫手］辛克萊 / Molar Boatworks Fixer Sinclair", ...T() },
    { name:"［臼齒事務所 幫手］李箱 / Molar Office Fixer Yi Sang", ...T() },
    { name:"［鉤子事務所 幫手］鴻璐 / Hook Office Fixer Hong Lu", ...T() },
    { name:"［20區聖愚］良秀 / District 20 Yurodivy Ryōshū", ...T() },
    { name:"［洛斯馬利亞契 老大］辛克萊 / Los Mariachis Jefe Sinclair", ...T() },
    { name:"［死兔黨 老大］默爾索 / Dead Rabbits Boss Meursault", ...T() },
    { name:"［R.B. 副主廚］格里高爾 / R.B. Sous-chef Gregor", ...T() },
    { name:"［斐廓德號 一副］李箱 / Pequod First Mate Yi Sang", ...T() },
    { name:"［Dieci協會 南部4科］李箱 / Dieci Assoc. South Section 4 Yi Sang", ...T() },
    { name:"［G公司 科長］奧提斯 / G Corp. Head Manager Outis", ...T() },
    { name:"［獵牙事務所收尾人］鴻璐 / Fanghunt Office Fixer Hong Lu", ...T() },
    { name:"［腦業公司 E.G.O::提燈］堂吉訶德 / Lobotomy E.G.O::Lantern Don Quixote", ...T() },
    { name:"［多裂紋事務所收尾人］希斯克里夫 / MultiCrack Office Fixer Heathcliff", ...T() },
    { name:"［T公司 2級征收人員］羅佳 / T Corp. Class 2 Collection Staff Rodion", ...T() },
    { name:"［Zwei協會南部6科］辛克萊 / Zwei Assoc. West Section 3 Sinclair", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ 0 (★ / LCB)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'0': [
    { name:"［邊獄公司 罪人］李箱 / LCB Sinner Yi Sang", ...T() },
    { name:"［邊獄公司 罪人］浮士德 / LCB Sinner Faust", ...T() },
    { name:"［邊獄公司 罪人］堂吉訶德 / LCB Sinner Don Quixote", ...T() },
    { name:"［邊獄公司 罪人］良秀 / LCB Sinner Ryōshū", ...T() },
    { name:"［邊獄公司 罪人］默爾索 / LCB Sinner Meursault", ...T() },
    { name:"［邊獄公司 罪人］希斯克里夫 / LCB Sinner Heathcliff", ...T() },
    { name:"［邊獄公司 罪人］以實瑪利 / LCB Sinner Ishmael", ...T() },
    { name:"［邊獄公司 罪人］鴻璐 / LCB Sinner Hong Lu", ...T() },
    { name:"［邊獄公司 罪人］羅佳 / LCB Sinner Rodion", ...T() },
    { name:"［邊獄公司 罪人］辛克萊 / LCB Sinner Sinclair", ...T() },
    { name:"［邊獄公司 罪人］奧提斯 / LCB Sinner Outis", ...T() },
    { name:"［邊獄公司 罪人］格里高爾 / LCB Sinner Gregor", ...T() },
],

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ★ Egos
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'Egos': [
// Yi Sang
    {
        id: "ego_yi_sang_crows_eye_view",
        sinner: "Yi Sang",
        risk: "ZAYIN",
        name: "[ZAYIN] 烏鴉之眼 / Crow's Eye View - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_bygone_days",
        sinner: "Yi Sang",
        risk: "ZAYIN",
        name: "[ZAYIN] 往昔歲月 / Bygone Days - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_4th_match_flame",
        sinner: "Yi Sang",
        risk: "TETH",
        name: "[TETH] 第四火焰 / 4th Match Flame - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_wishing_cairn",
        sinner: "Yi Sang",
        risk: "TETH",
        name: "[TETH] 願望石冢 / Wishing Cairn - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_dimension_shredder",
        sinner: "Yi Sang",
        risk: "HE",
        name: "[HE] 次元撕裂者 / Dimension Shredder - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_fell_bullet",
        sinner: "Yi Sang",
        risk: "HE",
        name: "[HE] 墮彈 / Fell Bullet - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_sunshower",
        sinner: "Yi Sang",
        risk: "WAW",
        name: "[WAW] 太陽雨 / Sunshower - 李箱",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_yi_sang_great_trichiliocosm",
        sinner: "Yi Sang",
        risk: "WAW",
        name: "[WAW] 三千大世界 / Great Trichiliocosm - 李箱",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Faust
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_faust_representation_emitter",
        sinner: "Faust",
        risk: "ZAYIN",
        name: "[ZAYIN] 表象放射器 / Representation Emitter - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_hex_nail",
        sinner: "Faust",
        risk: "TETH",
        name: "[TETH] 咒釘 / Hex Nail - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_9_2",
        sinner: "Faust",
        risk: "TETH",
        name: "[TETH] 9:2 - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_lasso",
        sinner: "Faust",
        risk: "TETH",
        name: "[TETH] 套索 / Lasso - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_fluid_sac",
        sinner: "Faust",
        risk: "HE",
        name: "[HE] 液囊 / Fluid Sac - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_telepole",
        sinner: "Faust",
        risk: "HE",
        name: "[HE] 電線桿 / Telepole - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_thoracalgia",
        sinner: "Faust",
        risk: "HE",
        name: "[HE] 胸痛 / Thoracalgia - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_command_meltdown",
        sinner: "Faust",
        risk: "HE",
        name: "[HE] 熔毀指令 / Command : Meltdown - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_ardor_blossom_star",
        sinner: "Faust",
        risk: "HE",
        name: "[HE] 熾花星 / Ardor Blossom Star - 浮士德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_faust_everlasting",
        sinner: "Faust",
        risk: "WAW",
        name: "[WAW] 永恆 / Everlasting - 浮士德",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Don Quixote
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_don_quixote_la_sangre_de_sancho",
        sinner: "Don Quixote",
        risk: "ZAYIN",
        name: "[ZAYIN] 桑丘之血 / La Sangre de Sancho - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_lifetime_stew",
        sinner: "Don Quixote",
        risk: "TETH",
        name: "[TETH] 一生燉湯 / Lifetime Stew - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_wishing_cairn",
        sinner: "Don Quixote",
        risk: "TETH",
        name: "[TETH] 願望石冢 / Wishing Cairn - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_electric_screaming",
        sinner: "Don Quixote",
        risk: "TETH",
        name: "[TETH] 電擊尖叫 / Electric Screaming - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_fluid_sac",
        sinner: "Don Quixote",
        risk: "HE",
        name: "[HE] 液囊 / Fluid Sac - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_telepole",
        sinner: "Don Quixote",
        risk: "HE",
        name: "[HE] 電線桿 / Telepole - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_red_sheet",
        sinner: "Don Quixote",
        risk: "HE",
        name: "[HE] 紅紙片 / Red Sheet - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_yearning_mircalla",
        sinner: "Don Quixote",
        risk: "WAW",
        name: "[WAW] 渴望-米爾卡拉 / Yearning-Mircalla - 唐吉訶德",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_don_quixote_in_the_name_of_love_and_hate",
        sinner: "Don Quixote",
        risk: "WAW",
        name: "[WAW] 愛與恨之名 / In the Name of Love and Hate - 唐吉訶德",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ryoshu
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_ryoshu_forest_for_the_flames",
        sinner: "Ryoshu",
        risk: "ZAYIN",
        name: "[ZAYIN] 森林與火焰 / Forest for the Flames - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_soda",
        sinner: "Ryoshu",
        risk: "ZAYIN",
        name: "[ZAYIN] 蘇打 / Soda - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_red_eyes",
        sinner: "Ryoshu",
        risk: "TETH",
        name: "[TETH] 紅眼 / Red Eyes - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_blind_obsession",
        sinner: "Ryoshu",
        risk: "TETH",
        name: "[TETH] 盲目痴迷 / Blind Obsession - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_4th_match_flame",
        sinner: "Ryoshu",
        risk: "HE",
        name: "[HE] 第四火焰 / 4th Match Flame - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_red_eyes_open",
        sinner: "Ryoshu",
        risk: "HE",
        name: "[HE] 紅眼開 / Red Eyes (Open) - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_thoracalgia",
        sinner: "Ryoshu",
        risk: "HE",
        name: "[HE] 胸痛 / Thoracalgia - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_contempt_awe",
        sinner: "Ryoshu",
        risk: "WAW",
        name: "[WAW] 輕蔑，敬畏 / Contempt, Awe - 良秀",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ryoshu_great_trichiliocosm",
        sinner: "Ryoshu",
        risk: "WAW",
        name: "[WAW] 三千大世界 / Great Trichiliocosm - 良秀",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Meursault
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_meursault_chains_of_others",
        sinner: "Meursault",
        risk: "ZAYIN",
        name: "[ZAYIN] 他人之繩 / Chains of Others - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_screwloose_wallop",
        sinner: "Meursault",
        risk: "TETH",
        name: "[TETH] 亂槍亂打 / Screwloose Wallop - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_regret",
        sinner: "Meursault",
        risk: "TETH",
        name: "[TETH] 悔恨 / Regret - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_electric_screaming",
        sinner: "Meursault",
        risk: "TETH",
        name: "[TETH] 電擊尖叫 / Electric Screaming - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_pursuance",
        sinner: "Meursault",
        risk: "HE",
        name: "[HE] 執行 / Pursuance - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_capote",
        sinner: "Meursault",
        risk: "HE",
        name: "[HE] 卡波特 / Capote - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_yearning_mircalla",
        sinner: "Meursault",
        risk: "WAW",
        name: "[WAW] 渴望-米爾卡拉 / Yearning-Mircalla - 默爾索",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_meursault_crushbound_past",
        sinner: "Meursault",
        risk: "WAW",
        name: "[WAW] 壓裂往昔 / Crushbound Past - 默爾索",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Hong Lu
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_hong_lu_land_of_illusion",
        sinner: "Hong Lu",
        risk: "ZAYIN",
        name: "[ZAYIN] 幻境之地 / Land of Illusion - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_roseate_desire",
        sinner: "Hong Lu",
        risk: "TETH",
        name: "[TETH] 玫瑰慾望 / Roseate Desire - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_soda",
        sinner: "Hong Lu",
        risk: "TETH",
        name: "[TETH] 蘇打 / Soda - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_cavernous_wailing",
        sinner: "Hong Lu",
        risk: "TETH",
        name: "[TETH] 空洞哀鳴 / Cavernous Wailing - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_lasso",
        sinner: "Hong Lu",
        risk: "TETH",
        name: "[TETH] 套索 / Lasso - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_dimension_shredder",
        sinner: "Hong Lu",
        risk: "HE",
        name: "[HE] 次元撕裂者 / Dimension Shredder - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_effervescent_corrosion",
        sinner: "Hong Lu",
        risk: "HE",
        name: "[HE] 泡沫腐蝕 / Effervescent Corrosion - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_to_remain_oneself",
        sinner: "Hong Lu",
        risk: "HE",
        name: "[HE] 留住自我 / To Remain Oneself - 鴻璐",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_hong_lu_tears_of_the_tarnished_blood",
        sinner: "Hong Lu",
        risk: "WAW",
        name: "[WAW] 被玷污的血之淚 / Tears of the Tarnished Blood - 鴻璐",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Heathcliff
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_heathcliff_bodysack",
        sinner: "Heathcliff",
        risk: "ZAYIN",
        name: "[ZAYIN] 破布袋 / Bodysack - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_holiday",
        sinner: "Heathcliff",
        risk: "ZAYIN",
        name: "[ZAYIN] 假日 / Holiday - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_aedd",
        sinner: "Heathcliff",
        risk: "TETH",
        name: "[TETH] AEDD - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_fell_bullet",
        sinner: "Heathcliff",
        risk: "TETH",
        name: "[TETH] 墮彈 / Fell Bullet - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_move_in_reg",
        sinner: "Heathcliff",
        risk: "TETH",
        name: "[TETH] 搬入規章 / Move-in Reg. - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_telepole",
        sinner: "Heathcliff",
        risk: "HE",
        name: "[HE] 電線桿 / Telepole - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_ya_shunyata_tad_rupam",
        sinner: "Heathcliff",
        risk: "HE",
        name: "[HE] 那 Śūnyatā 即 Rūpam / Ya Śūnyatā Tad Rūpam - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_asymmetrical_inertia",
        sinner: "Heathcliff",
        risk: "HE",
        name: "[HE] 非對稱慣性 / Asymmetrical Inertia - 希斯克里夫",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_heathcliff_binds",
        sinner: "Heathcliff",
        risk: "WAW",
        name: "[WAW] 束縛 / Binds - 希斯克里夫",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ishmael
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_ishmael_snagharpoon",
        sinner: "Ishmael",
        risk: "ZAYIN",
        name: "[ZAYIN] 魚叉 / Snagharpoon - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_hundred_footed_death_maggot",
        sinner: "Ishmael",
        risk: "ZAYIN",
        name: "[ZAYIN] 百足死亡蛆 / Hundred-Footed Death Maggot - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_roseate_desire",
        sinner: "Ishmael",
        risk: "TETH",
        name: "[TETH] 玫瑰慾望 / Roseate Desire - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_capote",
        sinner: "Ishmael",
        risk: "TETH",
        name: "[TETH] 卡波特 / Capote - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_bygone_days",
        sinner: "Ishmael",
        risk: "TETH",
        name: "[TETH] 往昔歲月 / Bygone Days - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_ardor_blossom_star",
        sinner: "Ishmael",
        risk: "HE",
        name: "[HE] 熾花星 / Ardor Blossom Star - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_wingbeat",
        sinner: "Ishmael",
        risk: "HE",
        name: "[HE] 振翅 / Wingbeat - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_christmas_nightmare",
        sinner: "Ishmael",
        risk: "HE",
        name: "[HE] 聖誕惡夢 / Christmas Nightmare - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_tidal_elegy",
        sinner: "Ishmael",
        risk: "HE",
        name: "[HE] 潮汐輓歌 / Tidal Elegy - 以實瑪利",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_ishmael_blind_obsession",
        sinner: "Ishmael",
        risk: "WAW",
        name: "[WAW] 盲目痴迷 / Blind Obsession - 以實瑪利",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rodion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_rodion_what_is_cast",
        sinner: "Rodion",
        risk: "ZAYIN",
        name: "[ZAYIN] 所謂之物 / What is Cast - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_into_the_sunset",
        sinner: "Rodion",
        risk: "ZAYIN",
        name: "[ZAYIN] 夕陽之下 / Into the Sunset - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_rime_shank",
        sinner: "Rodion",
        risk: "TETH",
        name: "[TETH] 霜脊 / Rime Shank - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_effervescent_corrosion",
        sinner: "Rodion",
        risk: "TETH",
        name: "[TETH] 泡沫腐蝕 / Effervescent Corrosion - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_4th_match_flame",
        sinner: "Rodion",
        risk: "HE",
        name: "[HE] 第四火焰 / 4th Match Flame - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_pursuance",
        sinner: "Rodion",
        risk: "HE",
        name: "[HE] 執行 / Pursuance - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_hex_nail",
        sinner: "Rodion",
        risk: "HE",
        name: "[HE] 咒釘 / Hex Nail - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_sanguine_desire",
        sinner: "Rodion",
        risk: "WAW",
        name: "[WAW] 血色慾望 / Sanguine Desire - 羅佳",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_rodion_indicants_trial",
        sinner: "Rodion",
        risk: "WAW",
        name: "[WAW] 指引者的試煉 / Indicant's Trial - 羅佳",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sinclair
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_sinclair_branch_of_knowledge",
        sinner: "Sinclair",
        risk: "ZAYIN",
        name: "[ZAYIN] 知識之枝 / Branch of Knowledge - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_cavernous_wailing",
        sinner: "Sinclair",
        risk: "ZAYIN",
        name: "[ZAYIN] 空洞哀鳴 / Cavernous Wailing - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_impending_day",
        sinner: "Sinclair",
        risk: "TETH",
        name: "[TETH] 迫近之日 / Impending Day - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_lifetime_stew",
        sinner: "Sinclair",
        risk: "TETH",
        name: "[TETH] 一生燉湯 / Lifetime Stew - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_hex_nail",
        sinner: "Sinclair",
        risk: "TETH",
        name: "[TETH] 咒釘 / Hex Nail - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_lantern",
        sinner: "Sinclair",
        risk: "HE",
        name: "[HE] 燈籠 / Lantern - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_9_2",
        sinner: "Sinclair",
        risk: "HE",
        name: "[HE] 9:2 - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_harmony",
        sinner: "Sinclair",
        risk: "HE",
        name: "[HE] 和諧 / Harmony - 辛克萊",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_sinclair_tears_of_the_tarnished_blood",
        sinner: "Sinclair",
        risk: "WAW",
        name: "[WAW] 被玷污的血之淚 / Tears of the Tarnished Blood - 辛克萊",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Outis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_outis_to_pathos_mathos",
        sinner: "Outis",
        risk: "ZAYIN",
        name: "[ZAYIN] 知識之路 / To Páthos Máthos - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_ill_go_fer_scissors_how_bout_you",
        sinner: "Outis",
        risk: "ZAYIN",
        name: "[ZAYIN] 我拿剪刀去，你呢？ / I'll Go fer Scissors. How 'Bout You? - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_ya_shunyata_tad_rupam",
        sinner: "Outis",
        risk: "TETH",
        name: "[TETH] 那 Śūnyatā 即 Rūpam / Ya Śūnyatā Tad Rūpam - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_sunshower",
        sinner: "Outis",
        risk: "TETH",
        name: "[TETH] 太陽雨 / Sunshower - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_ebony_stem",
        sinner: "Outis",
        risk: "HE",
        name: "[HE] 黑檀樹幹 / Ebony Stem - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_holiday",
        sinner: "Outis",
        risk: "HE",
        name: "[HE] 假日 / Holiday - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_dimension_shredder",
        sinner: "Outis",
        risk: "HE",
        name: "[HE] 次元撕裂者 / Dimension Shredder - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_magic_bullet",
        sinner: "Outis",
        risk: "HE",
        name: "[HE] 魔彈 / Magic Bullet - 奧提斯",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_outis_binds",
        sinner: "Outis",
        risk: "WAW",
        name: "[WAW] 束縛 / Binds - 奧提斯",
        owned: false,
        ...Ego()
    },

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gregor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        id: "ego_gregor_suddenly_one_day",
        sinner: "Gregor",
        risk: "ZAYIN",
        name: "[ZAYIN] 突然某日 / Suddenly, One Day - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_legerdemain",
        sinner: "Gregor",
        risk: "ZAYIN",
        name: "[ZAYIN] 苟延殘喘 / Legerdemain - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_lantern",
        sinner: "Gregor",
        risk: "TETH",
        name: "[TETH] 燈籠 / Lantern - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_bygone_days",
        sinner: "Gregor",
        risk: "TETH",
        name: "[TETH] 往昔歲月 / Bygone Days - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_aedd",
        sinner: "Gregor",
        risk: "HE",
        name: "[HE] AEDD - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_solemn_lament",
        sinner: "Gregor",
        risk: "HE",
        name: "[HE] 莊嚴哀歌 / Solemn Lament - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_christmas_nightmare",
        sinner: "Gregor",
        risk: "HE",
        name: "[HE] 聖誕惡夢 / Christmas Nightmare - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_garden_of_thorns",
        sinner: "Gregor",
        risk: "WAW",
        name: "[WAW] 荊棘之園 / Garden of Thorns - 格里高爾",
        owned: false,
        ...Ego()
    },
    {
        id: "ego_gregor_unbrilliant_glory",
        sinner: "Gregor",
        risk: "WAW",
        name: "[WAW] 無光榮輝 / Unbrilliant Glory - 格里高爾",
        owned: false,
        ...Ego()
    },
];

module.exports = { Egos, Ego };


// ─── Rate Up 對象（Pickup）────────────────────────────────────
const upTargets = {
    'Special': ["［漆黑噤默］羅蘭 / The Black Silence Roland"],
    '0000':    [null],
    'Egos': [null],
    '000': [null],
    '00': [null],
    '0':  [null],
};

// ─── 輔助函式 ─────────────────────────────────────────────────
// pool: 字串陣列（向下相容 PullSystem / PacksAndData 的 findRarity）
const pool = {};
for (const [r, arr] of Object.entries(identityDetails)) {
    pool[r] = arr.map(obj => obj.name);
}

// 查詢特定人格完整資料
function getIdentityData(name) {
    for (const arr of Object.values(identityDetails)) {
        const found = arr.find(obj => obj.name === name);
        if (found) return found;
    }
    return null;
}

// 依稀有度取得人格陣列（回傳名稱字串，保持舊 API）
function pullIdentity(rarity) {
    const arr = pool[rarity] || [];
    if (!arr.length) return '（該稀有度無資料）';
    return arr[Math.floor(Math.random() * arr.length)];
}

function pullUpIdentity(rarity) {
    const arr = upTargets[rarity] || [];
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
    identities: identityDetails,
    pool,
    upTargets,
    getIdentityData,
    pullIdentity,
    pullUpIdentity,
};
