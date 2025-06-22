// Usage: node scripts/createAdmin.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');

const email = 'admin@example.com';
const password = 'admin123';
const name = 'Admin User';
const role = 'admin';

async function createOrUpdateAdmin() {
  try {
    await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    let user = await User.findOne({ email });
    const hashedPassword = await bcrypt.hash(password, 10);

    if (user) {
      user.password = hashedPassword;
      user.role = role;
      user.name = name;
      await user.save();
      console.log('Admin user updated.');
    } else {
      user = new User({ name, email, password: hashedPassword, role });
      await user.save();
      console.log('Admin user created.');
    }

    console.log('\n--- Admin Credentials ---');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('-------------------------\n');
  } catch (err) {
    console.error('Error creating/updating admin user:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createOrUpdateAdmin(); 