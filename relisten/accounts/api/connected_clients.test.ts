import { describe, expect, it } from 'vitest';
import { parseConnectedClients } from './connected_clients';

describe('connected clients', () => {
  it('keeps known clients and drops entries this app does not understand', () => {
    expect(
      parseConnectedClients({
        clients: [
          { id: 'chatgpt', name: 'ChatGPT', state: 'connected' },
          { id: 'future', name: 'Future', state: 'paused' },
        ],
      })
    ).toEqual([{ id: 'chatgpt', name: 'ChatGPT', state: 'connected' }]);
    expect(parseConnectedClients({ clients: [] })).toEqual([]);
  });

  it('refuses a response without a client list', () => {
    expect(() => parseConnectedClients({})).toThrow('invalid');
  });
});
