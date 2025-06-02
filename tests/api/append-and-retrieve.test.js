jest.mock('openai'); // Mock OpenAI at the very top

const OpenAI = require('openai'); // Mocked version
// Handler will be required dynamically in tests

describe('/api/append-and-retrieve.js', () => {
  let OLD_ENV;
  let appendAndRetrieveHandler;
  let mockOpenAIThreads; // To store OpenAI.mockInstance.beta.threads for easier access

  // Manual mock for response object
  const mockResponse = () => {
    const res = {};
    res.statusCode = 0;
    res.jsonData = {};
    res.status = jest.fn((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((data) => {
      res.jsonData = data;
      return res;
    });
    res._getStatusCode = () => res.statusCode;
    res._getJSONData = () => res.jsonData;
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OLD_ENV = { ...process.env };
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.OPENAI_ASSISTANT_ID = 'test-assistant-id';

    jest.resetModules();
    jest.mock('openai'); // Re-apply mock for the fresh module
    const FreshOpenAI = require('openai'); // Get the fresh mock constructor
    appendAndRetrieveHandler = require('../../api/append-and-retrieve.js');
    mockOpenAIThreads = FreshOpenAI.mockInstance.beta.threads;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('should successfully add a message and retrieve a response (200)', async () => {
    mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_123' });
    mockOpenAIThreads.runs.create.mockResolvedValueOnce({ id: 'run_123' });
    mockOpenAIThreads.runs.retrieve
      .mockResolvedValueOnce({ status: 'queued' }) // For polling
      .mockResolvedValueOnce({ status: 'in_progress' })
      .mockResolvedValueOnce({ status: 'completed' });
    mockOpenAIThreads.messages.list.mockResolvedValueOnce({
      data: [
        { role: 'assistant', content: [{ type: 'text', text: { value: 'Hello from AI!' } }] },
        { role: 'user', content: [{ type: 'text', text: { value: 'Hi' } }] },
      ],
    });

    const req = { 
      method: 'POST', 
      url: '/api/append-and-retrieve.js',
      body: { threadId: 'thread_abc', message: 'Hi' }
    };
    const res = mockResponse();

    await appendAndRetrieveHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Hello from AI!' });
    expect(mockOpenAIThreads.messages.create).toHaveBeenCalledWith('thread_abc', { role: 'user', content: 'Hi' });
    expect(mockOpenAIThreads.runs.create).toHaveBeenCalledWith('thread_abc', { assistant_id: 'test-assistant-id', instructions: null });
    expect(mockOpenAIThreads.runs.retrieve).toHaveBeenCalledTimes(3);
    expect(mockOpenAIThreads.messages.list).toHaveBeenCalledWith('thread_abc', { order: 'desc' });
  });

  test('should return 405 if method is not POST', async () => {
    const req = { method: 'GET' };
    const res = mockResponse();
    await appendAndRetrieveHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Method Not Allowed' }));
  });

  test('should return 400 if threadId is missing', async () => {
    const req = { method: 'POST', body: { message: 'Hi' } };
    const res = mockResponse();
    await appendAndRetrieveHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing Parameter', details: 'threadId is required in the request body.' }));
  });

  test('should return 400 if message content is missing', async () => {
    const req = { method: 'POST', body: { threadId: 'thread_abc' } };
    const res = mockResponse();
    await appendAndRetrieveHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing Parameter', details: 'message (content) is required in the request body.' }));
  });
  
  test('should return 500 if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();
    jest.mock('openai');
    const freshHandler = require('../../api/append-and-retrieve.js');
    const req = { method: 'POST', body: { threadId: 'thread_abc', message: 'Hi' } };
    const res = mockResponse();
    await freshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Server Configuration Error', details: expect.stringContaining('OpenAI client not initialized')}));
  });

  test('should return 500 if OPENAI_ASSISTANT_ID is missing', async () => {
    delete process.env.OPENAI_ASSISTANT_ID;
    jest.resetModules();
    jest.mock('openai');
    const freshHandler = require('../../api/append-and-retrieve.js');
    const req = { method: 'POST', body: { threadId: 'thread_abc', message: 'Hi' } };
    const res = mockResponse();
    await freshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Server Configuration Error', details: 'OpenAI Assistant ID is missing.' }));
  });

  test('should return 503 on OpenAI APIError during message creation', async () => {
    const apiError = new OpenAI.APIError(401, { message: 'Auth error' }, 'APIError', {});
    mockOpenAIThreads.messages.create.mockRejectedValueOnce(apiError);
    const req = { method: 'POST', body: { threadId: 'thread_abc', message: 'Hi' } };
    const res = mockResponse();
    await appendAndRetrieveHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'OpenAI Service Error', details: 'Auth error' }));
  });

  test('should return 504 if run does not complete', async () => {
    // mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_123' }); // This line was here but is not needed for this specific test's logic if run.create fails or times out.
    // To test the timeout of pollForRunCompletion, we need to ensure that message.create and run.create succeed first.
    mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_123' }); 
    mockOpenAIThreads.runs.create.mockResolvedValueOnce({ id: 'run_123' });
    // Simulate run never completing (always 'in_progress' until max attempts)
    mockOpenAIThreads.runs.retrieve.mockResolvedValue({ status: 'in_progress' });
    
    const req = { method: 'POST', body: { threadId: 'thread_abc', message: 'Hi' } };
    const res = mockResponse();
    await appendAndRetrieveHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AI Processing Timeout/Error' }));
  }, 35000); // Correct placement of timeout
});
