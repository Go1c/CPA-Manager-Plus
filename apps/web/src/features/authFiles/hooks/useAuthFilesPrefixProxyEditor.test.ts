import { describe, expect, it } from 'vitest';
import {
  buildStructuredProxyURL,
  parseStructuredProxy,
  type PrefixProxyEditorState,
} from './useAuthFilesPrefixProxyEditor';

const proxyEditor = (overrides: Partial<PrefixProxyEditorState>): PrefixProxyEditorState =>
  ({
    proxyUrl: '',
    proxyScheme: 'socks5',
    proxyHost: 'proxy.example.com',
    proxyPort: '443',
    proxyUsername: '',
    proxyPassword: '',
    proxyStructuredTouched: true,
    ...overrides,
  }) as PrefixProxyEditorState;

describe('structured auth proxy editor', () => {
  it('URL-encodes reserved username and password characters', () => {
    const proxyURL = buildStructuredProxyURL(
      proxyEditor({
        proxyUsername: 'user@:#%/',
        proxyPassword: 'pass@:#%/',
      })
    );

    expect(proxyURL).toBe('socks5://user%40%3A%23%25%2F:pass%40%3A%23%25%2F@proxy.example.com:443');
    expect(parseStructuredProxy(proxyURL)).toMatchObject({
      proxyHost: 'proxy.example.com',
      proxyPort: '443',
      proxyUsername: 'user@:#%/',
      proxyPassword: 'pass@:#%/',
    });
  });

  it('requires both host and port for structured proxy input', () => {
    expect(() => buildStructuredProxyURL(proxyEditor({ proxyPort: '' }))).toThrow(
      'Proxy host and port are required'
    );
  });
});
