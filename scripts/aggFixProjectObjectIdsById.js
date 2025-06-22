// Usage: node scripts/aggFixProjectObjectIdsById.js
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
    // Use aggregation pipeline update to force ObjectId conversion
    await projects.updateOne(
      { _id: new ObjectId(projectId) },
      [
        {
          $set: {
            members: {
              $map: {
                input: "$members",
                as: "m",
                in: {
                  user: { $toObjectId: "$$m.user" },
                  role: "$$m.role"
                }
              }
            },
            createdBy: { $toObjectId: "$createdBy" }
          }
        }
      ]
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