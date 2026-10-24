import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { ApiProvider } from "@/data";
import { createRouter } from "./routes";

const router = createRouter();

const root = document.getElementById("root");
if (!root) throw new Error("#root 없음");

createRoot(root).render(
  <StrictMode>
    <ApiProvider
      onExpired={({ scope, demo }) =>
        router.navigate(`${scope === "admin" ? "/admin/login" : "/login"}?expired=${demo ? "demo" : "1"}`)
      }
    >
      <RouterProvider router={router} />
      <Toaster position="bottom-center" offset={88} />
    </ApiProvider>
  </StrictMode>,
);
