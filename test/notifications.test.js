const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Project = require('../models/Project');
const Bug = require('../models/Bug');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');

let creatorToken, memberToken, creatorId, memberId, projectId, bugId, statusBugId;

beforeAll(async () => {
  await mongoose.connect(process.env.ATLAS_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  // Create users
  const creator = new User({ name: 'Notif Creator', email: 'notifcreator@example.com', password: 'testpass' });
  await creator.save();
  creatorId = creator._id;
  creatorToken = jwt.sign({ id: creatorId, email: creator.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const member = new User({ name: 'Notif Member', email: 'notifmember@example.com', password: 'testpass' });
  await member.save();
  memberId = member._id;
  memberToken = jwt.sign({ id: memberId, email: member.email }, process.env.JWT_SECRET, { expiresIn: '1d' });
});

afterAll(async () => {
  await Notification.deleteMany({});
  await Bug.deleteMany({});
  await Project.deleteMany({});
  await User.deleteOne({ _id: creatorId });
  await User.deleteOne({ _id: memberId });
  await mongoose.connection.close();
});

describe('Notification API', () => {
  it('should create a notification on project invite', async () => {
    // Create project
    const res1 = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: 'Notif Project', description: 'Notif test' });
    projectId = res1.body._id;
    // Invite member
    await request(app)
      .post(`/api/projects/${projectId}/invite`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ email: 'notifmember@example.com' });
    // Check notification
    const notifRes = await request(app)
      .get('/api/auth/notifications')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(notifRes.body.some(n => n.type === 'project_invite')).toBe(true);
  });

  it('should create a notification on bug assignment', async () => {
    // Create bug assigned to member
    const res = await request(app)
      .post('/api/bugs')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ title: 'Notif Bug', description: 'Bug for notif', priority: 'High', status: 'Open', assignedTo: memberId });
    statusBugId = res.body._id;
    // Check notification
    const notifRes = await request(app)
      .get('/api/auth/notifications')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(notifRes.body.some(n => n.type === 'bug_assigned')).toBe(true);
  });

  it('should create a notification on bug status change', async () => {
    // Update status on the bug assigned to member
    await request(app)
      .put(`/api/bugs/${statusBugId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ status: 'Closed' });
    // Check notification
    const notifRes = await request(app)
      .get('/api/auth/notifications')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(notifRes.body.some(n => n.type === 'bug_status')).toBe(true);
  });

  it('should mark a notification as read', async () => {
    const notifRes = await request(app)
      .get('/api/auth/notifications')
      .set('Authorization', `Bearer ${memberToken}`);
    const notifId = notifRes.body.find(n => !n.read)._id;
    const markRes = await request(app)
      .patch(`/api/auth/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(markRes.body.read).toBe(true);
  });
}); 