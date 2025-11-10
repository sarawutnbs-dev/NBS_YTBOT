"use client";

import { Modal, Tabs, Typography, Space, Tag, Collapse, Card } from "antd";
import { FileTextOutlined, ShoppingOutlined, MessageOutlined, SendOutlined } from "@ant-design/icons";

const { Text, Paragraph, Title } = Typography;
const { Panel } = Collapse;

interface AIContextData {
  videoTitle: string;
  videoTags: string[];
  commentsCount: number;
  comments: Array<{
    id: string;
    textOriginal: string;
    authorDisplayName: string;
    publishedAt: Date;
  }>;
  productsCount: number;
  products: Array<{
    name: string;
    affiliateUrl: string | null;
    price: string | null;
    tags: string[];
  }>;
  transcriptChunksCount: number;
  transcript: Array<{
    ts: string;
    text: string;
  }>;
  promptPreview: string;
}

interface AIContextModalProps {
  visible: boolean;
  data: AIContextData | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLoading?: boolean;
}

export default function AIContextModal({
  visible,
  data,
  loading,
  onConfirm,
  onCancel,
  confirmLoading
}: AIContextModalProps) {
  if (!data) return null;

  const tabItems = [
    {
      key: "prompt",
      label: (
        <span>
          <SendOutlined /> Prompt Preview
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Card size="small" style={{ backgroundColor: "#f6f8fa" }}>
            <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 13 }}>
              {data.promptPreview}
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      key: "comments",
      label: (
        <span>
          <MessageOutlined /> Comments ({data.commentsCount})
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            {data.comments.map((comment) => (
              <Card key={comment.id} size="small">
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <Text strong style={{ fontSize: 12 }}>
                    {comment.authorDisplayName}
                  </Text>
                  <Paragraph style={{ margin: 0, fontSize: 12 }}>{comment.textOriginal}</Paragraph>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(comment.publishedAt).toLocaleString("th-TH")}
                  </Text>
                </Space>
              </Card>
            ))}
          </Space>
        </div>
      )
    },
    {
      key: "products",
      label: (
        <span>
          <ShoppingOutlined /> Products ({data.productsCount})
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {data.products.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                ไม่มีสินค้าที่ match กับ video tags - AI จะตอบโดยไม่แนะนำสินค้า
              </Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={8}>
              {data.products.map((product, idx) => (
                <Card key={idx} size="small">
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {product.name}
                    </Text>
                    {product.price && (
                      <Text style={{ fontSize: 12, color: "#52c41a" }}>ราคา: {product.price}</Text>
                    )}
                    {product.affiliateUrl && (
                      <a
                        href={product.affiliateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12 }}
                      >
                        {product.affiliateUrl}
                      </a>
                    )}
                    {product.tags && product.tags.length > 0 && (
                      <Space size={4} wrap>
                        {product.tags.map((tag) => (
                          <Tag key={tag} style={{ fontSize: 11, margin: 0 }}>
                            {tag}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </div>
      )
    },
    {
      key: "transcript",
      label: (
        <span>
          <FileTextOutlined /> Transcript ({data.transcriptChunksCount} chunks)
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Collapse accordion>
            {data.transcript.slice(0, 10).map((chunk, idx) => (
              <Panel
                header={`${chunk.ts}`}
                key={idx}
              >
                <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{chunk.text}</Paragraph>
              </Panel>
            ))}
            {data.transcript.length > 10 && (
              <Panel header={`... and ${data.transcript.length - 10} more chunks`} key="more" disabled>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  แสดงเพียง 10 chunks แรกเพื่อความรวดเร็ว
                </Text>
              </Panel>
            )}
          </Collapse>
        </div>
      )
    }
  ];

  return (
    <Modal
      title={
        <Space direction="vertical" size={4}>
          <Title level={4} style={{ margin: 0 }}>
            AI Context Preview
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {data.videoTitle}
          </Text>
          {data.videoTags && data.videoTags.length > 0 && (
            <Space size={4} wrap>
              {data.videoTags.map((tag) => (
                <Tag key={tag} color="blue" style={{ fontSize: 11 }}>
                  {tag}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      }
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      okText="Send to AI"
      cancelText="Cancel"
      width={800}
      confirmLoading={confirmLoading}
      style={{ top: 20 }}
    >
      <Tabs defaultActiveKey="prompt" items={tabItems} />
    </Modal>
  );
}
