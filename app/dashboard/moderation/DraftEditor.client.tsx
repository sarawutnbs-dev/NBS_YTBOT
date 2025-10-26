"use client";

import { useEffect } from "react";
import { Form, Input, Modal, Space, Typography } from "antd";
import type { Draft, Comment } from "@prisma/client";

export type DraftEditorValues = {
  reply: string;
};

type DraftEditorProps = {
  open: boolean;
  loading?: boolean;
  comment: Comment;
  draft: Draft | null;
  onSubmit: (values: DraftEditorValues) => Promise<void>;
  onCancel: () => void;
};

export default function DraftEditor({ open, loading, comment, draft, onSubmit, onCancel }: DraftEditorProps) {
  const [form] = Form.useForm<DraftEditorValues>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ reply: draft?.reply ?? "" });
    }
  }, [open, draft, form]);

  return (
    <Modal
      title="Draft reply"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="Save draft"
      confirmLoading={loading}
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Typography.Text strong>Original comment</Typography.Text>
        <Typography.Paragraph type="secondary">{comment.textOriginal}</Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item
            name="reply"
            label="AI suggested reply"
            rules={[{ required: true, message: "Reply is required" }]}
          >
            <Input.TextArea rows={6} placeholder="Edit the AI draft before approving" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}
