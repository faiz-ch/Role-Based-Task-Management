
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { ErrorBoundary } from "./app/components/ErrorBoundary";
  import { QueryClientProvider } from "@tanstack/react-query";
  import { queryClient } from "./app/api/queryClient";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  );
  