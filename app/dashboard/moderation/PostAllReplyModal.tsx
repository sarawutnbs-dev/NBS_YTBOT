"use client";

import { useState, useEffect } from "react";
import { Modal, Checkbox, List, Typography, Progress, Space, Tag, Alert, Button, Card, Collapse } from "antd";
import { MessageOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, UserOutlined } from "@ant-design/icons";
import { format } from "date-fns";
import axios from "axios";
import type { Draft, Comment } from "@prisma/client";

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

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

type ProcessStatus = "pending" | "processing" | "success" | "error";

type CommentProcessStatus = {
  commentId: string;
  status: ProcessStatus;
  message?: string;
};

interface PostAllReplyModalProps {
  visible: boolean;
  groups: VideoGroup[];
  onClose: () => void;
  onComplete: () => void;
}

export default function PostAllReplyModal({ visible, groups, onClose, onComplete }: PostAllReplyModalProps) {
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentStatuses, setCommentStatuses] = useState<Map<string, CommentProcessStatus>>(new Map());

  // Flatten all comments with PENDING drafts from all videos
  const pendingComments = groups.flatMap((group) =>
    group.comments
      .filter((c) => c.draft && c.draft.status === "PENDING")
      .map((c) => ({
        ...c,
        videoTitle: group.videoTitle,
        videoId: group.videoId,
      }))
  );

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setSelectedCommentIds([]);
      setProcessing(false);
      setCurrentIndex(0);
      setCommentStatuses(new Map());
    }
  }, [visible]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCommentIds(pendingComments.map((c) => c.id));
    } else {
      setSelectedCommentIds([]);
    }
  };

  const handleToggleComment = (commentId: string, checked: boolean) => {
    if (checked) {
      setSelectedCommentIds([...selectedCommentIds, commentId]);
    } else {
      setSelectedCommentIds(selectedCommentIds.filter((id) => id !== commentId));
    }
  };

  const handleProcess = async () => {
    if (selectedCommentIds.length === 0) return;

    setProcessing(true);
    const newStatuses = new Map<CommentProcessStatus>();

    // Initialize all selected comments as pending
    selectedCommentIds.forEach((commentId) => {
      newStatuses.set(commentId, { commentId, status: "pending" });
    });
    setCommentStatuses(new Map(newStatuses));

    // Process comments one by one
    for (let i = 0; i < selectedCommentIds.length; i++) {
      const commentId = selectedCommentIds[i];
      const comment = pendingComments.find((c) => c.id === commentId);
      if (!comment || !comment.draft) continue;

      setCurrentIndex(i);

      // Update status to processing
      newStatuses.set(commentId, { commentId, status: "processing" });
      setCommentStatuses(new Map(newStatuses));

      try {
        // First, update draft status to POSTED
        await axios.patch(`/api/drafts/${comment.draft.id}`, { status: "POSTED" });

        // Then, post the reply to YouTube
        await axios.post(`/api/comments/${commentId}/reply`);

        // Update status to success
        newStatuses.set(commentId, {
          commentId,
          status: "success",
          message: "Posted to YouTube successfully",
        });
        setCommentStatuses(new Map(newStatuses));
      } catch (error: any) {
        // Update status to error
        const errorMsg = error.response?.data?.error || "Failed to post reply";
        newStatuses.set(commentId, {
          commentId,
          status: "error",
          message: errorMsg,
        });
        setCommentStatuses(new Map(newStatuses));
      }
    }

    setProcessing(false);
    setCurrentIndex(selectedCommentIds.length);

    // Refresh the parent component data
    onComplete();
  };

  const handleClose = () => {
    if (!processing) {
      onClose();
    }
  };

  const progressPercent = selectedCommentIds.length > 0
    ? Math.round(((currentIndex + (processing ? 0 : 0)) / selectedCommentIds.length) * 100)
    : 0;

  const getStatusIcon = (status: ProcessStatus) => {
    switch (status) {
      case "processing":
        return <LoadingOutlined style={{ color: "#1890ff" }} />;
      case "success":
        return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
      case "error":
        return <CloseCircleOutlined style={{ color: "#ff4d4f" }} />;
      default:
        return null;
    }
  };

  // Parse suggested products
  const parseProducts = (productsJson: string | null) => {
    if (!productsJson) return [];
    try {
      return JSON.parse(productsJson);
    } catch {
      return [];
    }
  };

  return (
    <Modal
      title="Post All Reply - Publish Drafts to YouTube"
      open={visible}
      onCancel={handleClose}
      width={900}
      footer={
        processing ? null : (
          <Space>
            <Button onClick={handleClose}>Close</Button>
            <Button
              type="primary"
              onClick={handleProcess}
              disabled={selectedCommentIds.length === 0 || processing}
            >
              Post {selectedCommentIds.length > 0 ? `${selectedCommentIds.length} Reply(s)` : ""}
            </Button>
          </Space>
        )
      }
      closable={!processing}
      maskClosable={!processing}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        {/* Info */}
        <Alert
          message={`Found ${pendingComments.length} comment(s) with pending draft replies`}
          type="info"
          showIcon
        />

        {/* Progress Bar (shown when processing) */}
        {processing && (
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Text strong>
              Processing: {currentIndex + 1} / {selectedCommentIds.length}
            </Text>
            <Progress percent={progressPercent} status={processing ? "active" : "success"} />
          </Space>
        )}

        {/* Select All */}
        {!processing && pendingComments.length > 0 && (
          <Checkbox
            checked={selectedCommentIds.length === pendingComments.length}
            indeterminate={selectedCommentIds.length > 0 && selectedCommentIds.length < pendingComments.length}
            onChange={(e) => handleSelectAll(e.target.checked)}
          >
            <Text strong>Select All ({pendingComments.length})</Text>
          </Checkbox>
        )}

        {/* Comment List */}
        <div style={{ maxHeight: "500px", overflowY: "auto" }}>
          {pendingComments.length === 0 ? (
            <Alert
              message="No pending comments"
              description="All comments either don't have drafts or have already been posted."
              type="warning"
              showIcon
            />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {pendingComments.map((comment) => {
                const isSelected = selectedCommentIds.includes(comment.id);
                const commentStatus = commentStatuses.get(comment.id);
                const products = parseProducts(comment.draft?.suggestedProducts || null);

                return (
                  <Card
                    key={comment.id}
                    size="small"
                    style={{
                      background: isSelected ? "#f0f5ff" : "white",
                      border: isSelected ? "1px solid #1890ff" : "1px solid #f0f0f0",
                    }}
                  >
                    <Space direction="vertical" style={{ width: "100%" }} size={8}>
                      {/* Header */}
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space>
                          {!processing && (
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => handleToggleComment(comment.id, e.target.checked)}
                            />
                          )}
                          <MessageOutlined />
                          <Space direction="vertical" size={2}>
                            <Text strong style={{ fontSize: 13 }}>
                              <UserOutlined style={{ marginRight: 4, fontSize: 12 }} />
                              {comment.authorDisplayName}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              Video: {comment.videoTitle}
                            </Text>
                          </Space>
                        </Space>
                        <Space>
                          {commentStatus && getStatusIcon(commentStatus.status)}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {format(new Date(comment.publishedAt), "dd/MM/yy HH:mm")}
                          </Text>
                        </Space>
                      </Space>

                      {/* Comment Text */}
                      <Card size="small" style={{ backgroundColor: "#fafafa" }}>
                        <Paragraph style={{ margin: 0, fontSize: 12 }}>
                          <Text strong style={{ fontSize: 11, color: "#8c8c8c" }}>Original Comment:</Text>
                          <br />
                          {comment.textOriginal}
                        </Paragraph>
                      </Card>

                      {/* AI Reply */}
                      <Card size="small" style={{ backgroundColor: "#e6f7ff" }}>
                        <Space direction="vertical" style={{ width: "100%" }} size={4}>
                          <Text strong style={{ fontSize: 11, color: "#1890ff" }}>AI Generated Reply:</Text>
                          <Paragraph style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>
                            {comment.draft?.reply || <Text type="secondary">No reply</Text>}
                          </Paragraph>

                          {/* Suggested Products */}
                          {products.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <Text strong style={{ fontSize: 11 }}>Suggested Products:</Text>
                              <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                                {products.map((product: any, idx: number) => (
                                  <li key={idx} style={{ fontSize: 11 }}>
                                    <Text>{product.name}</Text>
                                    {product.price && <Text type="secondary"> - {product.price}</Text>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Scores */}
                          <Space size={12} style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              Engagement: {(comment.draft?.engagementScore || 0).toFixed(2)}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              Relevance: {(comment.draft?.relevanceScore || 0).toFixed(2)}
                            </Text>
                          </Space>
                        </Space>
                      </Card>

                      {/* Status Message */}
                      {commentStatus && commentStatus.message && (
                        <Alert
                          message={commentStatus.message}
                          type={commentStatus.status === "error" ? "error" : "success"}
                          showIcon
                          style={{ fontSize: 11 }}
                        />
                      )}
                    </Space>
                  </Card>
                );
              })}
            </Space>
          )}
        </div>

        {/* Summary (shown after processing) */}
        {!processing && commentStatuses.size > 0 && (
          <Alert
            message="Processing Complete"
            description={
              <Space direction="vertical" size={4}>
                <Text>
                  ✅ Success:{" "}
                  {Array.from(commentStatuses.values()).filter((s) => s.status === "success").length}
                </Text>
                <Text>
                  ❌ Failed:{" "}
                  {Array.from(commentStatuses.values()).filter((s) => s.status === "error").length}
                </Text>
              </Space>
            }
            type="success"
            showIcon
          />
        )}
      </Space>
    </Modal>
  );
}
