"use client";

import { Button, message } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { useState } from "react";
import axios from "axios";

export default function SyncCommentsButton() {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    try {
      setLoading(true);
      message.loading({ content: "กำลังดึงความคิดเห็นจาก YouTube...", key: "sync" });

      const response = await axios.post("/api/sync/comments", {
        daysBack: 7 // ดึงย้อนหลัง 7 วัน
      });

      message.success({
        content: `ดึงความคิดเห็นสำเร็จ ${response.data.synced} รายการ`,
        key: "sync",
        duration: 3
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      message.error({
        content: `เกิดข้อผิดพลาด: ${error.response?.data?.error || error.message}`,
        key: "sync",
        duration: 5
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="primary"
      icon={<SyncOutlined spin={loading} />}
      onClick={handleSync}
      loading={loading}
    >
      Sync Comments from YouTube
    </Button>
  );
}
