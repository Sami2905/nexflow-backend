const express = require('express');
const router = express.Router({ mergeParams: true });
const Activity = require('../models/Activity');
const { auth } = require('../middleware/auth');

// GET all activity logs for a project
router.get('/', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const logs = await Activity.find({ project: projectId })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
});

// POST a new activity log (for testing/manual use)
router.post('/', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { type, message, meta } = req.body;
    const activity = new Activity({
      project: projectId,
      user: req.userId,
      type,
      message,
      meta: meta || null
    });
    await activity.save();
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('projectActivity', activity);
    res.status(201).json(activity);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create activity log' });
  }
});

// GET /api/activity - get recent activity logs
router.get('/api/activity', async (req, res) => {
  try {
    const logs = await Activity.find().sort({ createdAt: -1 }).limit(20);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
});

// GET activity trends (counts per day for last 30 days)
router.get('/trends', auth, async (req, res) => {
  try {
    const { projectId } = req.query;
    const userProjects = await require('../models/Project').find({ 'members.user': req.userId }).select('_id');
    const userProjectIds = userProjects.map(p => p._id);
    let filter = { project: { $in: userProjectIds } };
    if (projectId && userProjectIds.map(id => String(id)).includes(projectId)) {
      filter.project = projectId;
    }
    // Only last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
    filter.createdAt = { $gte: startDate };
    // Aggregate by day
    const trends = await Activity.aggregate([
      { $match: filter },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 }
      } },
      { $sort: { _id: 1 } }
    ]);
    // Fill in missing days
    const result = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = trends.find(t => t._id === dateStr);
      result.push({ date: dateStr, count: found ? found.count : 0 });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch activity trends' });
  }
});

// GET top contributors (by activity count)
router.get('/top-contributors', auth, async (req, res) => {
  try {
    const userProjects = await require('../models/Project').find({ 'members.user': req.userId }).select('_id');
    const userProjectIds = userProjects.map(p => p._id);
    const contributors = await Activity.aggregate([
      { $match: { project: { $in: userProjectIds } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userInfo'
      } },
      { $unwind: '$userInfo' },
      { $project: { userId: '$_id', name: '$userInfo.name', count: 1 } }
    ]);
    res.json(contributors);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch top contributors' });
  }
});

module.exports = router; 