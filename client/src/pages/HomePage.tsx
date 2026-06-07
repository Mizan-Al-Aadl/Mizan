import { Link } from "react-router-dom";
import { Scale, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div dir="ltr" className="min-h-screen bg-base-100 text-base-content font-sans flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-5xl rounded-[2rem] border border-base-200 bg-base-100 shadow-xl shadow-primary/10 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-10 lg:p-16">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary mb-6">
              <Scale className="w-4 h-4 text-primary" />
              Lebanese legal assistant for Arabic and English questions
            </div>
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-base-content mb-6">
              Mizan — Legal assistance with Lebanese law
            </h1>
            <p className="max-w-2xl text-base leading-8 text-base-content/70 mb-8">
              Ask legal questions, review your case, and get clear answers in Arabic or English. Use Mizan as a starting point for Lebanese legal guidance, backed by local regulations and article references.
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-content shadow-lg shadow-primary/20 hover:bg-primary-focus transition"
              >
                Log In
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-full border border-primary/20 bg-base-100 px-6 py-3 text-sm font-semibold text-primary hover:bg-base-200 transition"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <div className="bg-primary text-primary-content p-10 lg:p-16 flex flex-col justify-center">
            <div className="rounded-3xl bg-primary/95 p-8 shadow-[0_20px_75px_-35px_rgba(52,211,153,0.35)]">
              <div className="mb-6 flex items-center gap-3 text-sm uppercase tracking-[0.2em] text-primary-content/70">
                <Scale className="w-4 h-4" />
                Mizan AI
              </div>
              <h2 className="text-3xl font-semibold leading-tight mb-4">Smart legal chat for Lebanon</h2>
              <p className="text-primary-content/80 leading-7 mb-6">
                Mizan lets you ask about contracts, property, debt, family law, and procedural rules in a simple conversational interface.
              </p>
              <ul className="space-y-3 text-sm text-primary-content/80">
                <li>• Built for Lebanese legal context</li>
                <li>• Supports Arabic and English input</li>
                <li>• Private chats and history</li>
                <li>• Fast AI-powered responses</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
