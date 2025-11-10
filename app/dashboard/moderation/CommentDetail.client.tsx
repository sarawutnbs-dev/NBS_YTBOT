"use client";

import { useState } from "react";
import { Button, Space, Tag, Typography, Card, Popconfirm, message, Empty, Input } from "antd";
import { CheckOutlined, CloseOutlined, SendOutlined, EditOutlined, ReloadOutlined, SaveOutlined, ClockCircleOutlined, CheckCircleOutlined as CheckCircleFilled, CloseCircleOutlined, FileTextOutlined } from "@ant-design/icons";
import { format } from "date-fns";
import type { Draft, Comment } from "@prisma/client";
import axios from "axios";
import AIContextModal from "./AIContextModal";

const { TextArea } = Input;

const { Text, Title, Paragraph } = Typography;

type CommentRow = Comment & {
  draft: Draft | null;
};

type VideoGroup = {
  videoId: string;
  videoTitle: string;
  videoPublishedAt: Date | null;
  latestCommentDate: Date;
  comments: CommentRow[];
  hasTranscript: boolean;
};

interface CommentDetailProps {
  group: VideoGroup | null;
  onRefresh: () => void;
}

export default function CommentDetail({ group, onRefresh }: CommentDetailProps) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editedReply, setEditedReply] = useState<string>("");
  const [editedProducts, setEditedProducts] = useState<Array<{ name: string; url: string; price: string }>>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  if (!group) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Empty description="เลือกวิดีโอเพื่อดู Comments" />
      </div>
    );
  }

  const commentsWithoutDrafts = group.comments.filter((c) => !c.draft);

  async function handlePreviewContext() {
    try {
      setContextLoading(true);
      const response = await axios.post("/api/drafts/preview-context", { videoId: group!.videoId });
      setContextData(response.data.data);
      setModalVisible(true);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "ไม่สามารถดึงข้อมูล context ได้";
      message.error(errorMsg);
    } finally {
      setContextLoading(false);
    }
  }

  async function handleConfirmSendToAI() {
    try {
      setConfirmLoading(true);
      const response = await axios.post("/api/drafts/generate-video", { videoId: group!.videoId });
      message.success(response.data.message || "สร้างร่างคำตอบสำเร็จ");
      setModalVisible(false);
      setContextData(null);
      onRefresh();
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "ไม่สามารถสร้างร่างคำตอบได้";
      message.error(errorMsg);
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleCancelModal() {
    setModalVisible(false);
    setContextData(null);
  }

  async function handleReject(draftId: string) {
    try {
      setActionLoading(draftId);
      await axios.patch(`/api/drafts/${draftId}`, { status: "REJECTED" });
      message.success("ปฏิเสธร่างคำตอบแล้ว");
      onRefresh();
    } catch (error) {
      console.error(error);
      message.error("ไม่สามารถปฏิเสธได้");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePost(draftId: string, commentId: string) {
    try {
      setActionLoading(draftId);

      // Update draft status to POSTED
      await axios.patch(`/api/drafts/${draftId}`, { status: "POSTED" });

      // Post the reply to YouTube
      await axios.post(`/api/comments/${commentId}/reply`);

      message.success("โพสต์ไปยัง YouTube สำเร็จ!");
      onRefresh();
    } catch (error) {
      console.error(error);
      message.error("ไม่สามารถโพสต์ได้");
    } finally {
      setActionLoading(null);
    }
  }


  function handleStartEdit(draftId: string, currentReply: string, currentProducts: Array<{ name: string; url: string; price: string }>) {
    console.log('handleStartEdit called:', { draftId, currentReply, currentProducts, currentEditingDraftId: editingDraftId });
    setEditingDraftId(draftId);
    setEditedReply(currentReply);
    setEditedProducts(currentProducts);
    console.log('After setState:', { newEditingDraftId: draftId });
  }

  function handleCancelEdit() {
    setEditingDraftId(null);
    setEditedReply("");
    setEditedProducts([]);
  }

  async function handleSaveEdit(draftId: string) {
    try {
      setActionLoading(draftId);

      // Filter out empty products
      const validProducts = editedProducts.filter(p => p.name.trim() !== "");

      await axios.patch(`/api/drafts/${draftId}`, {
        reply: editedReply,
        suggestedProducts: validProducts.length > 0 ? JSON.stringify(validProducts) : null,
      });
      message.success("บันทึกคำตอบแล้ว");
      setEditingDraftId(null);
      setEditedReply("");
      setEditedProducts([]);
      onRefresh();
    } catch (error) {
      console.error(error);
      message.error("ไม่สามารถบันทึกได้");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefreshComment(commentId: string) {
    try {
      setActionLoading(commentId);
      const response = await axios.post("/api/drafts/regenerate-single", {
        commentId,
      });
      message.success(response.data.message || "สร้างคำตอบใหม่สำเร็จ");
      onRefresh();
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "ไม่สามารถสร้างคำตอบใหม่ได้";
      message.error(errorMsg);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "16px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <Title level={5} style={{ margin: 0 }}>
            {group.videoTitle}
          </Title>
          <Space>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handlePreviewContext}
              loading={contextLoading}
              disabled={!group.hasTranscript || commentsWithoutDrafts.length === 0}
              size="small"
            >
              Send to AI ({commentsWithoutDrafts.length})
            </Button>
            {!group.hasTranscript && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                ไม่มี Transcript
              </Text>
            )}
          </Space>
        </Space>
      </div>

      {/* Comments List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          {group.comments.map((comment) => {
            const hasDraft = !!comment.draft;
            const isPending = comment.draft?.status === "PENDING";

            // Parse suggested products
            let suggestedProducts: Array<{ name: string; url: string; price: string }> = [];
            try {
              if (comment.draft?.suggestedProducts) {
                suggestedProducts = JSON.parse(comment.draft.suggestedProducts as string);
              }
            } catch (error) {
              console.error("Failed to parse suggested products:", error);
            }

            return (
              <Card
                key={comment.id}
                size="small"
                style={{ borderRadius: 8 }}
                bodyStyle={{ padding: 12 }}
              >
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {/* Comment Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Space size={8}>
                      <Text strong style={{ fontSize: 13 }}>
                        {comment.authorDisplayName}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        📅 {format(new Date(comment.publishedAt), "dd/MM/yy HH:mm")}
                      </Text>
                      {comment.draft ? (
                        comment.draft.status === "PENDING" ? (
                          <Space size={4}>
                            <ClockCircleOutlined style={{ color: "#fa8c16", fontSize: 12 }} />
                            <Text style={{ fontSize: 11, color: "#fa8c16" }}>รอดำเนินการ</Text>
                          </Space>
                        ) : comment.draft.status === "APPROVED" ? (
                          <Space size={4}>
                            <CheckCircleFilled style={{ color: "#52c41a", fontSize: 12 }} />
                            <Text style={{ fontSize: 11, color: "#52c41a" }}>อนุมัติ</Text>
                          </Space>
                        ) : comment.draft.status === "REJECTED" ? (
                          <Space size={4}>
                            <CloseCircleOutlined style={{ color: "#ff4d4f", fontSize: 12 }} />
                            <Text style={{ fontSize: 11, color: "#ff4d4f" }}>ปฏิเสธ</Text>
                          </Space>
                        ) : comment.draft.status === "POSTED" ? (
                          <Space size={4}>
                            <SendOutlined style={{ color: "#1890ff", fontSize: 12 }} />
                            <Text style={{ fontSize: 11, color: "#1890ff" }}>โพสต์แล้ว</Text>
                          </Space>
                        ) : null
                      ) : (
                        <Space size={4}>
                          <FileTextOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
                          <Text style={{ fontSize: 11, color: "#8c8c8c" }}>ไม่มีร่าง</Text>
                        </Space>
                      )}
                    </Space>

                    {isPending && (
                      <Space size={4}>
                        <Popconfirm
                          title="ปฏิเสธร่างคำตอบนี้?"
                          description="การกระทำนี้ไม่สามารถย้อนกลับได้"
                          onConfirm={() => handleReject(comment.draft!.id)}
                          okText="ใช่"
                          cancelText="ไม่"
                        >
                          <Button
                            size="small"
                            danger
                            icon={<CloseOutlined />}
                            loading={actionLoading === comment.draft!.id}
                          >
                            ปฏิเสธ
                          </Button>
                        </Popconfirm>

                        <Popconfirm
                          title="โพสต์คำตอบนี้?"
                          description="จะทำการโพสต์ไปยัง YouTube"
                          onConfirm={() => handlePost(comment.draft!.id, comment.id)}
                          okText="ใช่"
                          cancelText="ไม่"
                        >
                          <Button
                            size="small"
                            type="primary"
                            icon={<CheckOutlined />}
                            loading={actionLoading === comment.draft!.id}
                          >
                            โพสต์
                          </Button>
                        </Popconfirm>
                      </Space>
                    )}
                  </div>

                  {/* Comment Text */}
                  <Paragraph style={{ margin: 0, fontSize: 13 }}>{comment.textOriginal}</Paragraph>

                  {/* Draft Reply */}
                  {hasDraft && (
                    <Card
                      size="small"
                      style={{ backgroundColor: "#fafafa", marginTop: 8, borderRadius: 6 }}
                      bodyStyle={{ padding: 8 }}
                    >
                          <Space direction="vertical" style={{ width: "100%" }} size={8}>
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <Text strong style={{ fontSize: 12 }}>
                                  คำตอบจาก AI:
                                </Text>
                                <Space size={4}>
                                  {editingDraftId === comment.draft?.id ? (
                                    <>
                                      <Button
                                        size="small"
                                        icon={<SaveOutlined />}
                                        type="primary"
                                        onClick={() => handleSaveEdit(comment.draft!.id)}
                                        loading={actionLoading === comment.draft!.id}
                                      >
                                        บันทึก
                                      </Button>
                                      <Button size="small" onClick={handleCancelEdit}>
                                        ยกเลิก
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="small"
                                        icon={<EditOutlined />}
                                        onClick={() => {
                                          console.log('Edit clicked, draft:', comment.draft);
                                          handleStartEdit(comment.draft!.id, comment.draft!.reply || "", suggestedProducts);
                                        }}
                                      >
                                        แก้ไข
                                      </Button>
                                      <Button
                                        size="small"
                                        icon={<ReloadOutlined />}
                                        onClick={() => handleRefreshComment(comment.id)}
                                        loading={actionLoading === comment.id}
                                      >
                                        Refresh
                                      </Button>
                                    </>
                                  )}
                                </Space>
                              </div>

                              {editingDraftId === comment.draft?.id ? (
                                <TextArea
                                  value={editedReply}
                                  onChange={(e) => setEditedReply(e.target.value)}
                                  autoSize={{ minRows: 4, maxRows: 12 }}
                                  style={{ fontSize: 12 }}
                                />
                              ) : (
                                <Paragraph style={{ marginTop: 4, marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 12 }}>
                                  {comment.draft?.reply || <Text type="secondary">ยังไม่มีคำตอบ</Text>}
                                </Paragraph>
                              )}
                            </div>

                            {(suggestedProducts.length > 0 || (editingDraftId === comment.draft?.id && editedProducts.length > 0)) && (
                              <div>
                                <Text strong style={{ fontSize: 12 }}>
                                  สินค้าแนะนำ:
                                </Text>
                                {editingDraftId === comment.draft?.id ? (
                                  <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={4}>
                                    {editedProducts.map((product, idx) => (
                                      <Card key={idx} size="small" style={{ fontSize: 12 }}>
                                        <Space direction="vertical" size={4} style={{ width: "100%" }}>
                                          <Input
                                            size="small"
                                            placeholder="ชื่อสินค้า"
                                            value={product.name}
                                            onChange={(e) => {
                                              const newProducts = [...editedProducts];
                                              newProducts[idx].name = e.target.value;
                                              setEditedProducts(newProducts);
                                            }}
                                          />
                                          <Input
                                            size="small"
                                            placeholder="ราคา"
                                            value={product.price}
                                            onChange={(e) => {
                                              const newProducts = [...editedProducts];
                                              newProducts[idx].price = e.target.value;
                                              setEditedProducts(newProducts);
                                            }}
                                          />
                                          <Input
                                            size="small"
                                            placeholder="URL"
                                            value={product.url}
                                            onChange={(e) => {
                                              const newProducts = [...editedProducts];
                                              newProducts[idx].url = e.target.value;
                                              setEditedProducts(newProducts);
                                            }}
                                          />
                                          <Button
                                            size="small"
                                            danger
                                            onClick={() => {
                                              const newProducts = editedProducts.filter((_, i) => i !== idx);
                                              setEditedProducts(newProducts);
                                            }}
                                          >
                                            ลบ
                                          </Button>
                                        </Space>
                                      </Card>
                                    ))}
                                    <Button
                                      size="small"
                                      onClick={() => {
                                        setEditedProducts([...editedProducts, { name: "", url: "", price: "" }]);
                                      }}
                                    >
                                      + เพิ่มสินค้า
                                    </Button>
                                  </Space>
                                ) : (
                                  <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                                    {suggestedProducts.map((product, idx) => (
                                      <li key={idx} style={{ fontSize: 12 }}>
                                        <Text>{product.name}</Text>
                                        {product.price && <Text type="secondary"> - {product.price}</Text>}
                                        {product.url && (
                                          <>
                                            {" "}
                                            (
                                            <a href={product.url} target="_blank" rel="noopener noreferrer">
                                              Link
                                            </a>
                                            )
                                          </>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}

                            <Space size={12}>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Engagement: {(comment.draft?.engagementScore || 0).toFixed(2)}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Relevance: {(comment.draft?.relevanceScore || 0).toFixed(2)}
                              </Text>
                            </Space>
                          </Space>
                        </Card>
                  )}
                </Space>
              </Card>
            );
          })}
        </Space>
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f0f0", background: "#fafafa" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {group.comments.length} Comments
        </Text>
      </div>

      {/* AI Context Modal */}
      <AIContextModal
        visible={modalVisible}
        data={contextData}
        loading={contextLoading}
        onConfirm={handleConfirmSendToAI}
        onCancel={handleCancelModal}
        confirmLoading={confirmLoading}
      />
    </div>
  );
}
