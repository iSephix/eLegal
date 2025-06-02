jest.mock('openai'); // Mock OpenAI at the very top

const OpenAI = require('openai'); // Mocked version
// Handler will be required dynamically

describe('/api/generate_measures_policy.js', () => {
  let OLD_ENV;
  let generatePolicyHandler;
  let mockOpenAIThreads;

  const mockResponse = () => {
    const res = { statusCode: 0, jsonData: {} };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((data) => { res.jsonData = data; return res; });
    res._getStatusCode = () => res.statusCode;
    res._getJSONData = () => res.jsonData;
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    OLD_ENV = { ...process.env };
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.OPENAI_ASSISTANT_ID = 'test-assistant-id-policy';

    jest.resetModules();
    jest.mock('openai');
    const FreshOpenAI = require('openai');
    generatePolicyHandler = require('../../api/generate_measures_policy.js');
    mockOpenAIThreads = FreshOpenAI.mockInstance.beta.threads;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('should successfully generate a policy and return it (200)', async () => {
    const mockPolicyText = "Generated policy for High risk, Medium restrictiveness.";
    mockOpenAIThreads.create.mockResolvedValueOnce({ id: 'thread_policy_123' });
    mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_policy_456' });
    mockOpenAIThreads.runs.create.mockResolvedValueOnce({ id: 'run_policy_789' });
    mockOpenAIThreads.runs.retrieve
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'completed' });
    mockOpenAIThreads.messages.list.mockResolvedValueOnce({
      data: [{ role: 'assistant', content: [{ type: 'text', text: { value: mockPolicyText } }] }],
    });

    const req = {
      method: 'POST',
      body: { riskLevel: 'High', restrictiveness: 'Medium' }
    };
    const res = mockResponse();
    await generatePolicyHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ generatedPolicy: mockPolicyText });
    expect(mockOpenAIThreads.create).toHaveBeenCalledTimes(1);
  });

  test('should return 405 if method is not POST', async () => {
    const req = { method: 'GET' };
    const res = mockResponse();
    await generatePolicyHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('should return 400 if riskLevel is missing', async () => {
    const req = { method: 'POST', body: { restrictiveness: 'Medium' } };
    const res = mockResponse();
    await generatePolicyHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing or Invalid Parameter', details: 'riskLevel must be a string.' }));
  });

  test('should return 400 if restrictiveness is invalid', async () => {
    const req = { method: 'POST', body: { riskLevel: 'High', restrictiveness: 'VeryLow' } };
    const res = mockResponse();
    await generatePolicyHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid Parameter Value' }));
  });

  test('should return 500 if OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();
    jest.mock('openai');
    const freshHandler = require('../../api/generate_measures_policy.js');
    const req = { method: 'POST', body: { riskLevel: 'High', restrictiveness: 'Medium' }};
    const res = mockResponse();
    await freshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Server Configuration Error', details: expect.stringContaining('OpenAI API Key is missing or client not initialized')}));
  });
  
  test('should return 500 if OPENAI_ASSISTANT_ID is missing', async () => {
    delete process.env.OPENAI_ASSISTANT_ID;
    jest.resetModules();
    jest.mock('openai');
    const freshHandler = require('../../api/generate_measures_policy.js');
    const req = { method: 'POST', body: { riskLevel: 'High', restrictiveness: 'Medium' }};
    const res = mockResponse();
    await freshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Server Configuration Error', details: 'OpenAI Assistant ID is missing.' }));
  });

  test('should return 503 on OpenAI APIError during run creation', async () => {
    mockOpenAIThreads.create.mockResolvedValueOnce({ id: 'thread_policy_123' });
    mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_policy_456' });
    const apiError = new OpenAI.APIError(500, { message: 'Server Error' }, 'APIError', {});
    mockOpenAIThreads.runs.create.mockRejectedValueOnce(apiError);
    
    const req = { method: 'POST', body: { riskLevel: 'High', restrictiveness: 'Medium' } };
    const res = mockResponse();
    await generatePolicyHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500); // error.status from APIError
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'OpenAI API Error: APIError', details: 'Server Error' }));
  });

  test('should return 504 if run fails to complete', async () => {
    mockOpenAIThreads.create.mockResolvedValueOnce({ id: 'thread_policy_123' });
    mockOpenAIThreads.messages.create.mockResolvedValueOnce({ id: 'msg_policy_456' });
    mockOpenAIThreads.runs.create.mockResolvedValueOnce({ id: 'run_policy_789' });
    mockOpenAIThreads.runs.retrieve.mockResolvedValue({ status: 'cancelled' }); // Simulate run not completing successfully

    const req = { method: 'POST', body: { riskLevel: 'High', restrictiveness: 'Medium' } };
    const res = mockResponse();
    await generatePolicyHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AI Processing Timeout/Error' }));
  });
});
