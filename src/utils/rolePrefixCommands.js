
import { PermissionFlagsBits } from 'discord.js';

export async function handleRolePrefixCommand(message, client) {
    const match = message.content.trim().match(/^(رول|شيل)(?:\s+([\s\S]*))?$/);
    if (!match || !message.guild) return false;

    const action = match[1];
    const tail = match[2] || '';
    const isAdd = action === 'رول';

    const send = (content) => message.channel.send(content).catch(() => {});

    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await send('❌ محتاج صلاحية Manage Roles لاستخدام الأمر.');
        return true;
    }

    const mention = tail.match(/<@!?(\d+)>/);
    let targetId = mention?.[1];

    // لو مفيش منشن، نحاول نجيب العضو من الـ Reply
    if (!targetId && message.reference) {
        const replied = await message.fetchReference().catch(() => null);
        if (replied) targetId = replied.author.id;
    }

    if (!targetId) {
        await send('❌ منشن العضو أو اعمل Reply على رسالته.');
        return true;
    }

    const target = await message.guild.members.fetch(targetId).catch(() => null);

    if (!target) {
        await send('❌ العضو مش موجود في السيرفر.');
        return true;
    }

    const botMember = message.guild.members.me ||
        await message.guild.members.fetch(client.user.id);

    const actor = message.member;
    const everyoneRole = message.guild.id;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await send('❌ البوت محتاج صلاحية Manage Roles.');
        return true;
    }

    if (target.id === message.guild.ownerId) {
        await send('❌ لا يمكن تعديل رتب مالك السيرفر.');
        return true;
    }

    if (actor.id !== message.guild.ownerId &&
        actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
        await send('❌ رتبة العضو أعلى من رتبتك أو مساوية لها.');
        return true;
    }

    if (botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
        await send('❌ رتبة البوت لازم تكون أعلى من أعلى رتبة للعضو.');
        return true;
    }

    if (isAdd) {
        const roleName = tail.replace(/<@!?\d+>/g, '').trim();

        if (!roleName) {
            await send('❌ اكتب اسم الرول. مثال: `رول Admin @Member`');
            return true;
        }

        const role = message.guild.roles.cache.find(
            r => r.name.toLowerCase() === roleName.toLowerCase()
        );

        if (!role || role.id === everyoneRole || role.managed) {
            await send('❌ الرول غير موجود أو لا يمكن إدارته.');
            return true;
        }

        if (actor.id !== message.guild.ownerId &&
            actor.roles.highest.comparePositionTo(role) <= 0) {
            await send('❌ الرول أعلى من رتبتك أو مساوي لها.');
            return true;
        }

        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
            await send('❌ لازم ترفع رتبة البوت فوق الرول المطلوب.');
            return true;
        }

        if (target.roles.cache.has(role.id)) {
            await send('ℹ️ العضو عنده الرول بالفعل.');
            return true;
        }

        await target.roles.add(role, `Added by ${message.author.tag}`);
        await send(`✅ تمت إضافة ${role} إلى ${target}.`);
        return true;
    }

    const roles = target.roles.cache
        .filter(role =>
            role.id !== everyoneRole &&
            !role.managed
        )
        .sort((a, b) => b.position - a.position);

    const highestRole = roles.first();

    if (!highestRole) {
        await send('ℹ️ العضو لا يمتلك أي رتب قابلة للإزالة.');
        return true;
    }

    if (actor.id !== message.guild.ownerId &&
        actor.roles.highest.comparePositionTo(highestRole) <= 0) {
        await send('❌ لا تملك صلاحية إزالة أعلى رتبة عند العضو.');
        return true;
    }

    if (botMember.roles.highest.comparePositionTo(highestRole) <= 0) {
        await send('❌ رتبة البوت أقل من الرتبة المطلوب إزالتها.');
        return true;
    }

    await target.roles.remove(highestRole, `Removed by ${message.author.tag}`);
    await send(`✅ تمت إزالة أعلى رتبة **${highestRole.name}** من ${target}.`);

    return true;
}
