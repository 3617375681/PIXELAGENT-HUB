import { ActionExecutionResult, IntelligenceAction } from './intelTypes.js';
import { ActionProvider } from './actionAdapter.js';

export class MockActionProvider implements ActionProvider {
  name = 'mock';

  async execute(action: IntelligenceAction): Promise<ActionExecutionResult> {
    const simulatedFailure = String(action.params?.simulateFailure || '') === 'true';
    if (simulatedFailure) {
      return {
        actionId: action.id,
        type: action.type,
        status: 'failed',
        retryable: true,
        message: `mock failure for ${action.type}`,
      };
    }
    return {
      actionId: action.id,
      type: action.type,
      status: 'success',
      retryable: false,
      message: `mock executed ${action.type} -> ${action.target}`,
      providerRef: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

