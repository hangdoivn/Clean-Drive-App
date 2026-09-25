import { AppWindow, ArrowUpRight, HardDrive, Megaphone, CalendarDays, BriefcaseBusiness } from 'lucide-react';
import { CleanDriveApp } from './CleanDriveApp';

type HubApp = {
  name: string;
  description: string;
  path: string;
  status: 'ready' | 'soon';
  icon: typeof AppWindow;
};

const apps: HubApp[] = [
  {
    name: 'Clean Drive',
    description: 'Quét dung lượng, tìm file lớn, file trùng và dọn Google Drive có kiểm soát.',
    path: '/clean-drive',
    status: 'ready',
    icon: HardDrive,
  },
  {
    name: 'Media Flow',
    description: 'Lịch media, ca làm, check-in/out và vận hành đội production.',
    path: '#',
    status: 'soon',
    icon: CalendarDays,
  },
  {
    name: 'Marcom',
    description: 'Kế hoạch, nội dung, kênh và hiệu suất marketing trong một workspace.',
    path: '#',
    status: 'soon',
    icon: Megaphone,
  },
  {
    name: 'Business',
    description: 'Pipeline, báo giá và hiệu suất kinh doanh của Hang Đôi.',
    path: '#',
    status: 'soon',
    icon: BriefcaseBusiness,
  },
];

function AppHub() {
  return (
    <main className="hub-shell">
      <section className="hub-hero">
        <div className="hub-brand">
          <span className="hub-brand__mark"><AppWindow size={20} /></span>
          <span>Hang Đôi Apps</span>
        </div>
        <div className="hub-hero__copy">
          <p className="eyebrow">Workspace nội bộ</p>
          <h1>Mọi công cụ của Hang Đôi,<br />ở cùng một nơi.</h1>
          <p>Truy cập nhanh các ứng dụng vận hành, production, marketing và business.</p>
        </div>
      </section>

      <section className="hub-apps" aria-label="Danh sách ứng dụng">
        {apps.map((app) => {
          const Icon = app.icon;
          const ready = app.status === 'ready';
          const body = (
            <>
              <div className="hub-card__top">
                <span className="hub-card__icon"><Icon size={22} /></span>
                <span className={ready ? 'hub-status is-ready' : 'hub-status'}>{ready ? 'Sẵn sàng' : 'Sắp có'}</span>
              </div>
              <div>
                <h2>{app.name}</h2>
                <p>{app.description}</p>
              </div>
              <span className="hub-card__action">{ready ? 'Mở ứng dụng' : 'Đang phát triển'} {ready ? <ArrowUpRight size={16} /> : null}</span>
            </>
          );
          return ready ? (
            <a className="hub-card" href={app.path} key={app.name}>{body}</a>
          ) : (
            <article className="hub-card is-disabled" key={app.name}>{body}</article>
          );
        })}
      </section>

      <footer className="hub-footer">Hang Đôi Production · Internal Apps</footer>
    </main>
  );
}

function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/clean-drive') return <CleanDriveApp />;
  return <AppHub />;
}

export default App;
