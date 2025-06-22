const express = require('express');
const jwt = require('jsonwebtoken');
const Project = require('../models/Project');
const User = require('../models/User');
const { requireRole } = require('../middleware/role');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Bug = require('../models/Bug');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Create a project
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    const project = new Project({
      name,
      description,
      createdBy: req.userId,
      members: [{ user: req.userId, role: 'Owner' }]
    });
    await project.save();
    // Log activity
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'project_created',
      message: `Created project: ${project.name}`,
      meta: { projectId: project._id }
    });
    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all projects for the logged-in user with pagination
router.get('/', auth, async (req, res) => {
  try {
    const projects = await Project.find({ 'members.user': req.userId, archived: false })
      .populate('members.user', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json(projects);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single project (allow admin access)
router.get('/:id', auth, async (req, res) => {
  console.log('GET /projects/:id called', { userId: req.userId, projectId: req.params.id });
  try {
    const user = await User.findById(req.userId);
    let project;
    if (user && user.role === 'admin') {
      project = await Project.findById(req.params.id).populate('members.user', 'name email');
    } else {
      project = await Project.findOne({
        _id: req.params.id,
        $or: [
          { createdBy: req.userId },
          { 'members.user': req.userId }
        ]
      }).populate('members.user', 'name email');
    }
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    console.error('Error in GET /projects/:id:', err);
    console.error('Request userId:', req.userId, 'projectId:', req.params.id);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
});

// Update a project (only creator can update)
router.put('/:id', auth, async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    // Log activity
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'project_updated',
      message: `Updated project: ${project.name}`,
      meta: { projectId: project._id, changes: req.body }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a project (creator or admin can delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    console.log(`[DELETE] Attempting to delete project with id: ${req.params.id} by user: ${req.userId}`);
    const user = await User.findById(req.userId);
    const project = await Project.findById(req.params.id);
    
    if (!project) {
      console.error(`[DELETE] Project not found in database with id: ${req.params.id}`);
      return res.status(404).json({ message: 'Project not found' });
    }

    // Allow if user is creator or admin
    if (project.createdBy.toString() !== req.userId && user.role !== 'admin') {
      console.warn(`[DELETE] Authorization failed for user ${req.userId} on project ${req.params.id}`);
      return res.status(403).json({ message: 'Not authorized to delete this project' });
    }

    await Project.deleteOne({ _id: req.params.id });
    console.log(`[DELETE] Successfully deleted project: ${req.params.id}`);

    // Log activity
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'project_deleted',
      message: `Deleted project: ${project.name}`,
      meta: { projectId: project._id }
    });
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Invite (add) a member to a project (with role)
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const { email, role = 'Member' } = req.body;
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    const user = await User.findOne({ email });
    if (user) {
      if (project.members.some(m => m.user.toString() === user._id.toString())) return res.status(400).json({ message: 'User already a member' });
      project.members.push({ user: user._id, role });
      await project.save();
      await project.populate('members.user');
      await Notification.create({
        user: user._id,
        type: 'project_invite',
        message: `You have been invited to the project '${project.name}'.`,
        meta: { projectId: project._id, projectName: project.name }
      });
      await Activity.create({
        project: project._id,
        user: req.userId,
        type: 'member_added',
        message: `Added member: ${user.email} as ${role}`,
        meta: { userId: user._id, email: user.email, role }
      });
      return res.json(project);
    } else {
      if (project.pendingInvites.some(inv => inv.email === email)) {
        return res.status(400).json({ message: 'User already invited' });
      }
      project.pendingInvites.push({ email, invitedBy: req.userId });
      await project.save();
      await Activity.create({
        project: project._id,
        user: req.userId,
        type: 'member_invited',
        message: `Invited ${email} to the project`,
        meta: { email }
      });
      return res.json(project);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Change a member's role
router.put('/:id/members/:userId/role', auth, async (req, res) => {
  try {
    const { role } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    // Only Owner/Admin can change roles
    const actingMember = project.members.find(m => m.user.toString() === req.userId);
    if (!actingMember || !['Owner', 'Admin'].includes(actingMember.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    // Prevent demoting Owner
    const member = project.members.find(m => m.user.toString() === req.params.userId);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (member.role === 'Owner') return res.status(400).json({ message: 'Cannot change role of Owner' });
    member.role = role;
    await project.save();
    await project.populate('members.user');
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'role_changed',
      message: `Changed role of ${member.user} to ${role}`,
      meta: { userId: member.user, role }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Accept invite
router.post('/:id/accept-invite', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    const user = await User.findById(req.userId);
    if (!project || !user) return res.status(404).json({ message: 'Project or user not found' });
    const inviteIdx = project.pendingInvites.findIndex(inv => inv.email === user.email);
    if (inviteIdx === -1) return res.status(400).json({ message: 'No pending invite found' });
    project.pendingInvites.splice(inviteIdx, 1);
    if (!project.members.includes(user._id)) project.members.push(user._id);
    await project.save();
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'invite_accepted',
      message: `${user.email} accepted the invitation`,
      meta: { userId: user._id, email: user.email }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Decline invite
router.post('/:id/decline-invite', auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    const user = await User.findById(req.userId);
    if (!project || !user) return res.status(404).json({ message: 'Project or user not found' });
    const inviteIdx = project.pendingInvites.findIndex(inv => inv.email === user.email);
    if (inviteIdx === -1) return res.status(400).json({ message: 'No pending invite found' });
    project.pendingInvites.splice(inviteIdx, 1);
    await project.save();
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'invite_declined',
      message: `${user.email} declined the invitation`,
      meta: { userId: user._id, email: user.email }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cancel invite (owner)
router.post('/:id/cancel-invite', auth, async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    const inviteIdx = project.pendingInvites.findIndex(inv => inv.email === email);
    if (inviteIdx === -1) return res.status(400).json({ message: 'No pending invite found' });
    project.pendingInvites.splice(inviteIdx, 1);
    await project.save();
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'invite_cancelled',
      message: `Cancelled invitation for ${email}`,
      meta: { email }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Remove a member from a project
router.post('/:id/remove-member', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    project.members = project.members.filter(m => m.toString() !== userId);
    await project.save();
    await project.populate('members');
    // Log activity
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'member_removed',
      message: `Removed member: ${userId}`,
      meta: { userId }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Archive/unarchive activity log
router.post('/:id/archive', auth, async (req, res) => {
  try {
    const { archived } = req.body;
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    project.archived = !!archived;
    await project.save();
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: archived ? 'project_archived' : 'project_unarchived',
      message: archived ? `Archived project: ${project.name}` : `Unarchived project: ${project.name}`,
      meta: { projectId: project._id }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Failed to archive/unarchive project' });
  }
});

// Transfer ownership activity log
router.post('/:id/transfer-ownership', auth, async (req, res) => {
  try {
    const { newOwnerId } = req.body;
    const project = await Project.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!project) return res.status(404).json({ message: 'Project not found or not authorized' });
    if (!project.members.includes(newOwnerId)) return res.status(400).json({ message: 'New owner must be a project member' });
    project.createdBy = newOwnerId;
    await project.save();
    await Activity.create({
      project: project._id,
      user: req.userId,
      type: 'ownership_transferred',
      message: `Transferred ownership to user: ${newOwnerId}`,
      meta: { newOwnerId }
    });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: 'Failed to transfer ownership' });
  }
});

// Catch-all for unmatched requests to /api/projects/*
router.all('*', (req, res) => {
  console.log('[PROJECTS ROUTE] Unmatched request:', req.method, req.originalUrl);
  res.status(404).json({ message: 'Not found in projects router' });
});

module.exports = router; 