import { useEffect, useState, useRef } from "react";
import {
  type UserStatus,
  type StatusView,
  loadStatusViews,
  viewStatus,
} from "@/lib/statusService";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Props {
  status: UserStatus;
  currentUserId: string;
  onClose: () => void;
  onNext: () => void;
}

export function StatusViewer({ status, currentUserId, onClose, onNext }: Props) {
  const [views, setViews] = useState<StatusView[]>([]);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const duration = status.type === "text" ? 5000 : 30000;

  useEffect(() => {
    // تسجيل المشاهدة
    viewStatus(status.id, currentUserId);

    // تحميل المشاهدين
    loadStatusViews(status.id).then(setViews);

    // شريط التقدم
    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);

      if (pct >= 100) {
        onNext();
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status.id]);

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
        {/* شريط التقدم */}
        <div className="progress-container">
          <div
            className="progress-bar"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* رأس الصفحة */}
        <div className="viewer-header">
          <div className="user-info">
            <div className="user-avatar">
              {status.user_avatar ? (
                <img src={status.user_avatar} alt="" />
              ) : (
                <span>{status.user_name?.charAt(0)}</span>
              )}
            </div>
            <div>
              <div className="user-name">{status.user_name}</div>
              <div className="user-time">
                {formatDistanceToNow(new Date(status.created_at), {
                  addSuffix: true,
                  locale: ar,
                })}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="close-btn">
            ✕
          </button>
        </div>

        {/* محتوى الحالة */}
        <div className="viewer-body" onClick={onNext}>
          {status.type === "text" && (
            <div
              className="text-content"
              style={{ backgroundColor: status.background_color }}
            >
              <p>{status.content}</p>
            </div>
          )}
          {status.type === "image" && status.media_url && (
            <img
              src={status.media_url}
              alt="Status"
              className="media-content"
            />
          )}
          {status.type === "video" && status.media_url && (
            <video
              src={status.media_url}
              className="media-content"
              autoPlay
              muted
              playsInline
            />
          )}
        </div>

        {/* المشاهدين */}
        <div className="viewer-footer">
          <div className="views-count">
            👁 {views.length} مشاهدة
          </div>
        </div>
      </div>

      <style>{`
        .viewer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.97);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .viewer-content {
          width: 100%;
          max-width: 450px;
          height: 100vh;
          display: flex;
          flex-direction: column;
          color: white;
        }

        .progress-container {
          height: 3px;
          background: rgba(255, 255, 255, 0.3);
          flex-shrink: 0;
        }
        .progress-bar {
          height: 100%;
          background: white;
          transition: width 0.1s linear;
        }

        .viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          flex-shrink: 0;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .user-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #128C7E;
        }
        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .user-name {
          font-weight: 600;
          font-size: 16px;
        }
        .user-time {
          font-size: 12px;
          opacity: 0.7;
        }
        .close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 28px;
          cursor: pointer;
          padding: 8px;
        }

        .viewer-body {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .text-content {
          width: 90%;
          aspect-ratio: 1;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .text-content p {
          font-size: 22px;
          text-align: center;
          line-height: 1.6;
        }
        .media-content {
          max-width: 100%;
          max-height: 80vh;
          border-radius: 12px;
          object-fit: contain;
        }

        .viewer-footer {
          padding: 16px;
          flex-shrink: 0;
        }
        .views-count {
          font-size: 14px;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}