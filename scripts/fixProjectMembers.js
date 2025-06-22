// Usage: node scripts/fixProjectMembers.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Project = require('../models/Project');

async function fixProjectMembers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const projects = await Project.find({});
    let fixedCount = 0;
    for (const project of projects) {
      let changed = false;
      // Fix members: convert string/ObjectId/null/undefined to { user: ObjectId, role: 'Member' }
      project.members = (project.members || []).map(m => {
        if (!m) {
          changed = true;
          return null;
        }
        if (typeof m === 'string' || (m._id && !m.user && !m.role)) {
          changed = true;
          return { user: mongoose.Types.ObjectId(m._id || m), role: 'Member' };
        }
        if (mongoose.isValidObjectId(m)) {
          changed = true;
          return { user: mongoose.Types.ObjectId(m), role: 'Member' };
        }
        if (typeof m === 'object' && m.user && typeof m.user === 'string') {
          // Convert user to ObjectId if needed
          return { ...m, user: mongoose.Types.ObjectId(m.user) };
        }
        return m;
      }).filter(Boolean); // Remove nulls
      if (changed) {
        await project.save();
        fixedCount++;
        console.log(`Fixed members in project: ${project.name} (${project._id})`);
      }
    }
    console.log(`\nFixed members in ${fixedCount} project(s).`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixProjectMembers(); 