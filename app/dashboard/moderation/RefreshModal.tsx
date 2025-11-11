"use client";

import { Modal, Progress, Space, Typography, Alert, Tabs, Card, Tag, Collapse } from "antd";
import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined, ShoppingOutlined, SendOutlined } from "@ant-design/icons";

const { Text, Paragraph, Title } = Typography;
const { Panel } = Collapse;

type RefreshStatus = "processing" | "success" | "error";

interface ContextData {
  videoTitle: string;
  videoTags: string[];
  commentText: string;
  products: Array<{
    id: string;
    name: string;
    price: string | null;
    url: string;
    tags: string[];
  }>;
  contexts: Array<{
    text: string;
    score: number;
    sourceType: "transcript" | "product" | "comment";
  }>;
  transcriptChunks: Array<{
    ts: string;
    text: string;
  }>;
  promptPreview: string;
}

interface RefreshModalProps {
  visible: boolean;
  status: RefreshStatus;
  message?: string;
  contextData?: ContextData | null;
  onClose: () => void;
}

export default function RefreshModal({ visible, status, message, contextData, onClose }: RefreshModalProps) {
  const getIcon = () => {
    switch (status) {
      case "processing":
        return <LoadingOutlined style={{ fontSize: 48, color: "#1890ff" }} />;
      case "success":
        return <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a" }} />;
      case "error":
        return <CloseCircleOutlined style={{ fontSize: 48, color: "#ff4d4f" }} />;
    }
  };

  const getTitle = () => {
    switch (status) {
      case "processing":
        return "กำลังสร้างคำตอบใหม่...";
      case "success":
        return "สำเร็จ!";
      case "error":
        return "เกิดข้อผิดพลาด";
    }
  };

  const getMessage = () => {
    if (message) return message;

    switch (status) {
      case "processing":
        return "AI กำลังวิเคราะห์คอมเมนต์และสร้างคำตอบใหม่";
      case "success":
        return "สร้างคำตอบใหม่สำเร็จแล้ว";
      case "error":
        return "ไม่สามารถสร้างคำตอบใหม่ได้ กรุณาลองใหม่อีกครั้ง";
    }
  };

  // Build tabs if contextData is available (same as AIContextModal)
  const tabItems = contextData ? [
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
              {contextData.promptPreview}
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      key: "comment",
      label: "Comment",
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Card size="small">
            <Paragraph style={{ margin: 0, fontSize: 13 }}>
              {contextData.commentText}
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      key: "products",
      label: (
        <span>
          <ShoppingOutlined /> Products ({contextData.products.length})
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {contextData.products.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                ไม่มีสินค้าที่ match กับ video tags - AI จะตอบโดยไม่แนะนำสินค้า
              </Text>
            </div>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={8}>
              {contextData.products.map((product) => (
                <Card key={product.id} size="small">
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {product.name}
                    </Text>
                    {product.price && (
                      <Text style={{ fontSize: 12, color: "#52c41a" }}>ราคา: {product.price}</Text>
                    )}
                    {product.url && (
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12 }}
                      >
                        {product.url}
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
          <FileTextOutlined /> Transcript ({contextData.transcriptChunks?.length || 0} chunks)
        </span>
      ),
      children: (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          <Collapse accordion>
            {contextData.transcriptChunks?.slice(0, 10).map((chunk, idx) => (
              <Panel
                header={`${chunk.ts}`}
                key={idx}
              >
                <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{chunk.text}</Paragraph>
              </Panel>
            ))}
            {contextData.transcriptChunks && contextData.transcriptChunks.length > 10 && (
              <Panel header={`... and ${contextData.transcriptChunks.length - 10} more chunks`} key="more" disabled>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  แสดงเพียง 10 chunks แรกเพื่อความรวดเร็ว
                </Text>
              </Panel>
            )}
          </Collapse>
        </div>
      )
    }
  ] : [];

  return (
    <Modal
      open={visible}
      title={
        contextData ? (
          <Space direction="vertical" size={4}>
            <Space>
              {getIcon()}
              <Title level={4} style={{ margin: 0 }}>
                {getTitle()}
              </Title>
            </Space>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {contextData.videoTitle}
            </Text>
            {contextData.videoTags && contextData.videoTags.length > 0 && (
              <Space size={4} wrap>
                {contextData.videoTags.map((tag) => (
                  <Tag key={tag} color="blue" style={{ fontSize: 11 }}>
                    {tag}
                  </Tag>
                ))}
              </Space>
            )}
            {status === "processing" && (
              <Progress
                percent={100}
                status="active"
                showInfo={false}
                size="small"
              />
            )}
          </Space>
        ) : (
          <Space direction="vertical" size={4}>
            <Space>
              {getIcon()}
              <Text strong style={{ fontSize: 18 }}>
                {getTitle()}
              </Text>
            </Space>
            {status === "processing" && (
              <Progress
                percent={100}
                status="active"
                showInfo={false}
                size="small"
              />
            )}
          </Space>
        )
      }
      footer={null}
      closable={status !== "processing"}
      maskClosable={status !== "processing"}
      onCancel={onClose}
      width={contextData ? 800 : 450}
      style={{ top: 20 }}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        {/* Status Message */}
        <Alert
          message={getMessage()}
          type={status === "error" ? "error" : status === "success" ? "success" : "info"}
          showIcon
        />

        {/* Context Tabs (only show if contextData available) */}
        {contextData && tabItems.length > 0 && (
          <Tabs defaultActiveKey="prompt" items={tabItems} />
        )}

        {/* Auto close hint */}
        {status === "success" && (
          <Text type="secondary" style={{ fontSize: 12, textAlign: "center", display: "block" }}>
            หน้าต่างนี้จะปิดอัตโนมัติใน 2 วินาที
          </Text>
        )}
      </Space>
    </Modal>
  );
}
