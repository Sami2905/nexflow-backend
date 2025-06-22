// Usage: node scripts/printFullProjectById.js
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.ATLAS_URI;
const dbName = uri.split('/').pop().split('?')[0];
const projectId = '6856e15ae30500f313439be3';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const projects = db.collection('projects');
    const project = await projects.findOne({ _id: new ObjectId(projectId) });
    if (!project) {
      console.log('Project not found.');
      return;
    }
    console.log('Full project document:', JSON.stringify(project, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run(); 