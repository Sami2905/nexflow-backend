// Seed demo data for NexFlow
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');
const Project = require('../models/Project');
const Bug = require('../models/Bug');
const Activity = require('../models/Activity');

async function seed() {
  await mongoose.connect(process.env.ATLAS_URI);

  // Clean up demo data
  await Bug.deleteMany({ title: /Demo Bug/ });
  await Project.deleteMany({ name: /Demo Project/ });
  await Activity.deleteMany({ message: /Demo Activity/ });
  await User.deleteMany({ email: /demo[12]@nexflow.com/ });

  // Create demo users
  const user1 = await User.create({ name: 'Demo User 1', email: 'demo1@nexflow.com', password: 'password123' });
  const user2 = await User.create({ name: 'Demo User 2', email: 'demo2@nexflow.com', password: 'password123' });

  // Create demo projects
  const project1 = await Project.create({ name: 'Demo Project Alpha', description: 'A demo project for Alpha.', members: [{ user: user1._id }, { user: user2._id }], createdBy: user1._id });
  const project2 = await Project.create({ name: 'Demo Project Beta', description: 'A demo project for Beta.', members: [{ user: user1._id }], createdBy: user1._id });

  // Create demo bugs
  const bug1 = await Bug.create({ title: 'Demo Bug 1', description: 'Open bug', status: 'Open', priority: 'High', project: project1._id, assignedTo: user1._id, createdBy: user1._id });
  const bug2 = await Bug.create({ title: 'Demo Bug 2', description: 'Closed bug', status: 'Closed', priority: 'Medium', project: project1._id, assignedTo: user2._id, createdBy: user2._id });
  const bug3 = await Bug.create({ title: 'Demo Bug 3', description: 'In Progress bug', status: 'In Progress', priority: 'Low', project: project2._id, assignedTo: user1._id, createdBy: user1._id });

  // Create demo activity logs
  await Activity.create({ project: project1._id, user: user1._id, type: 'bug_created', message: 'Demo Activity: Bug 1 created' });
  await Activity.create({ project: project1._id, user: user2._id, type: 'bug_closed', message: 'Demo Activity: Bug 2 closed' });
  await Activity.create({ project: project2._id, user: user1._id, type: 'bug_in_progress', message: 'Demo Activity: Bug 3 in progress' });

  console.log('Demo data seeded successfully!');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); }); 