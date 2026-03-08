import { X, Check, RefreshCw, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { type UploadProgress, formatFileSize, formatSpeed } from "@/hooks/useChunkedUpload";

interface UploadProgressBarProps {
  upload: UploadProgress;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function UploadProgressBar({ upload, onCancel, onRetry, onDismiss }: UploadProgressBarProps) {
  const { fileName, fileSize, loaded, percent, speed, status, error } = upload;

  return (
    <div className="flex flex-col gap-1 p-2 rounded-md bg-muted/50 border border-border text-xs">
      <div className="flex items-center gap-2">
        {status === "done" && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
        {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
        <span className="truncate flex-1 font-medium text-foreground">
          {fileName}
          <span className="text-muted-foreground font-normal ml-1">({formatFileSize(fileSize)})</span>
        </span>
        {status === "uploading" && onCancel && (
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Zrušit">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {status === "done" && onDismiss && (
          <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {status === "uploading" && (
        <>
          <Progress value={percent} className="h-1.5" />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {formatFileSize(loaded)} / {formatFileSize(fileSize)} · {percent}%
            </span>
            {speed > 0 && <span>{formatSpeed(speed)}</span>}
          </div>
        </>
      )}

      {status === "done" && (
        <span className="text-green-600 text-[11px]">Nahráno ✓</span>
      )}

      {status === "cancelled" && (
        <span className="text-muted-foreground text-[11px]">Zrušeno</span>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2">
          <span className="text-destructive text-[11px] flex-1">{error ?? "Nahrávání selhalo"}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
              <RefreshCw className="h-3 w-3" /> Zkusit znovu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
