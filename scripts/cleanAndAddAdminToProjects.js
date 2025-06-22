// Usage: node scripts/cleanAndAddAdminToProjects.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Project = require('../models/Project');

const adminEmail = 'admin@example.com';

async function cleanAndAddAdmin() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const admin = await User.findOne({ email: adminEmail });
    if (!admin) throw new Error('Admin user not found');
    const projects = await Project.find({});
    let cleaned = 0, updated = 0;
    for (const project of projects) {
      // Remove malformed members
      const originalLen = project.members.length;
      project.members = project.members.filter(m => m && m.user);
      if (project.members.length !== originalLen) {
        cleaned++;
      }
      // Add admin if not present
      const alreadyMember = project.members.some(m => m.user.toString() === admin._id.toString());
      if (!alreadyMember) {
        project.members.push({ user: admin._id, role: 'Admin' });
        updated++;
        console.log(`Added admin to project: ${project.name}`);
      }
      await project.save();
    }
    console.log(`\nCleaned malformed members in ${cleaned} project(s).`);
    console.log(`Admin added to ${updated} project(s).`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

cleanAndAddAdmin(); 