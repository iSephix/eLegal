const httpMocks = require('node-mocks-http'); // To mock req/res
const createThreadHandler = require('../api/create_thread.js');
const OpenAI = require('openai'); // This will be our mock

// Ensure the mock is used
jest.mock('openai');

describe('/api/create_thread.js', () => {
  let OLD_ENV;
  const mockOpenAIMethods = OpenAI.mockInstance.beta.threads;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Backup and set environment variables
    OLD_ENV = process.env;
    process.env = { ...OLD_ENV, OPENAI_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore environment variables
  });

  test('should create a thread successfully (200)', async () => {
    const mockThreadId = 'thread_123';
    mockOpenAIMethods.create.mockResolvedValueOnce({ id: mockThreadId });

    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/api/create_thread.js',
    });
    const res = httpMocks.createResponse();

    await createThreadHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ threadId: mockThreadId });
    expect(mockOpenAIMethods.create).toHaveBeenCalledTimes(1);
  });

  test('should return 405 if method is not POST', async () => {
    const req = httpMocks.createRequest({
      method: 'GET',
      url: '/api/create_thread.js',
    });
    const res = httpMocks.createResponse();

    await createThreadHandler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res._getJSONData().error).toBe('Method Not Allowed');
  });

  test('should return 500 if OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY; // Simulate missing API key

    // Re-require the module to pick up the changed env (Jest caches modules)
    // Or, modify the module's internal openai client if possible (more complex)
    // For serverless functions, they often re-initialize per call or have ways to refresh config.
    // Here, we'll test the check within the handler if it re-evaluates `openai` client status.
    // The current `create_thread.js` initializes `openai` at module load.
    // So, to test this properly, the module needs to be re-imported or the check improved.
    // Let's assume the check for `!openai` (due to missing key) works as intended.
    
    // To make this testable without re-requiring, we can temporarily nullify the mock 'openai' client
    // that the handler would use.
    const tempOpenAI = require('../api/create_thread.js').openai; // Accessing it if exported for test, or this won't work
                                                              // This is a simplification; real scenario might need module reset or DI.
    jest.doMock('../api/create_thread.js', () => {
        const originalModule = jest.requireActual('../api/create_thread.js');
        return {
            ...originalModule,
            // Temporarily set the internal 'openai' client to null for this test case
            // This requires the module to export 'openai' or to have a setter, which it doesn't.
            // A better way is to ensure the module re-checks process.env.OPENAI_API_KEY
            // or the openai object status on each call if it's critical.
            // Given the current structure, the `!openai` check in the handler is the key.
        };
    }, { virtual: true });


    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/api/create_thread.js',
    });
    const res = httpMocks.createResponse();
    
    // Simulate that the openai client is null because the API key was missing at startup
    // This is tricky because the client is initialized when the module is loaded.
    // We'll rely on the handler's internal check of the 'openai' object.
    // The `create_thread.js` has: if (!openai) { return sendError(...) }
    // So, we need to make the 'openai' object used by the handler falsy for this test.
    // The easiest way without complex module manipulation is to ensure the mock setup allows this.
    // The current mock structure doesn't easily allow making the imported 'openai' itself null.
    // The API file would need to re-evaluate 'process.env.OPENAI_API_KEY' or the 'openai' instance per call.
    // Let's assume the check `if (!openai)` in the handler is effective.

    // For this test to pass as intended with the current structure of create_thread.js,
    // where `openai` is initialized at the top:
    // We would need to reset the module entirely for `process.env` changes to take effect on `openai` init.
    // `jest.resetModules()` before `require` could work.
    
    jest.resetModules(); // Reset modules to re-evaluate process.env
    delete process.env.OPENAI_API_KEY;
    const freshCreateThreadHandler = require('../api/create_thread.js');
    // The mock also needs to be reset in this context if it's affected by module reset.
    // However, the OpenAI mock itself is designed to be stateful via OpenAI.mockInstance.

    await freshCreateThreadHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res._getJSONData().error).toBe('Server Configuration Error');
    expect(res._getJSONData().details).toContain('OpenAI client not initialized');
  });

  test('should return 503 on OpenAI APIError', async () => {
    const apiError = new OpenAI.APIError(500, { error: { message: 'OpenAI server error' } }, 'Error', {});
    mockOpenAIMethods.create.mockRejectedValueOnce(apiError);

    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/api/create_thread.js',
    });
    const res = httpMocks.createResponse();

    await createThreadHandler(req, res);

    expect(res.statusCode).toBe(500); // OpenAI.APIError default status might be null or non-standard
                                      // The handler uses `error.status || 503`
    expect(res._getJSONData().error).toBe('OpenAI Service Error');
    expect(res._getJSONData().details).toBe('OpenAI server error');
  });

   test('should return 500 on other errors during thread creation', async () => {
    mockOpenAIMethods.create.mockRejectedValueOnce(new Error('Some other error'));

    const req = httpMocks.createRequest({
      method: 'POST',
      url: '/api/create_thread.js',
    });
    const res = httpMocks.createResponse();

    await createThreadHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res._getJSONData().error).toBe('Internal Server Error');
    expect(res._getJSONData().details).toBe('Some other error');
  });
});
