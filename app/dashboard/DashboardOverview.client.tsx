"use client";

import { Card, Col, Row, Statistic } from "antd";

type DashboardOverviewProps = {
  stats: {
    pendingDrafts: number;
    approvedDrafts: number;
    products: number;
    allowlistedUsers: number;
  };
};

export default function DashboardOverview({ stats }: DashboardOverviewProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12} xl={6}>
        <Card>
          <Statistic title="Pending drafts" value={stats.pendingDrafts} />
        </Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card>
          <Statistic title="Approved drafts" value={stats.approvedDrafts} />
        </Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card>
          <Statistic title="Products" value={stats.products} />
        </Card>
      </Col>
      <Col xs={24} md={12} xl={6}>
        <Card>
          <Statistic title="Allowlisted users" value={stats.allowlistedUsers} />
        </Card>
      </Col>
    </Row>
  );
}
