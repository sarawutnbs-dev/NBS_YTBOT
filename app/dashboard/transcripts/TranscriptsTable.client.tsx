"use client";

import { useState } from "react";
import { Table, Tag, Button, Input, Select, Space, message, Tooltip, Card, Typography } from "antd";
import { ReloadOutlined, EyeOutlined, PlayCircleOutlined } from "@ant-design/icons";
import useSWR from "swr";
import axios from "axios";
import { format } from "date-fns";
import PreviewModal from "./PreviewModal.client";

const { Title } = Typography;

const { Search } = Input;

type VideoIndex = {
  videoId: string;
  title: string;
  status: "NONE" | "INDEXING" | "READY" | "FAILED";
  updatedAt: string;
};

type ListResponse = {
  items: VideoIndex[];
  total: number;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

const statusColors: Record<string, string> = {
  NONE: "default",
  INDEXING: "blue",
  READY: "green",
  FAILED: "red",
};

export default function TranscriptsTable() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);

  const swrKey = `/api/transcripts?q=${searchQuery}&status=${status === "ALL" ? "" : status}&page=${page}&pageSize=${pageSize}`;
  const { data, error, isLoading, mutate } = useSWR<ListResponse>(swrKey, fetcher);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  const handleRunRetry = async (videoId: string) => {
    setLoadingVideoId(videoId);
    try {
      await axios.post("/api/transcripts/ensure", { videoId });
      message.success("Video queued for indexing");
      mutate();
    } catch (error) {
      message.error("Failed to queue video");
      console.error(error);
    } finally {
      setLoadingVideoId(null);
    }
  };

  const handleRunAllMissing = async () => {
    try {
      const response = await axios.post("/api/transcripts/ensure-missing");
      message.success(`Queued ${response.data.count} video(s) for indexing`);
      mutate();
    } catch (error) {
      message.error("Failed to queue missing videos");
      console.error(error);
    }
  };

  const columns = [
    {
      title: "Title",
      dataIndex: "title",
      key: "title",
      ellipsis: true,
      width: "30%",
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text || "(No title)"}</span>
        </Tooltip>
      ),
    },
    {
      title: "Video ID",
      dataIndex: "videoId",
      key: "videoId",
      width: "20%",
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: "15%",
      render: (status: string) => (
        <Tag color={statusColors[status] || "default"}>{status}</Tag>
      ),
    },
    {
      title: "Updated",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: "15%",
      render: (date: string) => format(new Date(date), "yyyy-MM-dd HH:mm"),
    },
    {
      title: "Actions",
      key: "actions",
      width: "20%",
      render: (_: any, record: VideoIndex) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleRunRetry(record.videoId)}
            loading={loadingVideoId === record.videoId}
          >
            {record.status === "FAILED" ? "Retry" : "Run"}
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setPreviewVideoId(record.videoId)}
            disabled={record.status !== "READY"}
          >
            Preview
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Video Transcripts</Title>
      <Card>
        {/* Toolbar */}
        <Space style={{ marginBottom: 16, width: "100%" }} wrap>
        <Search
          placeholder="Search by title or video ID"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={handleSearch}
          style={{ width: 300 }}
        />
        <Select
          value={status}
          onChange={handleStatusChange}
          style={{ width: 150 }}
          options={[
            { label: "All Status", value: "ALL" },
            { label: "NONE", value: "NONE" },
            { label: "INDEXING", value: "INDEXING" },
            { label: "READY", value: "READY" },
            { label: "FAILED", value: "FAILED" },
          ]}
        />
        <Button
          icon={<PlayCircleOutlined />}
          onClick={handleRunAllMissing}
          type="primary"
        >
          Run All (Missing only)
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => mutate()}>
          Refresh
        </Button>
      </Space>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={data?.items || []}
        rowKey="videoId"
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total || 0,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} videos`,
          onChange: (newPage, newPageSize) => {
            setPage(newPage);
            setPageSize(newPageSize || 20);
          },
        }}
      />

      {/* Preview Modal */}
      <PreviewModal
        open={!!previewVideoId}
        onClose={() => setPreviewVideoId(null)}
        videoId={previewVideoId || ""}
      />
      </Card>
    </div>
  );
}
