"use client";

import { Form, Input, InputNumber, Button, message } from "antd";
import type { AppSetting } from "@prisma/client";
import axios from "axios";
import useSWR from "swr";

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function SettingsForm() {
  const [form] = Form.useForm();
  const { data: config, mutate } = useSWR<AppSetting | null>("/api/settings", fetcher);

  async function handleSubmit(values: any) {
    try {
      await axios.post("/api/settings", values);
      message.success("Settings saved");
      mutate(); // Refresh data
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
