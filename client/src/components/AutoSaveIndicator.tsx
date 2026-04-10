import { Check, Loader2, AlertCircle } from 'lucide-react';
import { SaveStatus } from '@/hooks/useAutoSave';

export function AutoSaveIndicator({
  status,
  lastSaved,
  className = "",
  showTime = true
}: {
  status: SaveStatus;
  lastSaved: Date | null;
  className?: string;
  showTime?: boolean;
}) {
  const getStatusIcon = () => {
    switch (status) {
      case SaveStatus.SAVING:
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case SaveStatus.SAVED:
        return <Check className="h-4 w-4 text-green-500" />;
      case SaveStatus.ERROR:
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case SaveStatus.SAVING:
        return "Saving...";
      case SaveStatus.SAVED:
        return "Saved";
      case SaveStatus.ERROR:
        return "Save failed";
      default:
        return showTime && lastSaved ? getTimeAgo(lastSaved) : "";
    }
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (status === SaveStatus.IDLE && !lastSaved) return null;

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  );
}