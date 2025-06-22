const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Project = require('../models/Project');
const Bug = require('../models/Bug');
const jwt = require('jsonwebtoken');

let token;
let userId;
let projectId;
let bugId;

beforeAll(async () => {
  await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const user = new User({ name: 'Integration User', email: 'integration@example.com', password: 'testpass' });
  await user.save();
  userId = user._id;
  token = jwt.sign({ id: userId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
});

afterAll(async () => {
  await Bug.deleteMany({ createdBy: userId });
  await Project.deleteMany({ createdBy: userId });
  await User.deleteOne({ _id: userId });
  await mongoose.connection.close();
});

describe('Integration: Project and Bug', () => {
  it('should create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Integration Project', description: 'Integration test project' });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Integration Project');
    projectId = res.body._id;
  });

  it('should create a bug assigned to the project', async () => {
    const res = await request(app)
      .post('/api/bugs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bug for Project', description: 'Bug linked to project', priority: 'Medium', status: 'Open', project: projectId });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Bug for Project');
    expect(res.body.project).toBe(projectId);
    bugId = res.body._id;
  });

  it('should get the bug and verify project link', async () => {
    const res = await request(app)
      .get(`/api/bugs/${bugId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(String(res.body.project._id)).toBe(String(projectId));
  });
}); 