"use client";

import { Form, Input, InputNumber, Button, message } from "antd";
import type { AppSetting } from "@prisma/client";
import axios from "axios";

type SettingsFormProps = {
  config: AppSetting | null;
};

export default function SettingsForm({ config }: SettingsFormProps) {
  const [form] = Form.useForm();

  async function handleSubmit(values: any) {
    try {
      await axios.post("/api/settings", values);
      message.success("Settings saved");
    } catch (error) {
      console.error(error);
      message.error("Failed to save settings");
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        channelId: config?.channelId,
        syncDays: config?.syncDays ?? 14,
        maxSyncDays: config?.maxSyncDays ?? 30
      }}
      onFinish={handleSubmit}
      style={{ maxWidth: 400 }}
    >
      <Form.Item
        name="channelId"
        label="YouTube Channel ID"
        rules={[{ required: true, message: "Channel ID is required" }]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name="syncDays"
        label="Default sync days"
        rules={[{ required: true, message: "Provide a value" }]}
      >
        <InputNumber min={1} max={30} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item
        name="maxSyncDays"
        label="Max sync days"
        rules={[{ required: true, message: "Provide a value" }]}
      >
        <InputNumber min={1} max={30} style={{ width: "100%" }} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">
          Save
        </Button>
      </Form.Item>
    </Form>
  );
}
