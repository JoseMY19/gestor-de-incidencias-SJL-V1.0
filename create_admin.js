const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'admin123'; // Default password
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const user = await prisma.user.upsert({
            where: { username: username },
            update: {},
            create: {
                username: username,
                password: hashedPassword,
                name: 'Administrador Sistema',
                role: 'admin'
            }
        });
        console.log('Admin user created/verified:', user);
    } catch (e) {
        console.error('Error creating admin:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
