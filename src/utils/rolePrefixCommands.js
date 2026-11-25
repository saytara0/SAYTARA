
import {
    ActionRowBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
} from 'discord.js';

const PICKER_ID = 'role_picker';
const PAGE_SIZE = 23;

function canManageRole(actor, botMember, role, guild) {
    const actorAllowed =
        actor.id === guild.ownerId ||
        actor.roles.highest.comparePositionTo(role) > 0;

    const botAllowed =
        botMember.roles.highest.comparePositionTo(role) > 0;

    return actorAllowed && botAllowed;
}

function getAvailableRoles(guild, actor, botMember, target, action) {
    return guild.roles.cache
        .filter(role => {
            if (role.id === guild.id || role.managed) return false;
            if (!canManageRole(actor, botMember, role, guild)) return false;

            return action === 'add'
                ? !target.roles.cache.has(role.id)
                : target.roles.cache.has(role.id);
        })
        .sort((a, b) => b.position - a.position)
        .map(role => ({
            label: role.name.slice(0, 100),
            value: role.id,
        }));
}

function createRoleMenu(action, targetId, actorId, roles, page) {
    const start = page * PAGE_SIZE;
    const pageRoles = roles.slice(start, start + PAGE_SIZE);

    const options = pageRoles.map(role => ({
        label: role.label,
        value: role.value,
    }));

    if (page > 0) {
        options.unshift({
            label: '⬅ Previous page',
            value: '__previous__',
        });
    }

    if (start + PAGE_SIZE < roles.length) {
        options.push({
            label: 'Next page ➡',
            value: '__next__',
        });
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${PICKER_ID}:${action}:${targetId}:${actorId}:${page}`)
        .setPlaceholder(
            action === 'add'
                ? 'Select a role to add...'
                : 'Select a role to remove...'
        )
        .addOptions(options);

    return new ActionRowBuilder().addComponents(menu);
}

export async function handleRolePrefixCommand(message, client) {
    const match = message.content.trim().match(/^(رول|شيل)(?:\s+([\s\S]*))?$/);

    if (!match || !message.guild) return false;

    const action = match[1] === 'رول' ? 'add' : 'remove';
    const tail = match[2] || '';

    const send = content =>
        message.channel.send(content).catch(() => {});

    if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await send('❌ محتاج صلاحية Manage Roles لاستخدام الأمر.');
        return true;
    }

    const mention = tail.match(/<@!?(\d+)>/);
    let targetId = mention?.[1];

    if (!targetId && message.reference) {
        const replied = await message.fetchReference().catch(() => null);
        if (replied) targetId = replied.author.id;
    }

    if (!targetId) {
        await send('❌ منشن العضو أو اعمل Reply على رسالته.');
        return true;
    }

    const guild = message.guild;
    const target = await guild.members.fetch(targetId).catch(() => null);

    if (!target) {
        await send('❌ العضو مش موجود في السيرفر.');
        return true;
    }

    if (target.id === guild.ownerId) {
        await send('❌ لا يمكن تعديل رتب مالك السيرفر.');
        return true;
    }

    const actor = message.member;
    const botMember = guild.members.me ||
        await guild.members.fetch(client.user.id);

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await send('❌ البوت محتاج صلاحية Manage Roles.');
        return true;
    }

    const roles = getAvailableRoles(
        guild,
        actor,
        botMember,
        target,
        action
    );

    if (!roles.length) {
        await send(
            action === 'add'
                ? 'ℹ️ مفيش رتب متاحة تقدر تضيفها للعضو.'
                : 'ℹ️ العضو مفيش عنده رتب تقدر تشيلها.'
        );
        return true;
    }

    const row = createRoleMenu(
        action,
        target.id,
        message.author.id,
        roles,
        0
    );

    await message.channel.send({
        content: action === 'add'
            ? `**Add Role**\nChoose a role to add to <@${target.id}>.`
            : `**Remove Role**\nChoose a role to remove from <@${target.id}>.`,
        components: [row],
    }).catch(() => {});

    return true;
}

export async function handleRolePickerInteraction(interaction, client) {
    const parts = interaction.customId.split(':');

    const action = parts[1];
    const targetId = parts[2];
    const actorId = parts[3];
    const page = Number(parts[4]);

    if (interaction.user.id !== actorId) {
        await interaction.reply({
            content: '❌ القائمة دي مش بتاعتك.',
            ephemeral: true,
        });
        return true;
    }

    const guild = interaction.guild;

    if (
        !guild ||
        !['add', 'remove'].includes(action) ||
        !Number.isInteger(page) ||
        page < 0
    ) {
        await interaction.reply({
            content: '❌ القائمة غير صالحة.',
            ephemeral: true,
        });
        return true;
    }

    const actor = await guild.members.fetch(actorId).catch(() => null);
    const target = await guild.members.fetch(targetId).catch(() => null);
    const botMember = guild.members.me ||
        await guild.members.fetch(client.user.id).catch(() => null);

    if (
        !actor ||
        !target ||
        !botMember ||
        !actor.permissions.has(PermissionFlagsBits.ManageRoles) ||
        !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
    ) {
        await interaction.reply({
            content: '❌ صلاحيات إدارة الرتب غير متاحة.',
            ephemeral: true,
        });
        return true;
    }

    if (target.id === guild.ownerId) {
        await interaction.reply({
            content: '❌ لا يمكن تعديل رتب مالك السيرفر.',
            ephemeral: true,
        });
        return true;
    }

    const roles = getAvailableRoles(
        guild,
        actor,
        botMember,
        target,
        action
    );

    const selected = interaction.values[0];

    if (selected === '__previous__' || selected === '__next__') {
        const nextPage = selected === '__next__'
            ? page + 1
            : page - 1;

        const maxPage = Math.max(
            0,
            Math.ceil(roles.length / PAGE_SIZE) - 1
        );

        const safePage = Math.min(Math.max(nextPage, 0), maxPage);

        await interaction.update({
            components: [
                createRoleMenu(action, targetId, actorId, roles, safePage),
            ],
        });

        return true;
    }

    const role = guild.roles.cache.get(selected);

    const stillAvailable = roles.some(item => item.value === selected);

    if (!role || !stillAvailable) {
        await interaction.reply({
            content: '❌ الرتبة دي مبقتش متاحة. افتح الأمر من جديد.',
            ephemeral: true,
        });
        return true;
    }

    try {
        if (action === 'add') {
            await target.roles.add(
                role,
                `Added by ${interaction.user.tag}`
            );

            await interaction.update({
                content: `✅ تمت إضافة رتبة **${role.name}** إلى <@${target.id}>.`,
                components: [],
            });
        } else {
            await target.roles.remove(
                role,
                `Removed by ${interaction.user.tag}`
            );

            await interaction.update({
                content: `✅ تمت إزالة رتبة **${role.name}** من <@${target.id}>.`,
                components: [],
            });
        }
    } catch (error) {
        await interaction.reply({
            content: '❌ مقدرتش أعدّل الرتبة. راجع ترتيب رتب البوت وصلاحياته.',
            ephemeral: true,
        }).catch(() => {});
    }

    return true;
}
