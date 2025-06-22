const express = require('express');
const jwt = require('jsonwebtoken');
const Bug = require('../models/Bug');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Comment = require('../models/Comment');
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');

const router = express.Router();

const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

// Create a bug
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, status, priority, project, assignedTo } = req.body;
    const bug = new Bug({
      title,
      description,
      status,
      priority,
      project,
      assignedTo,
      createdBy: req.userId
    });
    await bug.save();
    if (req.body.assignedTo && req.body.assignedTo !== bug.assignedTo?.toString()) {
      const notification = await Notification.create({
        user: req.body.assignedTo,
        type: 'bug_assigned',
        message: `You were assigned to bug: ${bug.title}`,
        meta: { bugId: bug._id, projectId: bug.project },
      });
      emitNotification(req.app.get('io'), req.body.assignedTo, notification);
    }
    // Log activity
    await Activity.create({
      project: bug.project,
      user: req.userId,
      type: 'bug_created',
      message: `Created bug: ${bug.title}`,
      meta: { bugId: bug._id }
    });
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('bugCreated', bug);
    res.status(201).json(bug);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all bugs for projects the user is a member of
router.get('/', auth, async (req, res) => {
  console.log('GET /api/bugs called', { userId: req.userId, project: req.query.project });
  try {
    const { 
      project, 
      status, 
      priority, 
      q, 
      assignee, 
      from, 
      to, 
      tags, 
      createdBy,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 50,
      page = 1
    } = req.query;
    
    // Find projects the user is a member of
    const userProjects = await Project.find({ 'members.user': req.userId }).select('_id');
    const userProjectIds = userProjects.map(p => p._id);

    const filter = { project: { $in: userProjectIds } };
    
    // If a specific project is requested, filter by it, but only if user has access
    if (project) {
      if (userProjectIds.map(id => id.toString()).includes(project)) {
        filter.project = project;
      } else {
        // If user doesn't have access to the requested project, return empty
        return res.json({ bugs: [], pagination: { total: 0, page: 1, limit: parseInt(limit), pages: 0 } });
      }
    }
    
    // Basic filters
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignee) {
      if (assignee === 'unassigned') {
        filter.assignedTo = { $exists: false };
      } else {
        filter.assignedTo = assignee;
      }
    }
    if (createdBy) filter.createdBy = createdBy;
    
    // Date range filter
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to + 'T23:59:59.999Z');
    }
    
    // Tags filter
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      filter.tags = { $in: tagArray };
    }
    
    // Text search
    let searchFilter = {};
    if (q && q.trim()) {
      searchFilter = { $text: { $search: q.trim() } };
    }
    
    // Combine filters
    const finalFilter = { ...filter, ...searchFilter };
    
    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query with population
    const bugs = await Bug.find(finalFilter)
      .populate('project', 'name description')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skip);
    
    // Get total count for pagination
    const total = await Bug.countDocuments(finalFilter);
    
    res.json({
      bugs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error in GET /api/bugs:', err);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
});

// GET bug stats for all projects (for dashboard)
router.get('/project-stats', auth, async (req, res) => {
  try {
    const projects = await Project.find({ 'members.user': req.userId }).select('_id name');
    const projectIds = projects.map(p => p._id);
    // Defensive: if no projects, return empty array
    if (projectIds.length === 0) {
      return res.json([]);
    }
    // Aggregate open/closed bug counts per project
    let bugCounts = [];
    try {
      bugCounts = await Bug.aggregate([
        { $match: { project: { $in: projectIds } } },
        { $group: {
          _id: { project: '$project', status: '$status' },
          count: { $sum: 1 }
        } }
      ]);
    } catch (aggErr) {
      console.error('BUG AGGREGATION ERROR:', aggErr);
      return res.json([]); // fallback to empty
    }
    const stats = projects.map(p => {
      const open = bugCounts.find(bc => String(bc._id.project) === String(p._id) && bc._id.status === 'Open')?.count || 0;
      const closed = bugCounts.find(bc => String(bc._id.project) === String(p._id) && bc._id.status === 'Closed')?.count || 0;
      return {
        projectId: p._id,
        name: p.name,
        open,
        closed
      };
    });
    res.json(stats);
  } catch (err) {
    console.error('PROJECT STATS ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch project bug stats', error: err.message, stack: err.stack });
  }
});

// GET bug stats summary for dashboard cards
router.get('/stats', auth, async (req, res) => {
  try {
    const { project } = req.query;
    // Find projects the user is a member of
    const userProjects = await Project.find({ 'members.user': req.userId }).select('_id');
    const userProjectIds = userProjects.map(p => p._id);
    let filter = { project: { $in: userProjectIds } };
    // Defensive: if no projects, return zero stats
    if (userProjectIds.length === 0) {
      return res.json({ total: 0, open: 0, closed: 0, highPriority: 0 });
    }
    // If a specific project is requested, add it to the filter
    if (project) {
        if (userProjectIds.map(id => id.toString()).includes(project)) {
            filter.project = project;
        } else {
            // If user doesn't have access, return zero stats
            return res.json({ total: 0, open: 0, closed: 0, highPriority: 0 });
        }
    }
    const total = await Bug.countDocuments(filter);
    const open = await Bug.countDocuments({ ...filter, status: 'Open' });
    const closed = await Bug.countDocuments({ ...filter, status: 'Closed' });
    const highPriority = await Bug.countDocuments({ ...filter, priority: 'High' });
    res.json({ total, open, closed, highPriority });
  } catch (err) {
    console.error('BUG STATS ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch bug stats' });
  }
});

// Get a single bug
router.get('/:id', auth, async (req, res) => {
  try {
    const bug = await Bug.findOne({ _id: req.params.id, createdBy: req.userId }).populate('project');
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    res.json(bug);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update a bug
router.put('/:id', auth, async (req, res) => {
  try {
    // Fetch the old bug BEFORE updating
    const oldBug = await Bug.findById(req.params.id);
    const statusChanged = oldBug && req.body.status && req.body.status !== oldBug.status;
    const priorityChanged = oldBug && req.body.priority && req.body.priority !== oldBug.priority;

    const bug = await Bug.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.userId },
      req.body,
      { new: true, runValidators: true }
    ).populate('project');
    if (!bug) return res.status(404).json({ message: 'Bug not found' });

    if (statusChanged && bug.assignedTo) {
      const notification = await Notification.create({
        user: bug.assignedTo,
        type: 'bug_status',
        message: `Status of bug '${bug.title}' changed to ${req.body.status}.`,
        meta: { bugId: bug._id, bugTitle: bug.title, newStatus: req.body.status }
      });
      emitNotification(req.app.get('io'), bug.assignedTo, notification);
    }
    // Log activity
    await Activity.create({
      project: bug.project,
      user: req.userId,
      type: 'bug_updated',
      message: `Updated bug: ${bug.title}`,
      meta: { bugId: bug._id, changes: req.body }
    });
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('bugUpdated', bug);
    // Emit Kanban event if status or priority changed
    if (io && (statusChanged || priorityChanged)) io.emit('kanbanUpdated', bug);
    res.json(bug);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a bug
router.delete('/:id', auth, async (req, res) => {
  try {
    const bug = await Bug.findOneAndDelete({ _id: req.params.id, createdBy: req.userId });
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    // Log activity
    await Activity.create({
      project: bug.project,
      user: req.userId,
      type: 'bug_deleted',
      message: `Deleted bug: ${bug.title}`,
      meta: { bugId: bug._id }
    });
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('bugDeleted', bug);
    res.json({ message: 'Bug deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get comments for a bug
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ bug: req.params.id }).populate('user', 'name email').sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a comment to a bug
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Comment text required' });
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    const comment = await Comment.create({ bug: bug._id, user: req.userId, text });
    await comment.populate('user', 'name email');
    await Activity.create({
      project: bug.project,
      user: req.userId,
      type: 'comment_added',
      message: `Commented on bug: ${bug.title}`,
      meta: { bugId: bug._id, commentId: comment._id }
    });
    const mentionRegex = /@([\w.\-]+)/g;
    const mentioned = [];
    let match;
    while ((match = mentionRegex.exec(text))) {
      mentioned.push(match[1]);
    }
    if (mentioned.length) {
      const users = await User.find({ name: { $in: mentioned } });
      for (const u of users) {
        const notification = await Notification.create({
          user: u._id,
          type: 'mention',
          message: `${req.user.name || req.user.email} mentioned you in a comment on bug: ${bug.title}`,
          meta: { bugId: bug._id, projectId: bug.project },
        });
        emitNotification(req.app.get('io'), u._id, notification);
      }
    }
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('commentAdded', { bugId: bug._id, comment });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update a comment on a bug
router.put('/:bugId/comments/:commentId', auth, async (req, res) => {
  try {
    const { bugId, commentId } = req.params;
    const { text } = req.body;
    const comment = await Comment.findOneAndUpdate(
      { _id: commentId, bug: bugId, user: req.userId },
      { text },
      { new: true }
    ).populate('user', 'name email');
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('commentUpdated', { bugId, comment });
    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a comment on a bug
router.delete('/:bugId/comments/:commentId', auth, async (req, res) => {
  try {
    const { bugId, commentId } = req.params;
    const comment = await Comment.findOneAndDelete({ _id: commentId, bug: bugId, user: req.userId });
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    // Emit real-time event
    const io = req.app.get('io');
    if (io) io.emit('commentDeleted', { bugId, commentId });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload attachment to a bug
router.post('/:id/attachments', auth, upload.single('file'), async (req, res) => {
  try {
    const bug = await Bug.findById(req.params.id);
    if (!bug) return res.status(404).json({ message: 'Bug not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const attachment = {
      filename: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      uploadedBy: req.userId,
      uploadedAt: new Date()
    };
    bug.attachments = bug.attachments || [];
    bug.attachments.push(attachment);
    await bug.save();
    res.status(201).json(attachment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Advanced search and filtering
router.get('/search', auth, async (req, res) => {
  try {
    const { q, assignee, priority, status, from, to, tags, project } = req.query;
    const filter = {};
    if (project) filter.project = project;
    if (assignee) filter.assignedTo = assignee;
    if (priority) filter.priority = priority;
    if (status) filter.status = status;
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    if (tags) filter.tags = { $in: tags.split(',') };
    let bugs;
    if (q) {
      bugs = await Bug.find({ $text: { $search: q }, ...filter });
    } else {
      bugs = await Bug.find(filter);
    }
    res.json(bugs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 