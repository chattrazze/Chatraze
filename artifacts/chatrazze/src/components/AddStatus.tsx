import { useState, useRef } from "react";
import { upsertStatus } from "@/lib/statusService";
import { supabase } from "@/lib/supabase";
import { Camera, Check, Image as ImageIcon, Loader2, Type } from "lucide-react";

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#533483",
  "#e94560", "#2d6a4f", "#6b705c", "#9b2226",
];

export function AddStatus({
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onClose,
  onSuccess,
}: Props) {
  const [type, setType] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("#1a1a2e");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (type === "text" && !text.trim()) return;
    if (type === "image" && !mediaFile) return;

    setUploading(true);
    setError(null);

    let mediaUrl: string | undefined;

    try {
      if (type === "image" && mediaFile) {
        const safeName = mediaFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileName = `status/${currentUserId}/${Date.now()}_${safeName}`;
        const { data, error: upErr } = await supabase.storage
          .from("chat-media")
          .upload(fileName, mediaFile, {
            cacheControl: "31536000",
            upsert: false,
            contentType: mediaFile.type || "image/jpeg",
          });

        if (upErr) throw upErr;
        if (data) {
          const { data: urlData } = supabase.storage
            .from("chat-media")
            .getPublicUrl(data.path);
          mediaUrl = urlData.publicUrl;
        }
      }

      const result = await upsertStatus({
        user_id: currentUserId,
        user_name: currentUserName,
        user_avatar: currentUserAvatar,
        type,
        content: type === "text" ? text : undefined,
        media_url: mediaUrl,
        background_color: bgColor,
      });

      if (!result) throw new Error("Failed to save status");
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="add-status-overlay" onClick={onClose}>
      <div className="add-status-modal" onClick={(e) => e.stopPropagation()}>
        <h3>إضافة حالة</h3>

        <div className="type-selector">
          <button
            className={type === "text" ? "active" : ""}
            onClick={() => setType("text")}
          >
            <Type className="w-4 h-4" />
            <span>نص</span>
          </button>
          <button
            className={type === "image" ? "active" : ""}
            onClick={() => setType("image")}
          >
            <ImageIcon className="w-4 h-4" />
            <span>صورة</span>
          </button>
        </div>

        {type === "text" && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ماذا تفكر؟"
              maxLength={200}
              rows={3}
              style={{ backgroundColor: bgColor, color: "white" }}
            />
            <div className="color-picker">
              {COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-dot ${bgColor === color ? "selected" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setBgColor(color)}
                />
              ))}
            </div>
          </>
        )}

        {type === "image" && (
          <div
            className="image-upload"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
            />
            {mediaFile ? (
              <img
                src={URL.createObjectURL(mediaFile)}
                alt="Preview"
                className="preview"
              />
            ) : (
              <div className="upload-placeholder">
                <Camera className="w-8 h-8" />
                <span>اختر صورة</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="error-msg" role="alert">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} className="cancel-btn" disabled={uploading}>
            إلغاء
          </button>
          <button
            onClick={handleSubmit}
            className="submit-btn"
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>إضافة</span>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .add-status-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .add-status-modal {
          background: hsl(220 30% 8%);
          color: hsl(0 0% 95%);
          border: 1px solid hsl(220 20% 18%);
          border-radius: 20px;
          padding: 24px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
        }
        .add-status-modal h3 {
          margin: 0 0 18px;
          text-align: center;
          font-size: 18px;
          font-weight: 700;
        }
        .type-selector {
          display: flex;
          gap: 8px;
          margin-bottom: 18px;
        }
        .type-selector button {
          flex: 1;
          padding: 10px;
          border: 1px solid hsl(220 20% 22%);
          border-radius: 10px;
          background: hsl(220 25% 14%);
          color: hsl(0 0% 85%);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 14px;
          transition: all 0.15s ease;
        }
        .type-selector button.active {
          background: linear-gradient(135deg, #FF7A1A, #FF4E00);
          color: white;
          border-color: transparent;
        }
        textarea {
          width: 100%;
          padding: 14px;
          border: 1px solid hsl(220 20% 22%);
          border-radius: 12px;
          resize: none;
          font-size: 16px;
          background: hsl(220 25% 14%);
          color: white;
          outline: none;
        }
        textarea:focus {
          border-color: #FF7A1A;
        }
        .color-picker {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .color-dot {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: transform 0.15s ease;
        }
        .color-dot:hover {
          transform: scale(1.1);
        }
        .color-dot.selected {
          border-color: white;
          box-shadow: 0 0 0 2px #FF7A1A;
        }
        .image-upload {
          width: 100%;
          height: 200px;
          border: 2px dashed hsl(220 20% 28%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          background: hsl(220 25% 12%);
        }
        .upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: hsl(0 0% 60%);
        }
        .preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .error-msg {
          margin-top: 12px;
          padding: 10px 12px;
          background: hsl(0 70% 20%);
          color: hsl(0 80% 85%);
          border-radius: 10px;
          font-size: 13px;
        }
        .modal-actions {
          display: flex;
          gap: 8px;
          margin-top: 18px;
        }
        .cancel-btn,
        .submit-btn {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .cancel-btn {
          background: hsl(220 25% 18%);
          color: hsl(0 0% 85%);
        }
        .submit-btn {
          background: linear-gradient(135deg, #FF7A1A, #FF4E00);
          color: white;
        }
        .submit-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .cancel-btn:disabled,
        .submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
