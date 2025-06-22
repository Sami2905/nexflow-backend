// Usage: node scripts/printMalformedProjectMembers.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Project = require('../models/Project');

async function printMalformedMembers() {
  try {
    await mongoose.connect(process.env.ATLAS_URI);
    const projects = await Project.find({});
    let found = 0;
    for (const project of projects) {
      const malformed = (project.members || []).filter(m => typeof m !== 'object' || m === null || Array.isArray(m) || typeof m === 'string' || (m && !('user' in m)));
      if (malformed.length > 0) {
        found++;
        console.log(`\nProject: ${project.name} (${project._id})`);
        console.log('Malformed members:', JSON.stringify(project.members, null, 2));
      }
    }
    if (found === 0) {
      console.log('No malformed members found in any project.');
    } else {
      console.log(`\nFound malformed members in ${found} project(s).`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

printMalformedMembers(); 