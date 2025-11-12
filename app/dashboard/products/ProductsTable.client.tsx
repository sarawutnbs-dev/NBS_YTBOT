"use client";

import { useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, message, Tooltip, Modal, Progress } from "antd";
import { SyncOutlined, ThunderboltOutlined, TagsOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import axios from "axios";
import useSWR from "swr";

import ProductForm from "./ProductForm.client";

type ProductWithTags = {
  id: string;
  name: string;
  affiliateUrl: string;
  shortURL: string | null;
  tags: string[];
  price?: number;
  commission?: number;
  productLink?: string;
  shopeeProductId?: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EmbeddingStatus = {
  total: number;
  embedded: number;
  missing: number;
  coverage: number;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function ProductsTable() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagProgress, setTagProgress] = useState({ current: 0, total: 0, successful: 0, failed: 0 });

  const { data: products = [], mutate } = useSWR<ProductWithTags[]>("/api/products", fetcher);
  const { data: embeddingStatusData, mutate: mutateEmbeddingStatus } = useSWR<{ success: boolean; data: EmbeddingStatus }>(
    "/api/products/embedding-status",
    fetcher,
    { refreshInterval: 10000 } // Refresh every 10 seconds
  );

  const embeddingStatus = embeddingStatusData?.data;

  async function handleDelete(id: string) {
    try {
      setLoading(true);
      await axios.delete(`/api/products/${id}`);
      message.success("Product deleted");
      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      message.error("Failed to delete product");
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncShopee() {
    try {
      setSyncing(true);
      message.loading({ content: "Syncing products from Shopee...", key: "sync" });

      const response = await axios.post("/api/products/sync-shopee");

      message.success({
        content: response.data.message || `Synced ${response.data.synced} products successfully`,
        key: "sync",
        duration: 3
      });

      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      const errorMessage = axios.isAxiosError(error) && error.response?.data?.details
        ? error.response.data.details
        : "Failed to sync products from Shopee";

      message.error({
        content: errorMessage,
        key: "sync",
        duration: 5
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleEmbedMissing() {
    try {
      setEmbedding(true);
      message.loading({ content: "Embedding missing products...", key: "embed" });

      const response = await axios.post("/api/products/embed-missing");

      message.success({
        content: response.data.message || `Embedded ${response.data.data.successful} products`,
        key: "embed",
        duration: 3
      });

      mutateEmbeddingStatus(); // Refresh embedding status
    } catch (error) {
      console.error(error);
      const errorMessage = axios.isAxiosError(error) && error.response?.data?.error
        ? error.response.data.error
        : "Failed to embed products";

      message.error({
        content: errorMessage,
        key: "embed",
        duration: 5
      });
    } finally {
      setEmbedding(false);
    }
  }

  async function handleTagRegen() {
    setTagging(true);
    setShowTagModal(true);
    setTagProgress({ current: 0, total: 0, successful: 0, failed: 0 });

    try {
      const response = await fetch("/api/products/tag-regen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to start tag regeneration");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;

        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === "start") {
                  setTagProgress((prev) => ({
                    ...prev,
                    total: data.data.total,
                  }));
                } else if (data.type === "progress") {
                  setTagProgress({
                    current: data.data.current,
                    total: data.data.total,
                    successful: data.data.successful,
                    failed: data.data.failed,
                  });
                } else if (data.type === "complete") {
                  setTagProgress({
                    current: data.data.processed,
                    total: data.data.total,
                    successful: data.data.successful,
                    failed: data.data.failed,
                  });

                  message.success(data.message || `Tagged ${data.data.successful} products`);

                  // Refresh products data
                  mutate();

                  // Auto close modal after 2 seconds
                  setTimeout(() => {
                    setShowTagModal(false);
                  }, 2000);
                } else if (data.type === "error") {
                  message.error(data.error || "Failed to regenerate tags");
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      message.error("Failed to regenerate tags");
    } finally {
      setTagging(false);
    }
  }

  const columns: ColumnsType<ProductWithTags> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name"
    },
    {
      title: "Price",
      dataIndex: "price",
      key: "price",
      sorter: (a, b) => (a.price || 0) - (b.price || 0),
      render: (value?: number) => value ? `฿${value.toLocaleString()}` : "-"
    },
    {
      title: "Commission",
      dataIndex: "commission",
      key: "commission",
      sorter: (a, b) => (a.commission || 0) - (b.commission || 0),
      defaultSortOrder: 'descend' as const,
      render: (value?: number) => value ? `฿${value.toLocaleString()}` : "-"
    },
    {
      title: "Short URL",
      dataIndex: "shortURL",
      key: "shortURL",
      render: (value: string | null) => (
        value ? (
          <a href={value} target="_blank" rel="noreferrer">
            {value}
          </a>
        ) : (
          <span style={{ color: "#999" }}>-</span>
        )
      )
    },
    {
      title: "Tags",
      dataIndex: "tags",
      key: "tags",
      render: (_: unknown, record: ProductWithTags) => {
        return record.tags.length ? record.tags.map(tag => <Tag key={tag}>{tag}</Tag>) : <Tag color="default">None</Tag>;
      }
    },
    {
      title: "Source",
      key: "source",
      render: (_: unknown, record: ProductWithTags) => {
        return record.shopeeProductId ? <Tag color="orange">Shopee</Tag> : <Tag color="blue">Manual</Tag>;
      }
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: ProductWithTags) => (
        <Space>
          <Popconfirm title="Remove product?" onConfirm={() => handleDelete(record.id)}>
            <Button danger>Delete</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncing} />}
          onClick={handleSyncShopee}
          loading={syncing}
        >
          Sync Products from Shopee
        </Button>
        <Tooltip
          title={
            embeddingStatus
              ? `${embeddingStatus.embedded}/${embeddingStatus.total} products embedded (${embeddingStatus.coverage}%)`
              : "Loading..."
          }
        >
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleEmbedMissing}
            loading={embedding}
            disabled={!embeddingStatus || embeddingStatus.missing === 0}
            style={{
              backgroundColor: embeddingStatus?.missing === 0 ? "#52c41a" : undefined,
              borderColor: embeddingStatus?.missing === 0 ? "#52c41a" : undefined,
              color: embeddingStatus?.missing === 0 ? "#fff" : undefined,
            }}
          >
            {embeddingStatus
              ? `Embedding (${embeddingStatus.embedded}/${embeddingStatus.total})`
              : "Embedding (...)"}
          </Button>
        </Tooltip>
        <Button
          icon={<TagsOutlined />}
          onClick={handleTagRegen}
          loading={tagging}
        >
          Tag Regen
        </Button>
      </Space>
      <ProductForm onCreated={() => mutate()} />
      <Table<ProductWithTags>
        rowKey="id"
        loading={loading}
        dataSource={products}
        columns={columns}
      />

      {/* Tag Regeneration Progress Modal */}
      <Modal
        title="Tag Regeneration Progress"
        open={showTagModal}
        footer={null}
        closable={!tagging}
        onCancel={() => setShowTagModal(false)}
        maskClosable={!tagging}
      >
        <div style={{ padding: "20px 0" }}>
          <Progress
            percent={tagProgress.total > 0 ? Math.round((tagProgress.current / tagProgress.total) * 100) : 0}
            status={tagging ? "active" : "success"}
            strokeColor={{
              "0%": "#108ee9",
              "100%": "#87d068",
            }}
          />
          <div style={{ marginTop: 16 }}>
            <p>
              <strong>Progress:</strong> {tagProgress.current} / {tagProgress.total} products
            </p>
            <p style={{ color: "#52c41a" }}>
              <strong>Successful:</strong> {tagProgress.successful}
            </p>
            {tagProgress.failed > 0 && (
              <p style={{ color: "#ff4d4f" }}>
                <strong>Failed:</strong> {tagProgress.failed}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
