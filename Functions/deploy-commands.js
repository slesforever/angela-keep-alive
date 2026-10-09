// Functions/deploy-commands.js
// Manual command registration; Startup.js also registers the same core commands to each guild on login.
const {
    Client,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const admin = PermissionFlagsBits.Administrator;
const commands = [
    new SlashCommandBuilder().setName('pull_limbuscompany').setDescription('Open the LightSeeds extraction interface'),
    new SlashCommandBuilder().setName('pack_limbuscompany').setDescription('View your inventory and resources'),
    new SlashCommandBuilder().setName('list_limbuscompany').setDescription('View gacha pool rates and item list'),
    new SlashCommandBuilder().setName('battle').setDescription('Choose a difficulty and enter battle'),
    new SlashCommandBuilder().setName('party').setDescription('View and manage your party'),
    new SlashCommandBuilder().setName('sinner').setDescription('View sinner details'),
    new SlashCommandBuilder().setName('uptie').setDescription('Upgrade sinner uptie level'),
    new SlashCommandBuilder().setName('equip').setDescription('Change equipped identity'),
    new SlashCommandBuilder().setName('threads').setDescription('Check your thread resources'),
    new SlashCommandBuilder().setName('md').setDescription('Open Mirror Dungeon'),
    new SlashCommandBuilder().setName('rank').setDescription('Check your level and XP').addUserOption(o => o.setName('target').setDescription('Target player')),
    new SlashCommandBuilder().setName('leaderboard').setDescription('View XP Top 10 leaderboard'),
    new SlashCommandBuilder().setName('language').setDescription('Set your display language').addStringOption(o => o.setName('language').setDescription('Language').setRequired(true).addChoices({ name: '繁體中文', value: 'zh' }, { name: 'English', value: 'en' })),
    new SlashCommandBuilder().setName('sc').setDescription('Starcoins economy system')
        .addSubcommand(s => s.setName('pay').setDescription('Pay Starcoins to another player').addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('work').setDescription('Work to earn Starcoins'))
        .addSubcommand(s => s.setName('bank').setDescription('Bank operations').addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Deposit', value: 'deposit' }, { name: 'Withdraw', value: 'withdraw' }, { name: 'Balance', value: 'balance' })).addIntegerOption(o => o.setName('amount').setDescription('Amount').setMinValue(1))),
    new SlashCommandBuilder().setName('gamble').setDescription('Gamble your Starcoins (50/50)').addIntegerOption(o => o.setName('amount').setDescription('Bet amount').setRequired(true).setMinValue(10).setMaxValue(50000)),
    new SlashCommandBuilder().setName('gayrate').setDescription('Measure gay rate').addUserOption(o => o.setName('target').setDescription('Target player')),
    new SlashCommandBuilder().setName('lesbianrate').setDescription('Measure lesbian rate').addUserOption(o => o.setName('target').setDescription('Target player')),
    new SlashCommandBuilder().setName('join').setDescription('Join your voice channel'),
    new SlashCommandBuilder().setName('play').setDescription('Play YouTube or SoundCloud music (supports playlists)').addStringOption(o => o.setName('musiclink').setDescription('Music or playlist link').setRequired(true)),
    new SlashCommandBuilder().setName('leave').setDescription('Leave voice channel'),
    new SlashCommandBuilder().setName('marry').setDescription('View marriage status or send a marriage request')
        .addSubcommand(s => s.setName('status').setDescription('View your marriage status and spouses'))
        .addSubcommand(s => s.setName('request').setDescription('Send a marriage request to a user').addUserOption(o => o.setName('target').setDescription('User to marry').setRequired(true))),
    new SlashCommandBuilder().setName('divorce').setDescription('Divorce a spouse').addUserOption(o => o.setName('target').setDescription('Spouse to divorce')),
    new SlashCommandBuilder().setName('status').setDescription('Check bot status'),
    new SlashCommandBuilder().setName('setchannel').setDescription('Set system notification channels').setDefaultMemberPermissions(admin)
        .addStringOption(o => o.setName('type').setDescription('Channel type').setRequired(true).addChoices(
            { name: 'System Notification', value: 'notify' }, { name: 'Rate Up', value: 'rateup' }, { name: 'News', value: 'news' },
            { name: 'Level Up Announcement', value: 'level' }, { name: 'Sles Announcement', value: 'announce' }, { name: 'Starboard', value: 'starboard' },
            { name: 'Audit Log', value: 'audit' }, { name: 'Translation Output', value: 'translate-output' }, { name: 'Toggle Translation Source', value: 'translate-source' }, { name: 'AI Auto Reply', value: 'ai' }, { name: 'AI Memory', value: 'ai-memory' }))
        .addChannelOption(o => o.setName('target_channel').setDescription('Target text channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('setlevelchannel').setDescription('Set level-up announcement channel').setDefaultMemberPermissions(admin).addChannelOption(o => o.setName('target_channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('setannouncechannel').setDescription('Set global announcement channel').setDefaultMemberPermissions(admin).addChannelOption(o => o.setName('target_channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),
    new SlashCommandBuilder().setName('givestarcoins').setDescription('Sles only: Grant Starcoins').setDefaultMemberPermissions(admin).addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)).addUserOption(o => o.setName('target').setDescription('Target').setRequired(true)),
    new SlashCommandBuilder().setName('takelightseeds').setDescription('Sles only: Deduct LightSeeds').setDefaultMemberPermissions(admin).addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)).addUserOption(o => o.setName('target').setDescription('Target').setRequired(true)),
    new SlashCommandBuilder().setName('givelightseeds').setDescription('Sles only: Grant LightSeeds').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givefragments').setDescription('Sles only: Grant fragments').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givescrolls').setDescription('Sles only: Grant scrolls').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('givethreads').setDescription('Sles only: Grant threads').setDefaultMemberPermissions(admin),
    new SlashCommandBuilder().setName('announce').setDescription('Sles only: Global announcement').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('message').setDescription('Content').setRequired(true)),
    new SlashCommandBuilder().setName('shop').setDescription('Open the shop UI'),
    new SlashCommandBuilder().setName('shop-add').setDescription('Sles only: Add shop item').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true)).addStringOption(o => o.setName('info').setDescription('Item info')).addIntegerOption(o => o.setName('lightseeds').setDescription('LightSeeds price').setMinValue(0)).addIntegerOption(o => o.setName('starcoins').setDescription('StarCoins price').setMinValue(0)).addIntegerOption(o => o.setName('minlevel').setDescription('Minimum level').setMinValue(0)).addIntegerOption(o => o.setName('stock').setDescription('Stock').setMinValue(1)),
    new SlashCommandBuilder().setName('shop-remove').setDescription('Sles only: Remove shop item').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('item_id').setDescription('Item ID').setRequired(true)),
    new SlashCommandBuilder().setName('shop-confirm').setDescription('Sles only: Confirm shop order delivery').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('code').setDescription('Order code').setRequired(true)),
    new SlashCommandBuilder().setName('giveaway-create').setDescription('Create a giveaway event').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('prize_name').setDescription('Prize name').setRequired(true)).addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(20)).addStringOption(o => o.setName('prize_info').setDescription('Prize info')).addIntegerOption(o => o.setName('max_participants').setDescription('Max participants').setMinValue(1).setMaxValue(10000)).addIntegerOption(o => o.setName('min_level').setDescription('Minimum level').setMinValue(0).setMaxValue(100)).addIntegerOption(o => o.setName('entry_lightseeds').setDescription('Entry LightSeeds cost').setMinValue(0)).addIntegerOption(o => o.setName('entry_starcoins').setDescription('Entry StarCoins cost').setMinValue(0)).addIntegerOption(o => o.setName('prize_lightseeds').setDescription('Prize LightSeeds reward').setMinValue(0)).addIntegerOption(o => o.setName('prize_starcoins').setDescription('Prize StarCoins reward').setMinValue(0)).addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes').setMinValue(1).setMaxValue(10080)),
    new SlashCommandBuilder().setName('giveaway-end').setDescription('End a giveaway early').setDefaultMemberPermissions(admin).addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)),
    new SlashCommandBuilder().setName('profile').setDescription('View your full profile').addUserOption(o => o.setName('target').setDescription('View another player')),
    new SlashCommandBuilder().setName('updateprofile').setDescription('Edit your profile (max 2 times/day)')
        .addStringOption(o => o.setName('bio').setDescription('Bio (max 500 chars)').setMaxLength(500))
        .addStringOption(o => o.setName('origin').setDescription('Experience origin (max 300 chars)').setMaxLength(300))
        .addStringOption(o => o.setName('image_url').setDescription('Banner image URL'))
        .addStringOption(o => o.setName('title').setDescription('Equip a title'))
        .addAttachmentOption(o => o.setName('banner').setDescription('Upload a banner image (jpg/png/gif/webp, max 8MB)')),
    new SlashCommandBuilder().setName('setbanner').setDescription('Upload a profile banner image')
        .addAttachmentOption(o => o.setName('banner').setDescription('Choose a banner image to upload').setRequired(true)),
    new SlashCommandBuilder().setName('title').setDescription('View or equip titles')
        .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'List', value: 'list' }, { name: 'Equip', value: 'equip' }, { name: 'Unequip', value: 'unequip' }))
        .addStringOption(o => o.setName('name').setDescription('Title name')),
    new SlashCommandBuilder().setName('checkin').setDescription('Daily check-in'),
    new SlashCommandBuilder().setName('help').setDescription('Show command list'),
].map(command => command.toJSON());

const token = (process.env.DISCORD_TOKEN || '').trim();

if (!token) {
    console.error('❌ Please set the DISCORD_TOKEN environment variable');
    process.exitCode = 1;
} else {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds]
    });

    client.once(Events.ClientReady, async () => {
        try {
            // Identify the app from the logged-in client.application.id;
            // no longer requires a separate CLIENT_ID env var.
            await client.application.commands.set([]);

            let registeredGuilds = 0;
            for (const guild of client.guilds.cache.values()) {
                await guild.commands.set(commands);
                registeredGuilds++;
            }

            console.log(
                `✅ Slash Commands registered: ${registeredGuilds} Guild(s)`
            );
        } catch (err) {
            console.error('❌ Registration failed:', err.message);
            process.exitCode = 1;
        } finally {
            client.destroy();
        }
    });

    client.login(token).catch(err => {
        console.error('❌ Discord login failed:', err.message);
        process.exitCode = 1;
    });
}
