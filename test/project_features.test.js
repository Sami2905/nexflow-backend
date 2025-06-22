const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Project = require('../models/Project');
const jwt = require('jsonwebtoken');

let creatorToken, memberToken;
let creatorId, memberId, projectId;

beforeAll(async () => {
  await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  // Create creator user
  const creator = new User({ name: 'Creator', email: 'creator@example.com', password: 'testpass' });
  await creator.save();
  creatorId = creator._id;
  creatorToken = jwt.sign({ id: creatorId, email: creator.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
  // Create member user
  const member = new User({ name: 'Member', email: 'member@example.com', password: 'testpass' });
  await member.save();
  memberId = member._id;
  memberToken = jwt.sign({ id: memberId, email: member.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
});

afterAll(async () => {
  await Project.deleteMany({ createdBy: creatorId });
  await User.deleteOne({ _id: creatorId });
  await User.deleteOne({ _id: memberId });
  await mongoose.connection.close();
});

describe('Project Features', () => {
  it('should create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: 'Feature Project', description: 'Test all features' });
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('Feature Project');
    projectId = res.body._id;
  });

  it('should invite a member', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/invite`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ email: 'member@example.com' });
    expect(res.statusCode).toBe(200);
    expect(res.body.members.some(m => m.email === 'member@example.com')).toBe(true);
  });

  it('should not allow non-creator to invite', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/invite`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'creator@example.com' });
    expect(res.statusCode).toBe(404); // Not authorized
  });

  it('should list members including invited member', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.members.some(m => m.email === 'member@example.com')).toBe(true);
  });

  it('should remove a member', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/remove-member`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ userId: memberId });
    expect(res.statusCode).toBe(200);
    expect(res.body.members.some(m => m.email === 'member@example.com')).toBe(false);
  });

  it('should not allow non-creator to remove member', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/remove-member`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ userId: creatorId });
    expect(res.statusCode).toBe(404); // Not authorized
  });
}); 