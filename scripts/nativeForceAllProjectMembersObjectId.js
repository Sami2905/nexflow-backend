// Usage: node scripts/nativeForceAllProjectMembersObjectId.js
const { MongoClient, ObjectId: NativeObjectId } = require('mongodb');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.ATLAS_URI;
const dbName = uri.split('/').pop().split('?')[0]; // crude way to get db name

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const projects = db.collection('projects');
    const allProjects = await projects.find({}).toArray();
    let fixedCount = 0;
    for (const project of allProjects) {
      let changed = false;
      const fixedMembers = (project.members || []).map(m => {
        if (m && typeof m.user === 'string') {
          changed = true;
          try {
            return { ...m, user: new NativeObjectId(m.user) };
          } catch (e) {
            return { ...m, user: mongoose.Types.ObjectId(m.user) };
          }
        }
        return m;
      });
      let fixedCreatedBy = project.createdBy;
      if (typeof project.createdBy === 'string') {
        changed = true;
        try {
          fixedCreatedBy = new NativeObjectId(project.createdBy);
        } catch (e) {
          fixedCreatedBy = mongoose.Types.ObjectId(project.createdBy);
        }
      }
      if (changed) {
        await projects.updateOne(
          { _id: project._id },
          { $set: { members: fixedMembers, createdBy: fixedCreatedBy } }
        );
        console.log(`Fixed members and createdBy in project: ${project.name} (${project._id})`);
        fixedCount++;
      }
    }
    if (fixedCount === 0) {
      console.log('No projects needed fixing.');
    } else {
      console.log(`\nFixed members in ${fixedCount} project(s).`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run(); 