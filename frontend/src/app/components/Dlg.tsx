import React from "react";
import { X } from "lucide-react";

export function Dlg({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors cursor-pointer"
          >
            <X size={14} className="text-muted-foreground" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
