const mockOpenAI = {
  beta: {
    threads: {
      create: jest.fn(),
      messages: {
        create: jest.fn(),
        list: jest.fn(),
      },
      runs: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
  },
};

const OpenAI = jest.fn(() => mockOpenAI);
OpenAI.mockInstance = mockOpenAI;

// Mock the APIError class - simplified
OpenAI.APIError = class MockAPIError extends Error {
  constructor(status, errorBody, name, headers) { // errorBody is like { message: 'details' }
    super(errorBody?.message || name || 'Mock API Error'); // Sets this.message
    this.status = status;
    this.error = errorBody; // Contains the raw error body, e.g., { message: 'details' }
    this.name = name || 'APIError';
    this.headers = headers;
  }
};

module.exports = OpenAI;
