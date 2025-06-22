// Usage: node scripts/addAdminToAllProjects.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Project = require('../models/Project');

const adminEmail = 'admin@example.com';

async function addAdminToAllProjects() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const admin = await User.findOne({ email: adminEmail });
    if (!admin) throw new Error('Admin user not found');
    const projects = await Project.find({});
    let updatedCount = 0;
    for (const project of projects) {
      const alreadyMember = project.members.some(m => m.user && m.user.toString() === admin._id.toString());
      if (!alreadyMember) {
        project.members.push({ user: admin._id, role: 'Admin' });
        await project.save();
        updatedCount++;
        console.log(`Added admin to project: ${project.name}`);
      }
    }
    console.log(`\nAdmin added to ${updatedCount} project(s).`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

addAdminToAllProjects(); 