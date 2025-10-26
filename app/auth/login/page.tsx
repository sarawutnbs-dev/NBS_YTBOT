import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import LoginButton from "./LoginButton.client";

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
        padding: '24px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '24px' }}>NotebookSPEC Reply Assistant</h2>
        <p style={{ marginBottom: '24px', color: '#666' }}>
          Sign in with your Google account to continue. Access is limited to the approved allowlist.
        </p>
        <LoginButton />
      </div>
    </div>
  );
}
