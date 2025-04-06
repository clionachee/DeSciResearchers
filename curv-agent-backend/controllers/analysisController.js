const axios = require('axios');
const { OpenAI } = require('openai'); // Import OpenAI library
require('dotenv').config();

const MULTIBAAS_BASE_URL = process.env.MULTIBAAS_BASE_URL;
const MULTIBAAS_API_KEY = process.env.MULTIBAAS_API_KEY;

// OpenRouter Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL;
const OPENROUTER_MODEL_NAME = process.env.OPENROUTER_MODEL_NAME;

// Configure OpenAI client for OpenRouter
const openAIClient = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: OPENROUTER_BASE_URL,
});

// --- MultiBaas API Helper Functions (Basic) ---

// TODO: Replace with actual contract address/label and network
const CONTRACT_LABEL = 'desci'; // Use the label provided by the user, assumed to be correct in MB UI
const CHAIN = 'polygon';
const NETWORK = 'amoy';

/**
 * Helper to make authenticated requests to MultiBaas API
 */
const mbRequest = axios.create({
  baseURL: MULTIBAAS_BASE_URL,
  headers: {
    'Authorization': `Bearer ${MULTIBAAS_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Queries past events using MultiBaas Event Queries.
 * Example: Query Transfer events to a specific address.
 */
const queryTransferEvents = async (toAddress) => {
  if (!MULTIBAAS_BASE_URL || !MULTIBAAS_API_KEY) {
    console.error('MultiBaas URL or API Key not configured!');
    return []; // Return empty array on config error
  }
  try {
    // Example query: Find Transfer events where the 'to' argument matches the recipient
    // Adjust eventSignature and filter based on your actual NeuroArt contract
    const eventSignature = 'Transfer(address,address,uint256)';
    const query = `event.signature == "${eventSignature}" && event.data.to == "${toAddress}"`;
    console.log(`[MB Query] Querying events with filter: ${query}`);

    const response = await mbRequest.get(`/${CHAIN}/${NETWORK}/events`, {
      params: {
        contract: CONTRACT_LABEL,
        filter: query,
        limit: 10 // Limit results for performance
      }
    });
    console.log(`[MB Query] Found ${response.data.result.length} Transfer events for ${toAddress}`);
    return response.data.result; // Array of event objects
  } catch (error) {
    console.error('[MB Query] Error querying events:', error.response ? JSON.stringify(error.response.data) : error.message);
    return []; // Return empty on error
  }
};

/**
 * Calls a read-only contract function using MultiBaas REST API.
 * Example: Get NFT balance of an address.
 */
const getBalanceOf = async (ownerAddress) => {
  if (!MULTIBAAS_BASE_URL || !MULTIBAAS_API_KEY) {
    console.error('MultiBaas URL or API Key not configured!');
    return null;
  }
  try {
    const functionName = 'balanceOf';
    console.log(`[MB Read] Calling ${functionName} for ${ownerAddress} on ${CONTRACT_LABEL}`);
    const response = await mbRequest.post(`/${CHAIN}/${NETWORK}/contracts/${CONTRACT_LABEL}/${functionName}`, {
      args: [ownerAddress],
      // Add 'from' if the contract requires it for reads, otherwise optional
      // from: "0x...someAddress..."
    });
    console.log(`[MB Read] ${functionName} result:`, response.data.result.output);
    return response.data.result.output; // The return value of the function call
  } catch (error) {
    console.error('[MB Read] Error calling contract read function:', error.response ? JSON.stringify(error.response.data) : error.message);
    return null;
  }
};

// --- Main Controller Logic ---

/**
 * Handles the /api/process request from Unity.
 * Fetches data from MultiBaas, reads recent webhook events, calls OpenRouter AI, returns results.
 */
const processDataController = async (req, res) => {
  console.log('[Analysis Controller] Received /api/process request:');
  // Avoid logging potentially sensitive API keys if present in body by mistake
  // console.log(JSON.stringify(req.body, null, 2));

  const { userId, recipientAddress, behaviorData, aiInput } = req.body;

  // --- Input Validation (Basic) ---
  if (!userId || !recipientAddress || !behaviorData || !aiInput) {
    return res.status(400).json({ error: 'Missing required fields in request body' });
  }
  if (!OPENROUTER_API_KEY || !OPENROUTER_BASE_URL || !OPENROUTER_MODEL_NAME) {
    console.error('OpenRouter configuration missing in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: OpenRouter not configured.' });
  }

  try {
    // --- 1. MultiBaas Interactions (Restore Calls) ---
    console.log('[Analysis Controller] Fetching data from MultiBaas...'); // Restore log
    const pastTransferEvents = await queryTransferEvents(recipientAddress); // Uncommented
    const currentBalance = await getBalanceOf(recipientAddress); // Uncommented

    // --- 2. Access Recent Webhook Data ---
    console.log('[Analysis Controller] Accessing recent webhook events...');
    const allRecentEvents = req.app.locals.recentEvents || [];
    // Example: Filter events relevant to the current recipient or user if needed
    const relevantRecentEvents = allRecentEvents.filter(
        event => event.params.to === recipientAddress || event.params.from === recipientAddress // Example filter
    ).slice(0, 5); // Limit the number included in the prompt

    console.log(`[Analysis Controller] Found ${relevantRecentEvents.length} relevant recent events for prompt.`);

    // --- 3. Prepare Data and Call OpenRouter AI ---
    console.log('[Analysis Controller] Preparing data and calling OpenRouter AI...');

    // Construct a prompt for the OpenRouter model
    const prompt = `
      Analyze the following user data and blockchain context to generate a concise assessment.
      The user ID is ${userId}.
      The target recipient address is ${recipientAddress}.

      User Behavior Data:
      - Choice: ${behaviorData.choice}
      - Interaction Time (s): ${behaviorData.interactionTimeSeconds}
      - Other Behavior: ${JSON.stringify(behaviorData)}

      User AI Input:
      - Keywords: ${aiInput.promptKeywords ? aiInput.promptKeywords.join(', ') : 'None'}
      - Other Input: ${JSON.stringify(aiInput)}

      Blockchain Context (from MultiBaas API/Queries):
      - Past Transfer Events to Recipient (limit 10): ${pastTransferEvents.length > 0 ? JSON.stringify(pastTransferEvents.map(e => ({ txHash: e.transaction.txHash, blockNumber: e.transaction.blockNumber }))) : 'None found'}
      - Current NFT Balance of Recipient: ${currentBalance !== null ? currentBalance : 'Error fetching'}

      Recent Relevant Blockchain Events (from Webhooks, limit 5):
      ${relevantRecentEvents.length > 0 ? JSON.stringify(relevantRecentEvents.map(e => ({ name: e.eventName, block: e.blockNumber, tx: e.transactionHash, params: e.params }))) : 'None relevant found recently.'}

      Desired Output Format:
      Please provide your analysis strictly in the following JSON format:
      {
        "score": <a numerical score between 0 and 100 representing overall assessment>,
        "insights": [<one or two short string insights based on the analysis>],
        "processedData": {
          "focusLevelEstimate": <a numerical estimate between 0.0 and 1.0, potentially derived from score or behavior>,
          "themeSuggestion": <a short string suggesting a theme, e.g., "Light & Focused" or "Exploring"> 
        }
      }
    `;

    console.log(`[Analysis Controller] Sending prompt to OpenRouter model: ${OPENROUTER_MODEL_NAME}`);

    // Call OpenRouter API using the OpenAI client
    const completion = await openAIClient.chat.completions.create({
      model: OPENROUTER_MODEL_NAME,
      messages: [
        { role: "system", content: "You are an AI assistant analyzing user behavior and blockchain data (including recent events) to provide a score, insights, and processed data in JSON format." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }, // Request JSON output if model supports it
      temperature: 0.5, // Adjust creativity/determinism
      // max_tokens: 150 // Limit response length if needed
    });

    console.log('[Analysis Controller] Received response from OpenRouter.');
    // console.log(completion.choices[0].message.content);

    // --- 4. Parse AI Response and Construct Final Payload ---
    let analysisResult = { score: 0, insights: ["AI analysis failed."], processedData: {} };
    try {
      analysisResult = JSON.parse(completion.choices[0].message.content);
      // Basic validation of parsed structure
      if (typeof analysisResult.score !== 'number' || !Array.isArray(analysisResult.insights) || typeof analysisResult.processedData !== 'object') {
        throw new Error('Parsed AI response has incorrect structure.');
      }
    } catch (parseError) {
      console.error('[Analysis Controller] Failed to parse JSON response from AI:', parseError);
      console.error('Raw AI Response:', completion.choices[0].message.content);
      // Fallback or error handling - maybe return the raw response or a default error structure
      // For now, we keep the default error structure defined above.
    }

    const responsePayload = {
      analysisId: require('crypto').randomUUID(),
      score: analysisResult.score,
      insights: analysisResult.insights,
      processedData: analysisResult.processedData,
    };

    console.log('[Analysis Controller] Sending final response:', JSON.stringify(responsePayload, null, 2));
    res.status(200).json(responsePayload);

  } catch (error) {
    console.error('[Analysis Controller] Error processing data:', error.response ? error.response.data : error.message);
    // Check for specific OpenAI/OpenRouter errors if needed
    if (error.response && error.response.data && error.response.data.error) {
      return res.status(500).json({ error: `AI API Error: ${error.response.data.error.message}` });
    }
    res.status(500).json({ error: 'Internal server error during analysis' });
  }
};

module.exports = {
  processDataController,
}; 