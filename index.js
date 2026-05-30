const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} = require('discord.js');

const express = require('express');
const {
  pullIdentity,
  pullUpIdentity
} = require('./identitiesData.js');

/* ---------------- EXPRESS ---------------- */
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('Angela system online'));
app.listen(PORT, () => console.log('Web server running:', PORT));

/* ---------------- CONFIG ---------------- */
const systemStartTime = Date.now();
let totalChecks = 0;

const TARGET_USER = {
  username: 'LimbusCompany_B'
};

const NODES = [
  'https://nitter.net',
  'https://nitter.poast.org',
  'https://nitter.cz'
];

const CHANNEL_ID = '1402282604165730348';
const ROLE_MENTION = '<@&1406984068725211177>';

let lastTweetId = null;

/* ---------------- DISCORD ---------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ---------------- SAFE FETCH ---------------- */
async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/* ---------------- RSS PARSER ---------------- */
function parseRSS(xml) {
  const item = xml.match(/<item>[\s\S]*?<\/item>/)?.[0];
  if (!item) return null;

  const link = item.match(/<link>(.*?)<\/link>/)?.[1];
  const id = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1];

  if (!link || !id) return null;

  return {
    link: link.replace('http://', 'https://'),
    id
  };
}

/* ---------------- TWITTER CHECK ---------------- */
async function checkTweets() {
  totalChecks++;

  for (const node of NODES) {
    try {
      const res = await fetchWithTimeout(`${node}/${TARGET_USER.username}/rss`);
      if (!res.ok) continue;

      const xml = await res.text();
      const data = parseRSS(xml);
      if (!data) continue;

      const vxLink = data.link.replace(
        /^https:\/\/[^/]+/,
        'https://vxtwitter.com'
      );

      // init cache
      if (!lastTweetId) {
        lastTweetId = data.id;
        console.log('[INIT]', data.id);
        break;
      }

      // new tweet
      if (data.id !== lastTweetId) {
        lastTweetId = data.id;

        const ch = await client.channels.fetch(CHANNEL_ID);
        if (ch) {
          ch.send(`${ROLE_MENTION}\n🔔 New post:\n${vxLink}`);
        }
      }

      break;
    } catch (e) {
      console.log(`[${node}] failed`);
    }
  }
}

/* ---------------- READY ---------------- */
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    status: 'idle',
    activities: [{
      name: 'Limbus Monitoring',
      type: ActivityType.Watching
    }]
  });

  setInterval(checkTweets, 60 * 1000);
  checkTweets();
});

/* ---------------- COMMANDS ---------------- */
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  const c = msg.content.trim();

  /* ---------------- BASIC ---------------- */
  if (c === '!ping') return msg.reply('pong');

  /* ---------------- STATUS ---------------- */
  if (c === '!狀態') {
    const uptime = ((Date.now() - systemStartTime) / 3600000).toFixed(2);

    const embed = new EmbedBuilder()
      .setTitle('System Status')
      .setColor(0x5a189a)
      .addFields(
        { name: 'Uptime', value: `${uptime}h`, inline: true },
        { name: 'Checks', value: `${totalChecks}`, inline: true }
      );

    return msg.reply({ embeds: [embed] });
  }

  /* ---------------- SINGLE PULL ---------------- */
  if (c === '!pull') {
    const rarity =
      Math.random() < 0.03 ? '000' :
      Math.random() < 0.16 ? '00' : '0';

    let result = pullIdentity(rarity);

    const up = pullUpIdentity(rarity);
    if (up && Math.random() < 0.25) {
      result = `✨ [UP] ${up}`;
    }

    return msg.reply(`🎯 ${result} (${rarity})`);
  }

  /* ---------------- 10 PULL ---------------- */
  if (c === '!10pulls') {
    const out = [];

    for (let i = 0; i < 10; i++) {
      const rarity =
        Math.random() < 0.03 ? '000' :
        Math.random() < 0.16 ? '00' : '0';

      let result = pullIdentity(rarity);

      const up = pullUpIdentity(rarity);
      if (up && Math.random() < 0.25) {
        result = `✨ [UP] ${up}`;
      }

      out.push(`${result} (${rarity})`);
    }

    return msg.reply(out.join('\n'));
  }

  /* ---------------- MANUAL TEST ---------------- */
  if (c === '!測試') {
    for (const node of NODES) {
      try {
        const res = await fetchWithTimeout(`${node}/${TARGET_USER.username}/rss`);
        const xml = await res.text();
        const data = parseRSS(xml);
        if (!data) continue;

        const vx = data.link.replace(
          /^https:\/\/[^/]+/,
          'https://vxtwitter.com'
        );

        return msg.reply(vx);
      } catch {}
    }

    return msg.reply('fail all nodes');
  }
});

/* ---------------- LOGIN ---------------- */
client.login(process.env.DISCORD_TOKEN);
