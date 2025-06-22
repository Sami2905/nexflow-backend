const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Bug = require('../models/Bug');
const jwt = require('jsonwebtoken');

let token;
let userId;
let bugId;

beforeAll(async () => {
  await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const user = new User({ name: 'Bug Tester', email: 'bugtester@example.com', password: 'testpass' });
  await user.save();
  userId = user._id;
  token = jwt.sign({ id: userId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
});

afterAll(async () => {
  await Bug.deleteMany({ createdBy: userId });
  await User.deleteOne({ _id: userId });
  await mongoose.connection.close();
});

describe('Bug API', () => {
  it('should create a bug', async () => {
    const res = await request(app)
      .post('/api/bugs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bug 1', description: 'A test bug', priority: 'High', status: 'Open' });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Bug 1');
    bugId = res.body._id;
  });

  it('should get all bugs for the user', async () => {
    const res = await request(app)
      .get('/api/bugs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(b => b._id === bugId)).toBe(true);
  });

  it('should get a single bug', async () => {
    const res = await request(app)
      .get(`/api/bugs/${bugId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body._id).toBe(bugId);
  });

  it('should update a bug', async () => {
    const res = await request(app)
      .put(`/api/bugs/${bugId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Closed' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Closed');
  });

  it('should delete a bug', async () => {
    const res = await request(app)
      .delete(`/api/bugs/${bugId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Bug deleted');
  });
}); 