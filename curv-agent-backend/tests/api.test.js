const request = require('supertest');
const { app, server } = require('../server'); // Import the configured app

// Basic test suite for API endpoints
describe('API Endpoints', () => {

  // Test the /ping endpoint
  it('should return pong for GET /ping', async () => {
    const res = await request(app).get('/ping');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message', 'pong from curv-agent-backend');
  });

  // Test the /api/process endpoint (basic check)
  it('should respond to POST /api/process (even with errors initially)', async () => {
    const mockData = {
      userId: "test-user-for-jest",
      recipientAddress: "0x000000000000000000000000000000000000dEaD", // Example address
      behaviorData: {
        choice: "test",
        interactionTimeSeconds: 1.0
      },
      aiInput: {
        promptKeywords: ["test"]
      }
    };

    const res = await request(app)
      .post('/api/process')
      .send(mockData);

    // We expect it to respond, but likely with an error initially
    // due to missing real API keys or configuration.
    // Status code might be 500 (Internal Server Error) or 4xx/5xx from API calls.
    // Or it might return the default error structure if parsing fails.
    expect(res.statusCode).toBeGreaterThanOrEqual(200); // Check if it responds at all
    expect(res.body).toBeDefined(); // Check if body is present

    // You can add more specific checks here later based on expected error or success states
    // For example, if keys are missing, it might return a 500 with a specific message:
    // if (!process.env.MULTIBAAS_API_KEY || !process.env.OPENROUTER_API_KEY) {
    //   expect(res.statusCode).toEqual(500);
    //   // expect(res.body).toHaveProperty('error', expect.stringContaining('configuration missing'));
    // }
  }, 15000); // Increase timeout to 15 seconds for this test

  // Add more tests for /webhook/events if needed
  // ...

});

// Optional: Close the server after all tests run to prevent Jest hanging
// Note: This might cause issues if tests run in parallel without proper handling
afterAll((done) => {
  if (server) {
    server.close(done);
  } else {
    done(); // If server wasn't started (e.g., just running tests), call done immediately
  }
}); 