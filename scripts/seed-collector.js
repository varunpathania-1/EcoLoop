require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(uri);

  await seedAccount({
    name: 'EcoLoop Admin',
    email: 'admin@ecoloop.com',
    password: 'admin123',
    phone: '9999999998',
    address: 'EcoLoop Admin Office',
    role: 'admin'
  });
  await seedAccount({
    name: 'EcoLoop Collector',
    email: 'collector@ecoloop.com',
    password: 'collector123',
    phone: '9999999999',
    address: 'EcoLoop Collection Hub',
    role: 'collector'
  });

  await mongoose.disconnect();
}

async function seedAccount(account) {
  const existing = await User.findOne({ email: account.email });
  if (existing) {
    Object.assign(existing, account, { isActive: true });
    await existing.save();
    console.log('Account updated:', account.email);
    return;
  }

  await User.create({ ...account, isActive: true });
  console.log('Account created:', account.email);
}

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
