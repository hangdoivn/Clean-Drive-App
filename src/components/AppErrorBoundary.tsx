import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error?: Error };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Clean Drive runtime error', error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error" role="alert">
        <span className="fatal-error__icon"><AlertTriangle size={24} /></span>
        <p className="eyebrow">Clean Drive</p>
        <h1>Ứng dụng gặp lỗi hiển thị.</h1>
        <p>
          Google Drive không bị thay đổi bởi lỗi giao diện này. Tải lại trang để khôi phục metadata cache
          và tiếp tục.
        </p>
        <button type="button" onClick={this.reload}>
          <RefreshCw size={16} /> Tải lại ứng dụng
        </button>
        <details>
          <summary>Chi tiết kỹ thuật</summary>
          <code>{this.state.error.message}</code>
        </details>
      </main>
    );
  }
}
