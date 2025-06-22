// Usage: node scripts/nativeFixProjectMembersById.js
const { MongoClient, ObjectId: NativeObjectId } = require('mongodb');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.ATLAS_URI;
const dbName = uri.split('/').pop().split('?')[0]; // crude way to get db name
const projectId = '6856e15ae30500f313439be3';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const projects = db.collection('projects');
    const project = await projects.findOne({ _id: new NativeObjectId(projectId) });
    if (!project) {
      console.log('Project not found.');
      return;
    }
    console.log('Before:', JSON.stringify(project.members, null, 2));
    // Fix members array with fallback
    const fixedMembers = (project.members || []).map(m => {
      if (m && typeof m.user === 'string') {
        try {
          const id = new NativeObjectId(m.user);
          console.log('Using native ObjectId for', m.user);
          return { ...m, user: id };
        } catch (e) {
          const id = mongoose.Types.ObjectId(m.user);
          console.log('Using mongoose ObjectId for', m.user);
          return { ...m, user: id };
        }
      }
      return m;
    });
    await projects.updateOne(
      { _id: new NativeObjectId(projectId) },
      { $set: { members: fixedMembers } }
    );
    const updated = await projects.findOne({ _id: new NativeObjectId(projectId) });
    console.log('After:', JSON.stringify(updated.members, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run(); 