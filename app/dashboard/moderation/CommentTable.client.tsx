"use client";

import { useState } from "react";
import { Button, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Draft, Comment } from "@prisma/client";
import axios from "axios";
import useSWR from "swr";
import DraftEditor, { type DraftEditorValues } from "./DraftEditor.client";

type CommentRow = Comment & {
  draft: Draft | null;
};

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function CommentTable() {
  const [selected, setSelected] = useState<CommentRow | null>(null);
  const [loading, setLoading] = useState(false);
  
  const { data: comments = [], mutate } = useSWR<CommentRow[]>("/api/comments", fetcher);

  async function handleGenerate(record: CommentRow) {
    try {
      setLoading(true);
      await axios.post("/api/drafts/generate", { commentId: record.id });
      message.success("Draft generation triggered");
      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      message.error("Failed to trigger draft generation");
    } finally {
      setLoading(false);
    }
  }

  const columns: ColumnsType<CommentRow> = [
    {
      title: "Comment",
      dataIndex: "textOriginal",
      key: "textOriginal",
      render: (value: string) => <span>{value}</span>
    },
    {
      title: "Status",
      key: "status",
      render: (_: unknown, record: CommentRow) => {
        if (!record.draft) return <Tag color="default">No draft</Tag>;
        return <Tag color={record.draft.status === "APPROVED" ? "green" : "orange"}>{record.draft.status}</Tag>;
      }
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: CommentRow) => (
        <Space>
          <Button onClick={() => setSelected(record)}>Edit</Button>
          <Button onClick={() => handleGenerate(record)} type="dashed">
            Regenerate
          </Button>
          <Button type="primary" onClick={() => handleApprove(record)} disabled={!record.draft}>
            Approve
          </Button>
        </Space>
      )
    }
  ];

  async function handleApprove(record: CommentRow) {
    if (!record.draft) {
      message.warning("No draft to approve");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`/api/drafts/${record.draft.id}/approve`, {});
      message.success("Draft approved and queued for posting");
    } catch (error) {
      console.error(error);
      message.error("Failed to approve draft");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(values: DraftEditorValues) {
    if (!selected) return;
    try {
      setLoading(true);
      await axios.put(`/api/drafts/${selected.id}`, values);
      message.success("Draft saved");
      setSelected(null);
    } catch (error) {
      console.error(error);
      message.error("Failed to save draft");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Table<CommentRow>
        rowKey="id"
        loading={loading}
        dataSource={comments}
        columns={columns}
        pagination={{ pageSize: 10 }}
      />
      {selected && (
        <DraftEditor
          open={Boolean(selected)}
          comment={selected}
          draft={selected.draft}
          onCancel={() => setSelected(null)}
          onSubmit={handleSave}
          loading={loading}
        />
      )}
    </>
  );
}
