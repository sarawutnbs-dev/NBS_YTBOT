"use client";

import { Modal, Card, Spin, Tag, Typography, Button, message, Space } from "antd";
import { CopyOutlined, GithubOutlined } from "@ant-design/icons";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";

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
  source?: string; // "captions" | "github"
  summaryText?: string | null; // NEW: GPT-5 generated summary
  summaryCategory?: string | null; // NEW: GPT-5 detected category
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
  const [showGitHubRaw, setShowGitHubRaw] = useState(false);
  
  const { data, error, isLoading } = useSWR<PreviewData>(
    open && videoId ? `/api/transcripts/${videoId}/preview` : null,
    fetcher
  );

  const { data: githubData, isLoading: githubLoading } = useSWR<{
    content: string;
    url: string;
  }>(
    open && videoId && showGitHubRaw ? `/api/transcripts/${videoId}/github-raw` : null,
    fetcher
  );

  const handleCopyAll = () => {
    if (!data?.chunks) return;

    const text = data.chunks.map((chunk: { ts: string; text: string }) => `[${chunk.ts}]\n${chunk.text}`).join("\n\n");
    navigator.clipboard.writeText(text);
    message.success("Copied transcript to clipboard!");
  };

  const handleCopySummary = () => {
    if (!data?.summaryText) return;
    navigator.clipboard.writeText(data.summaryText);
    message.success("Copied AI summary to clipboard!");
  };

  const handleCopyGitHub = () => {
    if (!githubData?.content) return;
    navigator.clipboard.writeText(githubData.content);
    message.success("Copied GitHub transcript to clipboard!");
  };

  const handleViewGitHub = () => {
    setShowGitHubRaw(true);
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        setShowGitHubRaw(false);
        onClose();
      }}
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

      {data && !showGitHubRaw && (
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
                {data.source && (
                  <Tag color={data.source === "github" ? "purple" : "blue"}>
                    {data.source === "github" ? "GitHub" : "YouTube Captions"}
                  </Tag>
                )}
              </Space>
            </Space>
          </div>

          {/* Show GitHub Raw Button if source is github */}
          {data.source === "github" && (
            <div style={{ marginBottom: 16 }}>
              <Button
                type="dashed"
                icon={<GithubOutlined />}
                onClick={handleViewGitHub}
                block
              >
                View GitHub Raw File
              </Button>
            </div>
          )}

          {/* GPT-5 AI Summary (NEW) */}
          {data.summaryText && (
            <Card
              title={
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Space>
                    <span>🤖 AI Summary</span>
                    {data.summaryCategory && (
                      <Tag color="purple">{data.summaryCategory}</Tag>
                    )}
                  </Space>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={handleCopySummary}
                  >
                    Copy
                  </Button>
                </Space>
              }
              size="small"
              style={{ marginBottom: 16, backgroundColor: "#f6ffed" }}
            >
              <div>
                <Paragraph
                  style={{
                    marginBottom: 8,
                    whiteSpace: "pre-wrap",
                    fontSize: "14px",
                    lineHeight: "1.8"
                  }}
                >
                  {data.summaryText}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: "12px" }}>
                  {data.summaryText.length} chars • {data.summaryText.split(/\s+/).length} words
                </Text>
              </div>
            </Card>
          )}

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

      {/* GitHub Raw View */}
      {data && showGitHubRaw && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button onClick={() => setShowGitHubRaw(false)}>
                ← Back to Preview
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyGitHub}
                type="primary"
              >
                Copy Raw Text
              </Button>
            </Space>
          </div>

          {githubLoading && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <Spin size="large" />
            </div>
          )}

          {githubData && (
            <Card
              title={
                <Space>
                  <GithubOutlined />
                  <span>GitHub Raw Transcript</span>
                  <Tag>{data.videoId}</Tag>
                </Space>
              }
              size="small"
            >
              <div
                style={{
                  maxHeight: "70vh",
                  overflowY: "auto",
                  padding: "12px",
                  backgroundColor: "#f5f5f5",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  fontSize: "13px",
                }}
              >
                {githubData.content}
              </div>
              <div style={{ marginTop: 8, fontSize: "12px", color: "#888" }}>
                <Text type="secondary">Source: {githubData.url}</Text>
              </div>
            </Card>
          )}
        </div>
      )}
    </Modal>
  );
}
