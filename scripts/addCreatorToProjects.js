const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.ATLAS_URI;
if (!uri) {
  console.error('Error: ATLAS_URI is not defined in .env file.');
  process.exit(1);
}

const dbName = uri.split('/').pop().split('?')[0];

async function addCreatorToProjects() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected to MongoDB.');

    const db = client.db(dbName);
    const projectsCollection = db.collection('projects');

    const projects = await projectsCollection.find({}).toArray();
    let updatedCount = 0;

    for (const project of projects) {
      if (!project.createdBy) {
        console.log(`Skipping project ${project._id} because it has no 'createdBy' field.`);
        continue;
      }

      const creatorId = project.createdBy;
      
      const creatorIsMember = project.members && project.members.some(
        member => member.user && member.user.equals(creatorId)
      );

      if (!creatorIsMember) {
        console.log(`Updating project: ${project.name} (${project._id}). Adding creator as Owner.`);
        
        await projectsCollection.updateOne(
          { _id: project._id },
          { 
            $push: { 
              members: { 
                user: creatorId, 
                role: 'Owner' 
              } 
            } 
          }
        );
        updatedCount++;
      }
    }

    console.log(`Finished processing projects. Updated ${updatedCount} project(s).`);

  } catch (err) {
    console.error('An error occurred:', err);
  } finally {
    await client.close();
    console.log('MongoDB connection closed.');
  }
}

addCreatorToProjects(); 