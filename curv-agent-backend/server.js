require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 5002;

// Initialize in-memory store for recent webhook events
app.locals.recentEvents = []; // Simple array for demo purposes
const MAX_EVENTS_STORED = 50; // Limit the number of events stored in memory

app.use(express.json());

// Import and use API routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Import and use Webhook routes
const webhookRoutes = require('./routes/webhooks');
app.use('/webhook', webhookRoutes);

app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'pong from curv-agent-backend' });
});

// Start server only if run directly (not required by test)
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Curv Agent Backend listening on port ${PORT}`);
  });
}

// Export the app instance for testing
module.exports = { app, server }; // Export server too if needed for teardown 