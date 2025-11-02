import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerAuthSession();

  // If user is logged in, redirect to dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  // Show landing page for non-logged-in users
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        {/* Logo/Title */}
        <div className="mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            NBS YouTube Bot
          </h1>
          <p className="text-xl text-gray-600">
            AI-Powered YouTube Comment Reply Assistant
          </p>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-semibold text-lg mb-2">AI-Powered Replies</h3>
            <p className="text-gray-600 text-sm">
              Generate contextual replies using RAG technology
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="text-3xl mb-3">📹</div>
            <h3 className="font-semibold text-lg mb-2">Video Transcripts</h3>
            <p className="text-gray-600 text-sm">
              Automatic transcript extraction and indexing
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="text-3xl mb-3">🛍️</div>
            <h3 className="font-semibold text-lg mb-2">Product Integration</h3>
            <p className="text-gray-600 text-sm">
              Smart product recommendations in replies
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-4">
          <Link
            href="/auth/login"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            เข้าสู่ระบบ / Login
          </Link>

          <div className="text-sm text-gray-500">
            <p>Powered by OpenAI GPT-4 & RAG Technology</p>
          </div>
        </div>

        {/* System Status (Optional) */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500">Version</div>
              <div className="font-semibold">0.1.0</div>
            </div>
            <div>
              <div className="text-gray-500">Model</div>
              <div className="font-semibold">GPT-4o-mini</div>
            </div>
            <div>
              <div className="text-gray-500">Embeddings</div>
              <div className="font-semibold">3-small (1536d)</div>
            </div>
            <div>
              <div className="text-gray-500">Status</div>
              <div className="font-semibold text-green-600">● Online</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
