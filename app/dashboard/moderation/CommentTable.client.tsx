"use client";

import { useState } from "react";
import { Button, Space, Table, Tag, message, Card, Typography, Popconfirm } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { Draft, Comment } from "@prisma/client";
import axios from "axios";
import useSWR from "swr";

const { Text, Paragraph } = Typography;

type CommentRow = Comment & {
  draft: Draft | null;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function CommentTable() {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: comments = [], mutate } = useSWR<CommentRow[]>("/api/comments", fetcher);

  async function handleSendToAI() {
    // Get comments without drafts
    const commentsWithoutDrafts = comments.filter(c => !c.draft);

    if (commentsWithoutDrafts.length === 0) {
      message.info("All comments already have drafts");
      return;
    }

    try {
      setLoading(true);

      // Generate drafts using batch processing (grouped by video ID with transcript)
      const response = await axios.post("/api/drafts/generate-batch");

      message.success(response.data.message || "Generated drafts successfully");
      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      message.error("Failed to generate drafts");
    } finally {
      setLoading(false);
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

  const columns: ColumnsType<CommentRow> = [
    {
      title: "Author",
      dataIndex: "authorDisplayName",
      key: "authorDisplayName",
      width: 150,
    },
    {
      title: "Comment",
      dataIndex: "textOriginal",
      key: "textOriginal",
      render: (value: string) => (
        <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ marginBottom: 0 }}>
          {value}
        </Paragraph>
      )
    },
    {
      title: "Draft Reply",
      key: "draftReply",
      width: 120,
      render: (_: unknown, record: CommentRow) => {
        if (!record.draft) return <Text type="secondary">-</Text>;
        if (!record.draft.reply) return <Text type="warning">No reply</Text>;
        return <Text type="success">✓ Ready</Text>;
      }
    },
    {
      title: "Status",
      key: "status",
      width: 120,
      render: (_: unknown, record: CommentRow) => {
        if (!record.draft) return <Tag color="default">No draft</Tag>;

        const statusColors: Record<string, string> = {
          PENDING: "orange",
          APPROVED: "green",
          REJECTED: "red",
          POSTED: "blue"
        };

        return (
          <Tag color={statusColors[record.draft.status] || "default"}>
            {record.draft.status}
          </Tag>
        );
      }
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: unknown, record: CommentRow) => {
        if (!record.draft || record.draft.status !== "PENDING") {
          return null;
        }

        return (
          <Space>
            <Popconfirm
              title="Reject this draft?"
              description="This action cannot be undone."
              onConfirm={() => handleReject(record.draft!.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                loading={actionLoading === record.draft.id}
              >
                Reject
              </Button>
            </Popconfirm>

            <Popconfirm
              title="Post this reply?"
              description="This will post the reply to YouTube."
              onConfirm={() => handlePost(record.draft!.id, record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                loading={actionLoading === record.draft.id}
              >
                Post
              </Button>
            </Popconfirm>
          </Space>
        );
      }
    }
  ];

  const commentsWithoutDrafts = comments.filter(c => !c.draft);

  // Expandable row configuration
  const expandedRowRender = (record: CommentRow) => {
    if (!record.draft) {
      return <Text type="secondary">No draft available</Text>;
    }

    // Parse suggested products if available
    let suggestedProducts: Array<{ name: string; url: string; price: string }> = [];
    try {
      if (record.draft.suggestedProducts) {
        suggestedProducts = JSON.parse(record.draft.suggestedProducts as string);
      }
    } catch (error) {
      console.error("Failed to parse suggested products:", error);
    }

    return (
      <Card size="small" style={{ backgroundColor: "#fafafa" }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Text strong>AI Generated Reply:</Text>
            <Paragraph style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {record.draft.reply || <Text type="secondary">No reply generated yet</Text>}
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
            <Space direction="vertical">
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Engagement Score: {(record.draft.engagementScore || 0).toFixed(2)}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Relevance Score: {(record.draft.relevanceScore || 0).toFixed(2)}
                </Text>
              </Space>

              <Text type="secondary" style={{ fontSize: 12 }}>
                Draft Status: {record.draft.status}
              </Text>
            </Space>
          </div>
        </Space>
      </Card>
    );
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          onClick={handleSendToAI}
          loading={loading}
          disabled={commentsWithoutDrafts.length === 0}
        >
          Send to AI for draft ({commentsWithoutDrafts.length})
        </Button>
        <Button
          onClick={() => {
            console.log('Refreshing data...');
            mutate();
          }}
          loading={loading}
        >
          🔄 Refresh
        </Button>
        <Button
          onClick={() => {
            console.log('=== DEBUG: All Comments ===');
            console.log(`Total comments: ${comments.length}`);
            comments.forEach((c, i) => {
              console.log(`${i + 1}. ${c.textOriginal.substring(0, 30)}...`);
              console.log(`   Has draft: ${!!c.draft}`);
              console.log(`   Has reply: ${!!c.draft?.reply}`);
              console.log(`   Reply length: ${c.draft?.reply?.length || 0}`);
              console.log(`   Status: ${c.draft?.status || 'N/A'}`);
            });
          }}
        >
          🐛 Debug
        </Button>
      </Space>

      <Table<CommentRow>
        rowKey="id"
        loading={loading}
        dataSource={comments}
        columns={columns}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record: CommentRow) => {
            console.log('🔵 Expanding row:', record.id, 'Has reply:', !!record.draft?.reply);
            return expandedRowRender(record);
          },
          rowExpandable: (record: CommentRow) => {
            const hasDraft = !!record.draft;
            const hasReply = !!record.draft?.reply;
            const replyLength = record.draft?.reply?.length || 0;

            // Allow expanding all rows that have a draft
            console.log('🟡 Row expandable check:', {
              commentId: record.id.substring(0, 10),
              author: record.authorDisplayName,
              hasDraft,
              hasReply,
              replyLength,
              draftStatus: record.draft?.status || 'N/A',
              replyPreview: record.draft?.reply?.substring(0, 30) || 'N/A'
            });

            return hasDraft;
          },
        }}
      />
    </>
  );
}
