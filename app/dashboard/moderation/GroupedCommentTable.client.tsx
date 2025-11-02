"use client";

import { useState } from "react";
import { Button, Collapse, Tag, message, Space, Typography, Card, Popconfirm } from "antd";
import { CaretRightOutlined, SendOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { Draft, Comment } from "@prisma/client";
import axios from "axios";
import useSWR from "swr";
import { format } from "date-fns";

const { Text, Title, Paragraph } = Typography;
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

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function GroupedCommentTable() {
  const [loading, setLoading] = useState(false);
  const [loadingVideoId, setLoadingVideoId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const { data: groups = [], mutate } = useSWR<VideoGroup[]>("/api/comments/grouped", fetcher);

  async function handleSendToAI(videoId: string) {
    try {
      setLoading(true);
      setLoadingVideoId(videoId);

      const response = await axios.post("/api/drafts/generate-video", { videoId });

      message.success(response.data.message || "Generated drafts successfully");
      mutate(); // Refresh data
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error || "Failed to generate drafts";
      message.error(errorMsg);
    } finally {
      setLoading(false);
      setLoadingVideoId(null);
    }
  }

  async function handleReject(draftId: string) {
    try {
      setActionLoading(draftId);
      await axios.patch(`/api/drafts/${draftId}`, {
        status: "REJECTED"
      });
      message.success("Draft rejected");
      mutate();
    } catch (error) {
      console.error(error);
      message.error("Failed to reject draft");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePost(draftId: string, commentId: string) {
    try {
      setActionLoading(draftId);

      // First, update draft status to POSTED
      await axios.patch(`/api/drafts/${draftId}`, {
        status: "POSTED"
      });

      // Then, post the reply to YouTube
      await axios.post(`/api/comments/${commentId}/reply`);

      message.success("Reply posted to YouTube successfully!");
      mutate();
    } catch (error) {
      console.error(error);
      message.error("Failed to post reply");
    } finally {
      setActionLoading(null);
    }
  }

  function toggleExpand(commentId: string) {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Comment Moderation</Title>

      <Collapse
        accordion
        expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} />}
        style={{ marginTop: 16 }}
      >
        {groups.map((group) => {
          const commentsWithoutDrafts = group.comments.filter(c => !c.draft);
          const hasCommentsToProcess = commentsWithoutDrafts.length > 0;

          return (
            <Panel
              key={group.videoId}
              header={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                  <div style={{ flex: 1 }}>
                    <div>
                      <Text strong>{group.videoTitle}</Text>
                      {!group.hasTranscript && (
                        <Tag color="orange" style={{ marginLeft: 8 }}>No Transcript</Tag>
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Published: {group.videoPublishedAt ? format(new Date(group.videoPublishedAt), "yyyy-MM-dd") : "Unknown"}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
                        {group.comments.length} comment(s)
                      </Text>
                      {hasCommentsToProcess && (
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
                          {commentsWithoutDrafts.length} without draft
                        </Text>
                      )}
                    </div>
                  </div>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendToAI(group.videoId);
                    }}
                    loading={loadingVideoId === group.videoId}
                    disabled={!group.hasTranscript || !hasCommentsToProcess || loading}
                    style={{ marginLeft: 16 }}
                  >
                    Send to AI ({commentsWithoutDrafts.length})
                  </Button>
                </div>
              }
            >
              <div style={{ paddingLeft: 24 }}>
                {group.comments.map((comment) => {
                  const isExpanded = expandedComments.has(comment.id);
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
                    <div
                      key={comment.id}
                      style={{
                        padding: "12px 0",
                        borderBottom: "1px solid #f0f0f0"
                      }}
                    >
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            {hasDraft && (
                              <Button
                                type="text"
                                size="small"
                                icon={<CaretRightOutlined rotate={isExpanded ? 90 : 0} />}
                                onClick={() => toggleExpand(comment.id)}
                                style={{ marginRight: 8 }}
                              />
                            )}
                            <Text strong>{comment.authorDisplayName}</Text>
                            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                              {format(new Date(comment.publishedAt), "yyyy-MM-dd HH:mm")}
                            </Text>
                            {comment.draft && (
                              <Tag
                                color={
                                  comment.draft.status === "PENDING" ? "orange" :
                                  comment.draft.status === "APPROVED" ? "green" :
                                  comment.draft.status === "REJECTED" ? "red" :
                                  comment.draft.status === "POSTED" ? "blue" : "default"
                                }
                                style={{ marginLeft: 8 }}
                              >
                                {comment.draft.status}
                              </Tag>
                            )}
                            {!comment.draft && (
                              <Tag color="default" style={{ marginLeft: 8 }}>No draft</Tag>
                            )}
                          </div>

                          {isPending && (
                            <Space>
                              <Popconfirm
                                title="Reject this draft?"
                                description="This action cannot be undone."
                                onConfirm={() => handleReject(comment.draft!.id)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button
                                  size="small"
                                  danger
                                  icon={<CloseOutlined />}
                                  loading={actionLoading === comment.draft!.id}
                                >
                                  Reject
                                </Button>
                              </Popconfirm>

                              <Popconfirm
                                title="Post this reply?"
                                description="This will post the reply to YouTube."
                                onConfirm={() => handlePost(comment.draft!.id, comment.id)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<CheckOutlined />}
                                  loading={actionLoading === comment.draft!.id}
                                >
                                  Post
                                </Button>
                              </Popconfirm>
                            </Space>
                          )}
                        </div>

                        <Text>{comment.textOriginal}</Text>

                        {isExpanded && comment.draft && (
                          <Card size="small" style={{ backgroundColor: "#fafafa", marginTop: 8 }}>
                            <Space direction="vertical" style={{ width: "100%" }}>
                              <div>
                                <Text strong>AI Generated Reply:</Text>
                                <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                                  {comment.draft.reply || <Text type="secondary">No reply generated yet</Text>}
                                </Paragraph>
                              </div>

                              {suggestedProducts.length > 0 && (
                                <div>
                                  <Text strong>Suggested Products:</Text>
                                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                                    {suggestedProducts.map((product, idx) => (
                                      <li key={idx}>
                                        <Text>{product.name}</Text>
                                        {product.price && <Text type="secondary"> - {product.price}</Text>}
                                        {product.url && (
                                          <> (<a href={product.url} target="_blank" rel="noopener noreferrer">Link</a>)</>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <div style={{ marginTop: 8 }}>
                                <Space>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    Engagement Score: {(comment.draft.engagementScore || 0).toFixed(2)}
                                  </Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    Relevance Score: {(comment.draft.relevanceScore || 0).toFixed(2)}
                                  </Text>
                                </Space>
                              </div>
                            </Space>
                          </Card>
                        )}
                      </Space>
                    </div>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </Collapse>

      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Text type="secondary">No comments found</Text>
        </div>
      )}
    </div>
  );
}
