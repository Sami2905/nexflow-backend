// Usage: node scripts/forceFixProjectMembersById.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Project = require('../models/Project');

const projectId = '6856e15ae30500f313439be3';

async function forceFixProjectMembers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const project = await Project.findById(projectId);
    if (!project) {
      console.log('Project not found.');
      return;
    }
    console.log('Before:', JSON.stringify(project.members, null, 2));
    // Build new members array with user as ObjectId
    const fixedMembers = (project.members || []).map(m => {
      if (m && typeof m.user === 'string') {
        return { ...m, user: mongoose.Types.ObjectId(m.user) };
      }
      return m;
    });
    // Use native update to force the change
    await Project.updateOne(
      { _id: projectId },
      { $set: { members: fixedMembers } }
    );
    const updated = await Project.findById(projectId);
    console.log('After:', JSON.stringify(updated.members, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

forceFixProjectMembers(); 