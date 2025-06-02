// IMPORTANT: Mock OpenAI will be applied in beforeEach to ensure freshness after resetModules

// Handler will be required dynamically in tests that need a fresh module instance

describe('/api/create_thread.js', () => {
  let OLD_ENV;
  let createThreadHandler; 
  let OpenAI; // Will be set in beforeEach to get the fresh mock

  // Manual mock for response object
  const mockResponse = () => {
    const res = {};
    res.statusCode = 0; // Default status code
    res.jsonData = {};  // To store JSON data
    res.status = jest.fn((code) => {
      res.statusCode = code;
      return res; // Enable chaining
    });
    res.json = jest.fn((data) => {
      res.jsonData = data;
      return res; // Enable chaining
    });
    // Helper to get stored status for assertions
    res._getStatusCode = () => res.statusCode;
    // Helper to get stored JSON data for assertions
    res._getJSONData = () => res.jsonData;
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks(); // Reset all mocks

    // Backup and set environment variables for a default good state
    OLD_ENV = { ...process.env }; 
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Dynamically import the handler and the mock to get fresh instances with current env vars
    jest.resetModules(); 
    jest.mock('openai'); // Apply mock for this specific test's module loading cycle
    OpenAI = require('openai'); // Get the FRESH mock constructor for this cycle
    createThreadHandler = require('../../api/create_thread.js');
    // mockOpenAIMethods is no longer used; we directly use OpenAI.mockInstance
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore environment variables
  });

  test('should create a thread successfully (200)', async () => {
    const mockThreadId = 'thread_123_success';
    // Configure the mock directly on the static instance reference AFTER handler has been loaded for this test cycle
    OpenAI.mockInstance.beta.threads.create.mockResolvedValueOnce({ id: mockThreadId });

    const req = { method: 'POST', url: '/api/create_thread.js' };
    const res = mockResponse();

    await createThreadHandler(req, res); // createThreadHandler is from beforeEach

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ threadId: mockThreadId });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ threadId: mockThreadId });
    expect(OpenAI.mockInstance.beta.threads.create).toHaveBeenCalledTimes(1); // Check the same path
  });

  test('should return 405 if method is not POST', async () => {
    const req = { method: 'GET', url: '/api/create_thread.js' };
    const res = mockResponse();

    await createThreadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Method Not Allowed' }));
    expect(res._getStatusCode()).toBe(405);
  });

  test('should return 500 if OPENAI_API_KEY is not set (client fails to initialize)', async () => {
    delete process.env.OPENAI_API_KEY;
        
    // Reset modules to force re-evaluation of openai client initialization
    jest.resetModules(); 
    jest.mock('openai'); // Re-apply mock for the fresh module
    const freshHandlerNoKey = require('../../api/create_thread.js');
    // No need for FreshOpenAI here, mockOpenAIMethods is reset in beforeEach
    // to point to the correct mock instance.

    const req = { method: 'POST', url: '/api/create_thread.js' };
    const res = mockResponse();

    await freshHandlerNoKey(req, res);
    
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
      error: 'Server Configuration Error',
      details: expect.stringContaining('OpenAI client not initialized') 
    }));
    expect(res._getStatusCode()).toBe(500);
  });
  
  test('should return API error status on OpenAI APIError when creating a thread', async () => {
    const errorBody = { message: 'Rate limit exceeded' };
    const apiError = new OpenAI.APIError(
        429, 
        errorBody, 
        'APIError_RateLimit', 
        {} 
    );
    // Configure mock directly on the static instance for this test case
    OpenAI.mockInstance.beta.threads.create.mockRejectedValueOnce(apiError);

    const req = { method: 'POST', url: '/api/create_thread.js' };
    const res = mockResponse();

    await createThreadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(apiError.status); 
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
      error: 'OpenAI Service Error',
      details: errorBody.message 
    }));
    expect(res._getStatusCode()).toBe(apiError.status);
  });

  test('should return 500 on other non-API errors during thread creation', async () => {
    // Configure mock directly on the static instance for this test case
    OpenAI.mockInstance.beta.threads.create.mockRejectedValueOnce(new Error('Some other unexpected error'));

    const req = { method: 'POST', url: '/api/create_thread.js' };
    const res = mockResponse();

    await createThreadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal Server Error',
      details: 'Some other unexpected error',
    }));
    expect(res._getStatusCode()).toBe(500);
  });
});
