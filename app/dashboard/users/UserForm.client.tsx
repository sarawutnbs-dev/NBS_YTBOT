"use client";

import { Form, Input, Button, Select, message } from "antd";
import axios from "axios";

type UserFormProps = {
  onCreated?: () => void;
};

export default function UserForm({ onCreated }: UserFormProps) {
  const [form] = Form.useForm();

  async function handleSubmit(values: any) {
    try {
      await axios.post("/api/users", values);
      message.success("User added");
      form.resetFields();
      onCreated?.();
    } catch (error) {
      console.error(error);
      message.error("Failed to add user");
    }
  }

  return (
    <Form form={form} layout="inline" onFinish={handleSubmit} style={{ marginBottom: 24 }}>
      <Form.Item
        name="email"
        rules={[{ required: true, message: "Email required" }]}
        normalize={(value: string) => value?.toLowerCase()}
      >
        <Input placeholder="user@example.com" type="email" />
      </Form.Item>
      <Form.Item name="role" initialValue="USER">
        <Select
          style={{ width: 120 }}
          options={[
            { value: "USER", label: "User" },
            { value: "ADMIN", label: "Admin" }
          ]}
        />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">
          Add to allowlist
        </Button>
      </Form.Item>
    </Form>
  );
}
