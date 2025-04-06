const express = require('express');
const router = express.Router();

// Import controller functions
const { processDataController } = require('../controllers/analysisController');

// Define the route for processing data from Unity
// POST /api/process
router.post('/process', processDataController);

module.exports = router; 