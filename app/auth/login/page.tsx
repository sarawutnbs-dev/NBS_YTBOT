import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import LoginForm from "./LoginForm.client";

export default async function LoginPage() {
  const session = await getServerAuthSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f0f2f5'
    }}>
      <div style={{
        width: '400px',
        padding: '32px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '8px', textAlign: 'center' }}>NotebookSPEC</h2>
        <p style={{ marginBottom: '32px', color: '#666', textAlign: 'center' }}>
          Reply Assistant
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
