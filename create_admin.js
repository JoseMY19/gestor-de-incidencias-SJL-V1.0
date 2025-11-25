const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Manually load .env
try {
    const envPath = path.join(__dirname, '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
        }
    });
} catch (e) {
    console.log('No .env file found or error reading it');
}

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
