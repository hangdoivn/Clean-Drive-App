import { Cloud, LockKeyhole, ShieldCheck } from 'lucide-react';

type Props = {
  isConnecting: boolean;
  error?: string;
  onConnect: () => void;
};

export function DriveConnectState({ isConnecting, error, onConnect }: Props) {
  return (
    <section className="drive-connect-state">
      <span className="drive-connect-state__icon"><Cloud size={28} /></span>
      <p className="eyebrow">Google Drive</p>
      <h2>Kết nối Drive để bắt đầu.</h2>
      <p>
        Clean không hiển thị dữ liệu mẫu. Dashboard, file, project và dung lượng chỉ xuất hiện
        sau khi nhận metadata thật từ tài khoản Google Drive của bạn.
      </p>

      {error ? <div className="drive-connect-state__error">{error}</div> : null}

      <button type="button" className="connect-button drive-connect-state__button" onClick={onConnect} disabled={isConnecting}>
        <Cloud size={17} />
        {isConnecting ? 'Đang kết nối…' : 'Kết nối Google Drive'}
      </button>

      <div className="drive-connect-state__trust">
        <span><ShieldCheck size={15} /> Chỉ đọc metadata cần thiết</span>
        <span><LockKeyhole size={15} /> Không hiển thị dữ liệu giả trước khi đăng nhập</span>
      </div>
    </section>
  );
}
