import { Toaster } from "sonner";
import MizanApp from "@/pages/MizanApp";

export default function App() {
  return (
    <div className="h-full" dir="rtl" lang="ar">
      <MizanApp />
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
