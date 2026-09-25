import { CheckCircle2, ExternalLink, RefreshCw, Unplug } from 'lucide-react';

type Props = {
  state: 'idle' | 'loading' | 'connected' | 'error';
  email?: string;
  projectCount: number;
  linkedCount: number;
  error?: string;
  onRefresh: () => void;
};

export function CoreIntegrationPanel({
  state,
  email,
  projectCount,
  linkedCount,
  error,
  onRefresh,
}: Props) {
  const connected = state === 'connected';

  return (
    <section className={`core-integration${connected ? ' is-connected' : ''}`}>
      <div className="core-integration__main">
        <span className="core-integration__icon">
          {connected ? <CheckCircle2 size={19} /> : <Unplug size={19} />}
        </span>
        <div>
          <strong>{connected ? 'Đã nối Hang Đôi Project Core' : 'Hang Đôi Project Core'}</strong>
          <span>
            {connected
              ? `${email || 'Tài khoản nội bộ'} · ${projectCount} project · ${linkedCount} folder đã liên kết`
              : error || 'Clean dùng SSO chung của *.hangdoistudio.vn để lấy project canonical.'}
          </span>
        </div>
      </div>

      <div className="core-integration__actions">
        {!connected ? (
          <a href="https://acc.hangdoistudio.vn" target="_blank" rel="noreferrer">
            Đăng nhập OS <ExternalLink size={13} />
          </a>
        ) : null}
        <button type="button" onClick={onRefresh} disabled={state === 'loading'}>
          <RefreshCw className={state === 'loading' ? 'spin' : ''} size={14} />
          {state === 'loading' ? 'Đang đồng bộ…' : connected ? 'Làm mới Project Core' : 'Kiểm tra lại'}
        </button>
      </div>
    </section>
  );
}
