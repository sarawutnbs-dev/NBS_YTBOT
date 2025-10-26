import { prisma } from "@/lib/db";
import DashboardOverview from "./DashboardOverview.client";
import SyncCommentsButton from "./SyncCommentsButton.client";

export default async function DashboardPage() {
  const [pendingDrafts, approvedDrafts, products, users] = await Promise.all([
    prisma.draft.count({ where: { status: "PENDING" } }),
    prisma.draft.count({ where: { status: "APPROVED" } }),
    prisma.product.count(),
    prisma.user.count({ where: { allowed: true } })
  ]);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <SyncCommentsButton />
      </div>
      <DashboardOverview
        stats={{
          pendingDrafts,
          approvedDrafts,
          products,
          allowlistedUsers: users
        }}
      />
    </>
  );
}
