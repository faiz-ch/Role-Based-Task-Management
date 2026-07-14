import React from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function NoRoleView() {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full py-32 px-6 text-center">
      <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-5">
        <AlertTriangle size={26} className="text-amber-500" />
      </div>
      <h2 className="text-lg font-bold text-foreground mb-2">No role assigned</h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        <span className="font-mono font-medium text-foreground">
          {currentUser.email}
        </span>{" "}
        has no role yet. Contact an admin to assign one before you can use the
        app.
      </p>
    </div>
  );
}
