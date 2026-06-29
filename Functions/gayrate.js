const { EmbedBuilder } = require('discord.js');

const SPECIAL_USER_ID = '1330463890122735642';

module.exports = {
    name: 'gayrate',
    description: 'Check gay rate.',

    async execute(message) {
        const target =
            message.mentions.users.first() ||
            message.author;

        const percent = target.id === SPECIAL_USER_ID ? 0 : 100;

        const embed = new EmbedBuilder()
            .setColor(percent === 0 ? 0x57F287 : 0xFF69B4)
            .setDescription(`${target} is **${percent}% gay**`);

        await message.reply({ embeds: [embed] });
    },
};
