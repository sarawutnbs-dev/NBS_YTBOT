"use client";

import { Form, Input, Button, message } from "antd";
import axios from "axios";

type ProductFormProps = {
  onCreated?: () => void;
};

export default function ProductForm({ onCreated }: ProductFormProps) {
  const [form] = Form.useForm();

  async function handleSubmit(values: any) {
    try {
      await axios.post("/api/products", values);
      message.success("Product created");
      form.resetFields();
      onCreated?.();
    } catch (error) {
      console.error(error);
      message.error("Failed to create product");
    }
  }

  return (
    <Form form={form} layout="inline" onFinish={handleSubmit} style={{ marginBottom: 24 }}>
      <Form.Item name="name" rules={[{ required: true, message: "Name required" }]}>
        <Input placeholder="Product name" />
      </Form.Item>
      <Form.Item name="affiliateUrl" rules={[{ required: true, message: "Link required" }]}>
        <Input placeholder="Affiliate URL" />
      </Form.Item>
      <Form.Item name="tags">
        <Input placeholder="Tags (comma separated)" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit">
          Add product
        </Button>
      </Form.Item>
    </Form>
  );
}
