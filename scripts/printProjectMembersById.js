// Usage: node scripts/printProjectMembersById.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Project = require('../models/Project');

const projectId = '6856e15ae30500f313439be3';

async function printProjectMembers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const project = await Project.findById(projectId);
    if (!project) {
      console.log('Project not found.');
    } else {
      console.log(`Project: ${project.name} (${project._id})`);
      console.log('Members:', JSON.stringify(project.members, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

printProjectMembers(); 