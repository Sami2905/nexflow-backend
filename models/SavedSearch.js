const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  searchTerm: {
    type: String,
    default: ''
  },
  filters: {
    project: { type: String, default: '' },
    assignee: { type: String, default: '' },
    priority: { type: String, default: '' },
    status: { type: String, default: '' },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
    tags: { type: String, default: '' },
    createdBy: { type: String, default: '' }
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure user can't have duplicate search names
savedSearchSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SavedSearch', savedSearchSchema); 