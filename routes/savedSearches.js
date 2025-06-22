const express = require('express');
const jwt = require('jsonwebtoken');
const SavedSearch = require('../models/SavedSearch');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Get all saved searches for the user
router.get('/', auth, async (req, res) => {
  try {
    const savedSearches = await SavedSearch.find({ user: req.userId })
      .sort({ createdAt: -1 });
    res.json(savedSearches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new saved search
router.post('/', auth, async (req, res) => {
  try {
    const { name, searchTerm, filters } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Search name is required' });
    }

    // Check if search name already exists for this user
    const existingSearch = await SavedSearch.findOne({ 
      user: req.userId, 
      name: name.trim() 
    });
    
    if (existingSearch) {
      return res.status(400).json({ message: 'A search with this name already exists' });
    }

    const savedSearch = new SavedSearch({
      user: req.userId,
      name: name.trim(),
      searchTerm: searchTerm || '',
      filters: filters || {}
    });

    await savedSearch.save();
    res.status(201).json(savedSearch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update a saved search
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, searchTerm, filters } = req.body;
    
    const savedSearch = await SavedSearch.findOne({ 
      _id: req.params.id, 
      user: req.userId 
    });
    
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    if (name && name.trim() !== savedSearch.name) {
      // Check if new name conflicts with existing search
      const existingSearch = await SavedSearch.findOne({ 
        user: req.userId, 
        name: name.trim(),
        _id: { $ne: req.params.id }
      });
      
      if (existingSearch) {
        return res.status(400).json({ message: 'A search with this name already exists' });
      }
    }

    savedSearch.name = name ? name.trim() : savedSearch.name;
    savedSearch.searchTerm = searchTerm !== undefined ? searchTerm : savedSearch.searchTerm;
    savedSearch.filters = filters || savedSearch.filters;

    await savedSearch.save();
    res.json(savedSearch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a saved search
router.delete('/:id', auth, async (req, res) => {
  try {
    const savedSearch = await SavedSearch.findOneAndDelete({ 
      _id: req.params.id, 
      user: req.userId 
    });
    
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    res.json({ message: 'Saved search deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Set a saved search as default
router.patch('/:id/default', auth, async (req, res) => {
  try {
    // Remove default from all other searches
    await SavedSearch.updateMany(
      { user: req.userId },
      { isDefault: false }
    );

    // Set this search as default
    const savedSearch = await SavedSearch.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { isDefault: true },
      { new: true }
    );

    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    res.json(savedSearch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 