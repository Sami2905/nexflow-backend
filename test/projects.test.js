const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index'); // Now exports the app instance
const User = require('../models/User');
const Project = require('../models/Project');
const jwt = require('jsonwebtoken');

let token;
let userId;
let projectId;

beforeAll(async () => {
  // Connect to test DB
  await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  // Create a test user
  const user = new User({ name: 'Test User', email: 'testuser@example.com', password: 'testpass', role: 'admin' });
  await user.save();
  userId = user._id;
  token = jwt.sign({ id: userId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
});

afterAll(async () => {
  await Project.deleteMany({ createdBy: userId });
  await User.deleteOne({ _id: userId });
  await mongoose.connection.close();
});

describe('Project API', () => {
  it('should create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Project', description: 'A test project' });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Test Project');
    projectId = res.body._id;
  });

  it('should get all projects for the user', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(p => p._id === projectId)).toBe(true);
  });

  it('should get a single project', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body._id).toBe(projectId);
  });

  it('should update a project', async () => {
    const res = await request(app)
      .put(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });
    expect(res.statusCode).toBe(200);
    expect(res.body.description).toBe('Updated description');
  });

  it('should delete a project', async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Project deleted');
  });
}); 