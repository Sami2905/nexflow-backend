const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
});
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket.io client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket.io client disconnected:', socket.id);
  });
});

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
});

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const bugRoutes = require('./routes/bugs');
app.use('/api/bugs', bugRoutes);

const activityRoutes = require('./routes/activity');
app.use('/api/projects/:projectId/activity', activityRoutes);
app.use('/api/activity', activityRoutes);

const projectRoutes = require('./routes/projects');
app.use('/api/projects', projectRoutes);

const savedSearchRoutes = require('./routes/savedSearches');
app.use('/api/saved-searches', savedSearchRoutes);

app.use('/uploads', require('express').static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.send('Server is running');
});

// Connect to MongoDB
mongoose.connect(process.env.ATLAS_URI)
  .then(async () => {
    console.log('MongoDB database connection established successfully');
    // Auto-seed demo data if DB is empty
    const User = require('./models/User');
    const Project = require('./models/Project');
    const Bug = require('./models/Bug');
    const userCount = await User.countDocuments();
    const projectCount = await Project.countDocuments();
    const bugCount = await Bug.countDocuments();
    if (userCount === 0 && projectCount === 0 && bugCount === 0) {
      console.log('Database is empty. Seeding demo data...');
      try {
        await require('./scripts/seedDemoData');
        console.log('Demo data seeded successfully!');
      } catch (seedErr) {
        console.error('Failed to seed demo data:', seedErr);
      }
    }
    // Only start the server if the database connection is successful
    if (require.main === module) {
      server.listen(port, '0.0.0.0', () => {
        console.log(`Server (with Socket.io) is running on port: ${port}`);
      });
    }
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process with an error code
  });

// Add this at the end, after all routes
app.use((err, req, res, next) => {
  console.error('GLOBAL ERROR HANDLER:', err);
  res.status(500).json({ message: err.message, stack: err.stack });
});

// Export the app and io for testing and use in routes
module.exports = { app, io }; 