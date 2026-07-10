import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { supportsAuthFileWebsockets } from '@/features/authFiles/constants';
import styles from '@/features/authFiles/AuthFilesPage.module.scss';

export type AuthFilesPrefixProxyEditorModalProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  updatedText: string;
  dirty: boolean;
  onClose: () => void;
  onCopyText: (text: string) => void | Promise<void>;
  onTestProxy: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

export function AuthFilesPrefixProxyEditorModal(props: AuthFilesPrefixProxyEditorModalProps) {
  const { t } = useTranslation();
  const {
    disableControls,
    editor,
    updatedText,
    dirty,
    onClose,
    onCopyText,
    onTestProxy,
    onSave,
    onChange,
  } = props;
  const formatJsonText = (text: string) => {
    if (!text) return '';
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  };
  const previewText = formatJsonText(updatedText);
  const invalidContentPreview = editor?.invalidContentPreview ?? '';

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      width={720}
      title={
        editor?.fileName
          ? t('auth_files.auth_field_editor_title', { name: editor.fileName })
          : t('auth_files.prefix_proxy_button')
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!updatedText) return;
              void onCopyText(updatedText);
            }}
            disabled={editor?.saving === true || !updatedText}
          >
            {t('common.copy')}
          </Button>
          {editor?.providerKey === 'codex' && (
            <Button
              variant="secondary"
              onClick={onTestProxy}
              loading={editor.testingProxy}
              disabled={
                disableControls ||
                editor.loading ||
                editor.saving ||
                editor.testingProxy ||
                !editor.json
              }
            >
              {t('auth_files.proxy_test_button')}
            </Button>
          )}
          <Button
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={
              disableControls ||
              editor?.saving === true ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError)
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {editor && (
        <div className={styles.prefixProxyEditor}>
          {editor.loading ? (
            <div className={styles.prefixProxyLoading}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.prefixProxyError}>{editor.error}</div>}
              {editor.testingProxy && (
                <div className={styles.proxyTestStatus}>
                  <LoadingSpinner size={14} />
                  <span>{t('auth_files.proxy_testing')}</span>
                </div>
              )}
              {editor.proxyTestResult && (
                <div
                  className={`${styles.proxyTestResult} ${
                    editor.proxyTestResult.ok ? styles.proxyTestSuccess : styles.proxyTestFailure
                  }`}
                >
                  <strong>
                    {editor.proxyTestResult.ok
                      ? t('auth_files.proxy_test_success')
                      : t('auth_files.proxy_test_failed')}
                  </strong>
                  <span>{editor.proxyTestResult.code}</span>
                  {editor.proxyTestResult.stage && (
                    <span>
                      {t('auth_files.proxy_test_stage')}: {editor.proxyTestResult.stage}
                    </span>
                  )}
                  {editor.proxyTestResult.cloudflare_pop && (
                    <span>
                      {t('auth_files.proxy_test_pop')}: {editor.proxyTestResult.cloudflare_pop}
                    </span>
                  )}
                  {editor.proxyTestResult.timings_ms?.proxy_connect !== undefined && (
                    <span>
                      {t('auth_files.proxy_test_proxy_connect')}:{' '}
                      {editor.proxyTestResult.timings_ms.proxy_connect} ms
                    </span>
                  )}
                  {editor.proxyTestResult.timings_ms?.tls_handshake !== undefined && (
                    <span>
                      {t('auth_files.proxy_test_tls_handshake')}:{' '}
                      {editor.proxyTestResult.timings_ms.tls_handshake} ms
                    </span>
                  )}
                  {editor.proxyTestResult.timings_ms?.first_byte !== undefined && (
                    <span>
                      {t('auth_files.proxy_test_first_byte')}:{' '}
                      {editor.proxyTestResult.timings_ms.first_byte} ms
                    </span>
                  )}
                  {editor.proxyTestResult.timings_ms?.total !== undefined && (
                    <span>
                      {t('auth_files.proxy_test_total')}: {editor.proxyTestResult.timings_ms.total}{' '}
                      ms
                    </span>
                  )}
                  {editor.proxyTestResult.message && <span>{editor.proxyTestResult.message}</span>}
                </div>
              )}
              <div className={styles.prefixProxyJsonWrapper}>
                <label className={styles.prefixProxyLabel}>
                  {t('auth_files.prefix_proxy_info_label')}
                </label>
                <textarea
                  className={styles.prefixProxyTextarea}
                  rows={8}
                  readOnly
                  value={editor.fileInfoText}
                />
              </div>
              <div className={styles.prefixProxyJsonWrapper}>
                <label className={styles.prefixProxyLabel}>
                  {editor.json
                    ? t('auth_files.prefix_proxy_source_label')
                    : t('auth_files.prefix_proxy_invalid_content_label')}
                </label>
                {editor.json ? (
                  <textarea
                    className={styles.prefixProxyTextarea}
                    rows={10}
                    readOnly
                    value={previewText}
                  />
                ) : (
                  <pre className={styles.prefixProxyInvalidContentPreview}>
                    {invalidContentPreview}
                  </pre>
                )}
              </div>
              {editor.json && (
                <div className={styles.prefixProxyFields}>
                  <Input
                    label={t('auth_files.prefix_label')}
                    value={editor.prefix}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('prefix', e.target.value)}
                  />
                  {editor.providerKey === 'codex' && (
                    <div className={styles.proxyStructuredFields}>
                      <div className="form-group">
                        <label>{t('auth_files.proxy_scheme_label')}</label>
                        <select
                          className="input"
                          value={editor.proxyScheme}
                          disabled={disableControls || editor.saving || !editor.json}
                          onChange={(e) => onChange('proxyScheme', e.target.value)}
                        >
                          <option value="socks5">socks5</option>
                          <option value="socks5h">socks5h</option>
                          <option value="http">http</option>
                          <option value="https">https</option>
                        </select>
                      </div>
                      <Input
                        label={t('auth_files.proxy_host_label')}
                        value={editor.proxyHost}
                        disabled={disableControls || editor.saving || !editor.json}
                        onChange={(e) => onChange('proxyHost', e.target.value)}
                      />
                      <Input
                        label={t('auth_files.proxy_port_label')}
                        value={editor.proxyPort}
                        inputMode="numeric"
                        disabled={disableControls || editor.saving || !editor.json}
                        onChange={(e) => onChange('proxyPort', e.target.value)}
                      />
                      <Input
                        label={t('auth_files.proxy_username_label')}
                        value={editor.proxyUsername}
                        autoComplete="off"
                        disabled={disableControls || editor.saving || !editor.json}
                        onChange={(e) => onChange('proxyUsername', e.target.value)}
                      />
                      <Input
                        label={t('auth_files.proxy_password_label')}
                        type="password"
                        value={editor.proxyPassword}
                        autoComplete="new-password"
                        disabled={disableControls || editor.saving || !editor.json}
                        onChange={(e) => onChange('proxyPassword', e.target.value)}
                      />
                    </div>
                  )}
                  <Input
                    label={
                      editor.providerKey === 'codex'
                        ? t('auth_files.proxy_url_advanced_label')
                        : t('auth_files.proxy_url_label')
                    }
                    value={editor.proxyUrl}
                    placeholder={t('auth_files.proxy_url_placeholder')}
                    hint={
                      editor.providerKey === 'codex'
                        ? t('auth_files.proxy_structured_hint')
                        : undefined
                    }
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('proxyUrl', e.target.value)}
                  />
                  <Input
                    label={t('auth_files.priority_label')}
                    value={editor.priority}
                    placeholder={t('auth_files.priority_placeholder')}
                    hint={t('auth_files.priority_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('priority', e.target.value)}
                  />
                  {supportsAuthFileWebsockets(editor.providerKey) && (
                    <div className="form-group">
                      <label>{t('auth_files.websockets_label')}</label>
                      <ToggleSwitch
                        checked={Boolean(editor.websockets)}
                        onChange={(value) => onChange('websockets', value)}
                        disabled={disableControls || editor.saving || !editor.json}
                        ariaLabel={t('auth_files.websockets_label')}
                      />
                      <div className="hint">{t('auth_files.websockets_hint')}</div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>{t('auth_files.headers_label')}</label>
                    <textarea
                      className={`input ${editor.headersError ? styles.prefixProxyTextareaInvalid : ''}`}
                      value={editor.headersText}
                      placeholder={t('auth_files.headers_placeholder')}
                      rows={4}
                      aria-invalid={Boolean(editor.headersError)}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('headersText', e.target.value)}
                    />
                    {editor.headersError && <div className="error-box">{editor.headersError}</div>}
                    <div className="hint">{t('auth_files.headers_hint')}</div>
                  </div>
                  <Input
                    label={t('auth_files.note_label')}
                    value={editor.note}
                    placeholder={t('auth_files.note_placeholder')}
                    hint={t('auth_files.note_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('note', e.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
