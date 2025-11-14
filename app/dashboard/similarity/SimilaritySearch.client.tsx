"use client";

import { useState } from "react";
import { Card, Input, Button, Table, Typography, Space, Tag, message, Spin, Divider } from "antd";
import { SearchOutlined, ThunderboltOutlined, ShopOutlined, FileTextOutlined } from "@ant-design/icons";
import axios from "axios";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type TranscriptResult = {
  id: number;
  docId: number;
  chunkIndex: number;
  text: string;
  meta: any;
  score: number;
  sourceType: string;
  sourceId: string;
};

type ProductResult = {
  id: string;
  shopeeProductId: string;
  name: string;
  price: number | null;
  shortUrl: string | null;
  score: number;
  priceScore?: number;
  semanticScore?: number;
};

type SearchResponse = {
  query: string;
  videoId: string | null;
  queryPrice: number | null;
  transcripts: TranscriptResult[];
  products: ProductResult[];
  metrics: {
    totalTime: number;
    embeddingTime: number;
    transcriptTime: number;
    productTime: number;
    rerankingTime: number | null;
    transcriptCount: number;
    productCount: number;
    priceReranked: boolean;
  };
};

export default function SimilaritySearch() {
  const [query, setQuery] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) {
      message.warning("กรุณากรอกข้อความค้นหา");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post<SearchResponse>("/api/similarity/search", {
        query: query.trim(),
        videoId: videoId.trim() || undefined,
        topK: 20
      });

      setResults(response.data);
      message.success(`ค้นหาเสร็จสิ้น! พบสินค้า ${response.data.products.length} รายการ`);
    } catch (error: any) {
      console.error("Search error:", error);
      message.error(error.response?.data?.error || "เกิดข้อผิดพลาดในการค้นหา");
    } finally {
      setLoading(false);
    }
  };

  const productColumns = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "ชื่อสินค้า",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      width: 400,
    },
    {
      title: "ราคา",
      dataIndex: "price",
      key: "price",
      width: 120,
      render: (price: number | null) => {
        if (price === null) return <Text type="secondary">-</Text>;
        return <Text strong>{price.toLocaleString()} ฿</Text>;
      },
    },
    {
      title: "Similarity",
      dataIndex: "score",
      key: "score",
      width: 200,
      render: (score: number, record: ProductResult) => {
        const color = score >= 0.7 ? "green" : score >= 0.5 ? "orange" : "default";
        const hasBreakdown = record.priceScore !== undefined && record.semanticScore !== undefined;

        return (
          <Space direction="vertical" size="small">
            <Tag color={color}>{(score * 100).toFixed(1)}%</Tag>
            {hasBreakdown && (
              <Space size="small">
                <Tag color="blue" style={{ fontSize: '11px' }}>
                  Semantic: {(record.semanticScore! * 100).toFixed(1)}%
                </Tag>
                <Tag color="gold" style={{ fontSize: '11px' }}>
                  Price: {(record.priceScore! * 100).toFixed(1)}%
                </Tag>
              </Space>
            )}
          </Space>
        );
      },
    },
    {
      title: "Short URL",
      dataIndex: "shortUrl",
      key: "shortUrl",
      width: 250,
      render: (shortUrl: string | null) => {
        if (!shortUrl) return <Text type="secondary">ไม่มี</Text>;
        return (
          <a href={shortUrl} target="_blank" rel="noopener noreferrer">
            {shortUrl}
          </a>
        );
      },
    },
  ];

  const transcriptColumns = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Chunk",
      dataIndex: "text",
      key: "text",
      ellipsis: true,
      render: (text: string) => (
        <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: "more" }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: "Similarity",
      dataIndex: "score",
      key: "score",
      width: 120,
      render: (score: number) => {
        const color = score >= 0.7 ? "green" : score >= 0.5 ? "orange" : "default";
        return <Tag color={color}>{(score * 100).toFixed(1)}%</Tag>;
      },
    },
    {
      title: "Video ID",
      dataIndex: "meta",
      key: "videoId",
      width: 150,
      render: (meta: any) => (
        <Text code>{meta?.videoId || "-"}</Text>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>
        <ThunderboltOutlined /> Similarity Search Testing
      </Title>
      <Paragraph type="secondary">
        ทดสอบการค้นหาความคล้ายคลึงระหว่างข้อความกับสินค้าและ Transcript โดยใช้ Hybrid Search (Vector + Keyword)
      </Paragraph>

      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <div>
            <Text strong>ข้อความค้นหา:</Text>
            <TextArea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ตัวอย่าง: ต้องการ Notebook เล่นเกมส์ ราคาไม่เกิน 15-18K"
              rows={4}
              style={{ marginTop: 8 }}
            />
          </div>

          <div>
            <Text strong>Video ID (ถ้ามี - ไม่บังคับ):</Text>
            <Input
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              placeholder="เช่น: dQw4w9WgXcQ"
              style={{ marginTop: 8 }}
            />
          </div>

          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
            size="large"
            block
          >
            ค้นหา
          </Button>
        </Space>
      </Card>

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>กำลังค้นหา...</Text>
          </div>
        </div>
      )}

      {results && !loading && (
        <>
          <Card style={{ marginBottom: 24 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Title level={4}>📊 Metrics</Title>
              {results.queryPrice && (
                <div style={{ marginBottom: 8 }}>
                  <Tag color="gold" icon={<ThunderboltOutlined />}>
                    Price Detected: {results.queryPrice.toLocaleString()} บาท
                  </Tag>
                  {results.metrics.priceReranked && (
                    <Tag color="success">Re-ranked by Price ✓</Tag>
                  )}
                </div>
              )}
              <Space wrap>
                <Tag>Total: {results.metrics.totalTime}ms</Tag>
                <Tag color="blue">Embedding: {results.metrics.embeddingTime}ms</Tag>
                <Tag color="green">Transcript: {results.metrics.transcriptTime}ms</Tag>
                <Tag color="orange">Product: {results.metrics.productTime}ms</Tag>
                {results.metrics.rerankingTime && (
                  <Tag color="gold">Re-ranking: {results.metrics.rerankingTime}ms</Tag>
                )}
              </Space>
              <Divider style={{ margin: "12px 0" }} />
              <Space wrap>
                <Tag color="geekblue">
                  <FileTextOutlined /> Transcripts: {results.metrics.transcriptCount}
                </Tag>
                <Tag color="magenta">
                  <ShopOutlined /> Products: {results.metrics.productCount}
                </Tag>
              </Space>
            </Space>
          </Card>

          <Card style={{ marginBottom: 24 }}>
            <Title level={4}>
              <FileTextOutlined /> Transcript Results ({results.transcripts.length})
            </Title>
            <Table
              dataSource={results.transcripts}
              columns={transcriptColumns}
              rowKey="id"
              pagination={{ pageSize: 5 }}
              scroll={{ x: 800 }}
            />
          </Card>

          <Card>
            <Title level={4}>
              <ShopOutlined /> Product Results ({results.products.length})
            </Title>
            <Table
              dataSource={results.products}
              columns={productColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1000 }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
