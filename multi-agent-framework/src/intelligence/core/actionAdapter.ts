import { ActionExecutionResult, IntelligenceAction } from './intelTypes.js';

export interface ActionAdapter {
  execute(action: IntelligenceAction): Promise<ActionExecutionResult>;
}

export interface ActionProvider {
  name: string;
  execute(action: IntelligenceAction): Promise<ActionExecutionResult>;
}

export class ActionProviderRegistry {
  private readonly providers = new Map<string, ActionProvider>();
  private defaultProvider: string | null = null;

  register(provider: ActionProvider, asDefault: boolean = false): void {
    this.providers.set(provider.name, provider);
    if (asDefault || !this.defaultProvider) this.defaultProvider = provider.name;
  }

  get(name?: string): ActionProvider {
    const key = name || this.defaultProvider;
    if (!key) throw new Error('NO_ACTION_PROVIDER_REGISTERED');
    const provider = this.providers.get(key);
    if (!provider) throw new Error(`ACTION_PROVIDER_NOT_FOUND_${key}`);
    return provider;
  }
}

