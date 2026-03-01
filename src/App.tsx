import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Page } from "./components/Page";

function App() {
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    invoke<string>("ping", { message: "hello" })
      .then((response) => {
        console.log("IPC bridge:", response);
        setBackendReady(true);
      })
      .catch((err) => {
        console.error("IPC bridge failed:", err);
        setBackendReady(true); // still render, just log
      });
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <Page ready={backendReady} />
    </div>
  );
}

export default App;
