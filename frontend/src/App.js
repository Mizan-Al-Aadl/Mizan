import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import MizanApp from "@/pages/MizanApp";

function App() {
  return (
    <div className="App" dir="rtl" lang="ar">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MizanApp />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}

export default App;
