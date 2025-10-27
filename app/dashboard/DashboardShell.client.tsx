"use client";

import { Layout, Menu, Typography } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppSession } from "@/lib/auth";

const routes = [
  { path: "/dashboard", label: "Overview" },
  { path: "/dashboard/moderation", label: "Moderation" },
  { path: "/dashboard/products", label: "Products" },
  { path: "/dashboard/transcripts", label: "Transcripts" },
  { path: "/dashboard/settings", label: "Settings" },
  { path: "/dashboard/users", label: "Users", roles: ["ADMIN"] as const }
];

type DashboardShellProps = {
  children: React.ReactNode;
  session: AppSession;
};

export default function DashboardShell({ children, session }: DashboardShellProps) {
  const pathname = usePathname();

  const menuItems = routes
    .filter(item => !item.roles || item.roles.includes(session.user.role as "ADMIN"))
    .map(item => ({ key: item.path, label: <Link href={item.path}>{item.label}</Link> }));

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0}>
        <div className="dashboard-logo">
          <Typography.Title level={4}>NotebookSPEC</Typography.Title>
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[pathname]} items={menuItems} />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: "#fff", paddingInline: 24 }}>
          <Typography.Text>Welcome, {session.user.email}</Typography.Text>
        </Layout.Header>
        <Layout.Content style={{ margin: 24 }}>
          <div className="dashboard-content">{children}</div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
