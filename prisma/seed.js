'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Admin User ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@linkforge.io' },
    update: {},
    create: {
      email: 'admin@linkforge.io',
      username: 'admin',
      passwordHash: adminPassword,
      role: 'ADMIN',
      emailVerified: true,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // ── Demo User ─────────────────────────────────────────────────────────────
  const demoPassword = await bcrypt.hash('Demo@123456', 12);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@linkforge.io' },
    update: {},
    create: {
      email: 'demo@linkforge.io',
      username: 'demouser',
      passwordHash: demoPassword,
      role: 'USER',
      emailVerified: true,
    },
  });
  console.log('✅ Demo user created:', demo.email);

  // ── Sample URLs ───────────────────────────────────────────────────────────
  const sampleUrls = [
    {
      originalUrl: 'https://github.com/whoankitchauhan',
      shortCode: 'github',
      customAlias: 'github',
      slugType: 'CUSTOM',
      title: "Ankit's GitHub Profile",
      tags: ['github', 'portfolio'],
      createdBy: demo.id,
    },
    {
      originalUrl: 'https://linkedin.com/in/whoankitchauhan',
      shortCode: 'linkedin',
      customAlias: 'linkedin',
      slugType: 'CUSTOM',
      title: 'LinkedIn Profile',
      tags: ['linkedin', 'professional'],
      createdBy: demo.id,
    },
    {
      originalUrl: 'https://example.com/very-long-blog-post-url',
      shortCode: 'xA92Ks7',
      slugType: 'BASE62',
      title: 'Sample Blog Post',
      tags: ['blog', 'sample'],
      clickCount: 142,
      createdBy: demo.id,
    },
  ];

  for (const urlData of sampleUrls) {
    await prisma.url.upsert({
      where: { shortCode: urlData.shortCode },
      update: {},
      create: urlData,
    });
  }
  console.log('✅ Sample URLs created');

  console.log('\n🎉 Seed completed!');
  console.log('\nDemo credentials:');
  console.log('  Admin: admin@linkforge.io / Admin@123456');
  console.log('  User:  demo@linkforge.io  / Demo@123456');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
