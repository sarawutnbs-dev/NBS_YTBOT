"use client";

import { useState } from "react";
import { Table, Tag, Button, Input, Select, Space, message, Tooltip, Card, Typography } from "antd";
import { ReloadOutlined, EyeOutlined, PlayCircleOutlined, TagsOutlined, DatabaseOutlined, ShopOutlined } from "@ant-design/icons";
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
  publishedAt: string | null;
  tags: string[];
  categoryTags: string[];
  brandTags: string[];
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
  const [loadingRunAll, setLoadingRunAll] = useState(false);
  const [loadingTagRegen, setLoadingTagRegen] = useState(false);
  const [tagRegenProgress, setTagRegenProgress] = useState<{
    current: number;
    total: number;
    videoTitle?: string;
  } | null>(null);
  const [loadingComputePools, setLoadingComputePools] = useState(false);
  const [computePoolsProgress, setComputePoolsProgress] = useState<{
    current: number;
    total: number;
    videoTitle?: string;
  } | null>(null);
  const [loadingBrandRegen, setLoadingBrandRegen] = useState(false);
  const [brandRegenProgress, setBrandRegenProgress] = useState<{
    current: number;
    total: number;
    videoTitle?: string;
  } | null>(null);

  const swrKey = `/api/transcripts?q=${searchQuery}&status=${status === "ALL" ? "" : status}&page=${page}&pageSize=${pageSize}`;
  const { data, error, isLoading, mutate } = useSWR<ListResponse>(swrKey, fetcher, {
    refreshInterval: status === "INDEXING" ? 3000 : 0, // Auto-refresh เฉพาะเมื่อกรอง INDEXING status
    revalidateOnFocus: false, // ปิด auto-refresh (ใช้ manual refresh แทน)
    dedupingInterval: 2000, // Prevent duplicate requests within 2s
  });

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
      await axios.post("/api/transcripts/ensure", {
        videoId,
        forceReindex: true // Force re-scraping and re-indexing
      });
      message.success("Video queued for re-indexing");
      mutate();
    } catch (error) {
      message.error("Failed to queue video");
      console.error(error);
    } finally {
      setLoadingVideoId(null);
    }
  };

  const handleRunAllMissing = async () => {
    setLoadingRunAll(true);
    try {
      const response = await axios.post("/api/transcripts/ensure-missing");
      const { count, metadataUpdated } = response.data;

      const messages = [];
      if (count > 0) {
        messages.push(`Queued ${count} video(s) for indexing`);
      }
      if (metadataUpdated > 0) {
        messages.push(`Updated metadata for ${metadataUpdated} video(s)`);
      }

      if (messages.length > 0) {
        message.success(messages.join(" • "));
      } else {
        message.info("All videos are up to date");
      }

      mutate();
    } catch (error) {
      message.error("Failed to queue missing videos");
      console.error(error);
    } finally {
      setLoadingRunAll(false);
    }
  };

  const handleBatchTagRegen = async () => {
    setLoadingTagRegen(true);
    setTagRegenProgress(null);

    try {
      const response = await fetch("/api/transcripts/tag-regen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start tag regeneration");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              setTagRegenProgress({ current: 0, total: data.data.total });
            } else if (data.type === "progress") {
              setTagRegenProgress({
                current: data.data.current,
                total: data.data.total,
                videoTitle: data.data.videoTitle,
              });
            } else if (data.type === "complete") {
              message.success(data.message);
              setTagRegenProgress(null);
              mutate();
            } else if (data.type === "error") {
              message.error(data.error);
              setTagRegenProgress(null);
            }
          }
        }
      }
    } catch (error: any) {
      message.error(error.message || "Failed to regenerate tags");
      console.error(error);
      setTagRegenProgress(null);
    } finally {
      setLoadingTagRegen(false);
    }
  };

  const handleComputePools = async () => {
    setLoadingComputePools(true);
    setComputePoolsProgress(null);

    try {
      const response = await fetch("/api/transcripts/compute-pools", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start pool computation");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              setComputePoolsProgress({ current: 0, total: data.data.total });
            } else if (data.type === "progress") {
              setComputePoolsProgress({
                current: data.data.current,
                total: data.data.total,
                videoTitle: data.data.videoTitle,
              });
            } else if (data.type === "complete") {
              const avgPoolSize = data.data.avgPoolSize || 0;
              message.success(`${data.message} (Avg pool size: ${avgPoolSize})`);
              setComputePoolsProgress(null);
              mutate();
            } else if (data.type === "error") {
              message.error(data.error);
              setComputePoolsProgress(null);
            }
          }
        }
      }
    } catch (error: any) {
      message.error(error.message || "Failed to compute pools");
      console.error(error);
      setComputePoolsProgress(null);
    } finally {
      setLoadingComputePools(false);
    }
  };

  const handleBrandRegen = async () => {
    setLoadingBrandRegen(true);
    setBrandRegenProgress(null);

    try {
      const response = await fetch("/api/transcripts/brand-regen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start brand regeneration");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (data.type === "start") {
              setBrandRegenProgress({ current: 0, total: data.data.total });
            } else if (data.type === "progress") {
              setBrandRegenProgress({
                current: data.data.current,
                total: data.data.total,
                videoTitle: data.data.videoTitle,
              });
            } else if (data.type === "complete") {
              message.success(data.message);
              setBrandRegenProgress(null);
              mutate();
            } else if (data.type === "error") {
              message.error(data.error);
              setBrandRegenProgress(null);
            }
          }
        }
      }
    } catch (error: any) {
      message.error(error.message || "Failed to regenerate brands");
      console.error(error);
      setBrandRegenProgress(null);
    } finally {
      setLoadingBrandRegen(false);
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
      width: "15%",
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: "Year",
      dataIndex: "publishedAt",
      key: "publishedAt",
      width: "8%",
      render: (date: string | null) => date ? new Date(date).getFullYear() : "-",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: "8%",
      render: (status: string) => (
        <Tag color={statusColors[status] || "default"}>{status}</Tag>
      ),
    },
    {
      title: "Category",
      dataIndex: "categoryTags",
      key: "categoryTags",
      width: "10%",
      render: (categoryTags: string[]) => (
        <Space size={[0, 4]} wrap>
          {categoryTags && categoryTags.length > 0 ? (
            categoryTags.map((cat, index) => (
              <Tag key={index} color="purple">
                {cat}
              </Tag>
            ))
          ) : (
            <Tag color="default">-</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Brands",
      dataIndex: "brandTags",
      key: "brandTags",
      width: "12%",
      render: (brandTags: string[]) => (
        <Space size={[0, 4]} wrap>
          {brandTags && brandTags.length > 0 ? (
            brandTags.map((brand, index) => (
              <Tag key={index} color="orange" icon={<TagsOutlined />}>
                {brand}
              </Tag>
            ))
          ) : (
            <Tag color="default">-</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      width: "18%",
      render: (tags: string[]) => (
        <Space size={[0, 4]} wrap>
          {tags && tags.length > 0 ? (
            tags.slice(0, 5).map((tag, index) => (
              <Tag key={index} color="blue">
                {tag}
              </Tag>
            ))
          ) : (
            <Tag color="default">No tags</Tag>
          )}
          {tags && tags.length > 5 && (
            <Tag color="default">+{tags.length - 5} more</Tag>
          )}
        </Space>
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
          loading={loadingRunAll}
        >
          Run All (Missing only)
        </Button>
        <Button
          icon={<TagsOutlined />}
          onClick={handleBatchTagRegen}
          loading={loadingTagRegen}
          disabled={loadingTagRegen}
        >
          {loadingTagRegen && tagRegenProgress
            ? `Tag Regen (${tagRegenProgress.current}/${tagRegenProgress.total})`
            : "Tag Regen"}
        </Button>
        <Button
          icon={<ShopOutlined />}
          onClick={handleBrandRegen}
          loading={loadingBrandRegen}
          disabled={loadingBrandRegen}
        >
          {loadingBrandRegen && brandRegenProgress
            ? `Brand Regen (${brandRegenProgress.current}/${brandRegenProgress.total})`
            : "Brand Regen"}
        </Button>
        <Button
          icon={<DatabaseOutlined />}
          onClick={handleComputePools}
          loading={loadingComputePools}
          disabled={loadingComputePools}
        >
          {loadingComputePools && computePoolsProgress
            ? `VDO Pool (${computePoolsProgress.current}/${computePoolsProgress.total})`
            : "VDO Pool"}
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
