import { act, type ReactNode } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/Button';
import type { PrefixProxyEditorState } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { AuthFilesPrefixProxyEditorModal } from './AuthFilesPrefixProxyEditorModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/ui/Modal', () => ({
  Modal: (props: { children: ReactNode; footer?: ReactNode }) => (
    <div>
      <div>{props.children}</div>
      <div>{props.footer}</div>
    </div>
  ),
}));

const createEditor = (overrides: Partial<PrefixProxyEditorState> = {}): PrefixProxyEditorState => ({
  fileName: 'codex-example.json',
  fileInfoText: '{}',
  loading: false,
  saving: false,
  testingProxy: false,
  error: null,
  originalText: '{}',
  rawText: '{}',
  invalidContentPreview: '',
  json: { type: 'codex' },
  providerKey: 'codex',
  prefix: '',
  proxyUrl: 'socks5://proxy.example.com:443',
  proxyScheme: 'socks5',
  proxyHost: 'proxy.example.com',
  proxyPort: '443',
  proxyUsername: '',
  proxyPassword: '',
  proxyStructuredTouched: false,
  proxyTestResult: null,
  priority: '',
  websockets: false,
  websocketsTouched: false,
  note: '',
  noteTouched: false,
  headersText: '',
  headersTouched: false,
  headersError: null,
  ...overrides,
});

const renderModal = (
  editor: PrefixProxyEditorState,
  onTestProxy: () => void
): ReactTestRenderer => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AuthFilesPrefixProxyEditorModal
        disableControls={false}
        editor={editor}
        updatedText="{}"
        dirty={false}
        onClose={() => {}}
        onCopyText={() => {}}
        onTestProxy={onTestProxy}
        onSave={() => {}}
        onChange={() => {}}
      />
    );
  });
  return renderer;
};

describe('AuthFilesPrefixProxyEditorModal proxy test button', () => {
  it('shows the button for Codex and invokes the explicit proxy test', () => {
    const onTestProxy = vi.fn();
    const renderer = renderModal(createEditor(), onTestProxy);
    const button = renderer.root
      .findAllByType(Button)
      .find((node) => node.props.children === 'auth_files.proxy_test_button');

    expect(button).toBeDefined();
    act(() => {
      button?.props.onClick();
    });
    expect(onTestProxy).toHaveBeenCalledTimes(1);
    renderer.unmount();
  });

  it('hides the button for non-Codex auth files', () => {
    const renderer = renderModal(
      createEditor({ providerKey: 'claude', json: { type: 'claude' } }),
      vi.fn()
    );
    const button = renderer.root
      .findAllByType(Button)
      .find((node) => node.props.children === 'auth_files.proxy_test_button');

    expect(button).toBeUndefined();
    renderer.unmount();
  });

  it('disables duplicate tests while a test is running', () => {
    const renderer = renderModal(createEditor({ testingProxy: true }), vi.fn());
    const button = renderer.root
      .findAllByType(Button)
      .find((node) => node.props.children === 'auth_files.proxy_test_button');

    expect(button?.props.loading).toBe(true);
    expect(button?.props.disabled).toBe(true);
    renderer.unmount();
  });
});
