const mongoose = require('mongoose');
const User = require('./models/User');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

const email = process.argv[2] || 'test@example.com';
const password = process.argv[3] || 'password123';

const getTestUser = async () => {
  await mongoose.connect(process.env.ATLAS_URI);
  console.log('MongoDB connected');

  let user = await User.findOne({ email });

  if (user) {
    console.log('User already exists.');
    // This part ensures the password is 'password123' if the user already exists
    user.password = await bcrypt.hash(password, 10);
    await user.save();
    console.log('Password has been reset to ensure it matches.');
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({
      name: 'Test User',
      email: email,
      password: hashedPassword,
    });
    await user.save();
    console.log('New user created.');
  }

  console.log('\n--- Use these credentials to log in ---');
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${password}`);
  console.log('-----------------------------------------\n');

  await mongoose.disconnect();
  console.log('MongoDB disconnected');
};

getTestUser().catch(err => {
  console.error(err);
  process.exit(1);
});