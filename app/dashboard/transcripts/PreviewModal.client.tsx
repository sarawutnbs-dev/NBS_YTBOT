"use client";

import { Modal, Card, Spin, Tag, Typography, Button, message, Space } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import useSWR from "swr";
import axios from "axios";

const { Title, Paragraph, Text } = Typography;

type PreviewModalProps = {
  open: boolean;
  onClose: () => void;
  videoId: string;
};

type PreviewData = {
  videoId: string;
  title: string;
  status: string;
  summary: {
    totalChunks: number;
    keywords: string[];
    topics: string[];
    outline?: string[];
  };
  chunks: Array<{
    ts: string;
    text: string;
  }>;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function PreviewModal({ open, onClose, videoId }: PreviewModalProps) {
  const { data, error, isLoading } = useSWR<PreviewData>(
    open && videoId ? `/api/transcripts/${videoId}/preview` : null,
    fetcher
  );

  const handleCopyAll = () => {
    if (!data?.chunks) return;

    const text = data.chunks.map((chunk: { ts: string; text: string }) => `[${chunk.ts}]\n${chunk.text}`).join("\n\n");
    navigator.clipboard.writeText(text);
    message.success("Copied transcript to clipboard!");
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={900}
      footer={null}
      title="Transcript Preview"
      destroyOnClose
    >
      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#ff4d4f" }}>
          <Text type="danger">Failed to load preview</Text>
        </div>
      )}

      {data && (
        <div>
          {/* Header */}
          <div style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={4}>
              <Title level={4} style={{ margin: 0 }}>
                {data.title}
              </Title>
              <Space>
                <Tag>{data.videoId}</Tag>
                <Tag color={data.status === "READY" ? "green" : "default"}>{data.status}</Tag>
              </Space>
            </Space>
          </div>

          {/* Summary */}
          <Card title="Summary" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <div>
                <Text strong>Total Chunks:</Text> <Text>{data.summary.totalChunks}</Text>
              </div>

              {data.summary.keywords && data.summary.keywords.length > 0 && (
                <div>
                  <Text strong>Keywords:</Text>
                  <div style={{ marginTop: 4 }}>
                    {data.summary.keywords.map((kw: string, idx: number) => (
                      <Tag key={idx} style={{ marginBottom: 4 }}>
                        {kw}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              {data.summary.topics && data.summary.topics.length > 0 && (
                <div>
                  <Text strong>Topics:</Text>
                  <div style={{ marginTop: 4 }}>
                    {data.summary.topics.map((topic: string, idx: number) => (
                      <Tag key={idx} color="blue" style={{ marginBottom: 4 }}>
                        {topic}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              {data.summary.outline && data.summary.outline.length > 0 && (
                <div>
                  <Text strong>Outline:</Text>
                  <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                    {data.summary.outline.map((item: string, idx: number) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Space>
          </Card>

          {/* Transcript */}
          <Card
            title={
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <span>Transcript</span>
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopyAll}>
                  Copy All
                </Button>
              </Space>
            }
            size="small"
          >
            <div
              style={{
                maxHeight: "70vh",
                overflowY: "auto",
                padding: "8px 0",
              }}
            >
              {data.chunks.map((chunk: { ts: string; text: string }, idx: number) => (
                <div key={idx} style={{ marginBottom: 16 }}>
                  <Text strong style={{ color: "#1890ff" }}>
                    [{chunk.ts}]
                  </Text>
                  <Paragraph style={{ marginTop: 4, marginBottom: 0, whiteSpace: "pre-wrap" }}>
                    {chunk.text}
                  </Paragraph>
                </div>
              ))}

              {data.chunks.length === 0 && (
                <Text type="secondary">No transcript chunks available</Text>
              )}
            </div>
          </Card>
        </div>
      )}
    </Modal>
  );
}
