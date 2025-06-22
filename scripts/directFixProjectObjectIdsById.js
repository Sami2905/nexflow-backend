// Usage: node scripts/directFixProjectObjectIdsById.js
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.ATLAS_URI;
const dbName = uri.split('/').pop().split('?')[0];
const projectId = '6856e15ae30500f313439be3';
const userId = '6856dfa67dd2c7f0ec69c9ab';

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const projects = db.collection('projects');
    // Directly set members[0].user and createdBy to ObjectId
    await projects.updateOne(
      { _id: new ObjectId(projectId) },
      {
        $set: {
          "members.0.user": new ObjectId(userId),
          createdBy: new ObjectId(userId)
        }
      }
    );
    const updated = await projects.findOne({ _id: new ObjectId(projectId) });
    console.log('After:', JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run(); 