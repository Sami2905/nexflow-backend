// Usage: node scripts/fixProjectMembersById.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Project = require('../models/Project');

const projectId = '6856e15ae30500f313439be3';

async function fixProjectMembers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const project = await Project.findById(projectId);
    if (!project) {
      console.log('Project not found.');
      return;
    }
    let changed = false;
    project.members = (project.members || []).map(m => {
      if (m && typeof m.user === 'string') {
        changed = true;
        return { ...m, user: mongoose.Types.ObjectId(m.user) };
      }
      return m;
    });
    if (changed) {
      await project.save();
      console.log('Fixed members array for project:', project.name, project._id);
    } else {
      console.log('No changes needed for project:', project.name, project._id);
    }
    console.log('Members:', JSON.stringify(project.members, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

fixProjectMembers(); 