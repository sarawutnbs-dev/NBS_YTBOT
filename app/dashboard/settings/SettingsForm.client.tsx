"use client";

import { useEffect, useState } from "react";
import {
  Form,
  Input,
  InputNumber,
  Button,
  Checkbox,
  Tabs,
  Select,
  message,
} from "antd";
import TextArea from "antd/es/input/TextArea";
import type { AppSetting } from "@prisma/client";
import axios from "axios";
import useSWR from "swr";
import { FIRST_PROMPT, PURCHASE_PROMPT } from "@/lib/rag/prompts";

const { TabPane } = Tabs;

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

type SettingsFormValues = {
  channelId: string;
  syncDays: number;
  maxSyncDays: number;
  aiTranscriptFallback: boolean;
  firstPrompt?: string;
  purchasePrompt?: string;
  commentReplyModel?: string;
  transcriptSummaryModel?: string;
  productEmbeddingModel?: string;
};

const MODEL_OPTIONS = [
  { label: "GPT-5", value: "gpt-5" },
  { label: "GPT-5 Mini", value: "gpt-5-mini" },
  { label: "GPT-5 Nano", value: "gpt-5-nano" },
];

export default function SettingsForm() {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState("1");
  const [editingFirstPrompt, setEditingFirstPrompt] = useState(false);
  const [editingPurchasePrompt, setEditingPurchasePrompt] = useState(false);
  const { data: config, mutate } = useSWR<AppSetting | null>(
    "/api/settings",
    fetcher
  );

  useEffect(() => {
    if (!config) {
      return;
    }

    form.setFieldsValue({
      channelId: config.channelId,
      syncDays: config.syncDays,
      maxSyncDays: config.maxSyncDays,
      aiTranscriptFallback: Boolean(
        (config as { aiTranscriptFallback?: boolean }).aiTranscriptFallback
      ),
      firstPrompt: config.firstPrompt || "",
      purchasePrompt: config.purchasePrompt || "",
      commentReplyModel: config.commentReplyModel || "gpt-5-mini",
      transcriptSummaryModel: config.transcriptSummaryModel || "gpt-5-mini",
      productEmbeddingModel: config.productEmbeddingModel || "gpt-5-mini",
    } satisfies Partial<SettingsFormValues>);
  }, [config, form]);

  // Get current effective prompt (custom or default)
  const getCurrentFirstPrompt = () => {
    return config?.firstPrompt || FIRST_PROMPT;
  };

  const getCurrentPurchasePrompt = () => {
    return config?.purchasePrompt || PURCHASE_PROMPT;
  };

  // Load current prompt to form (for editing)
  const loadFirstPromptToForm = () => {
    form.setFieldValue("firstPrompt", getCurrentFirstPrompt());
    setEditingFirstPrompt(true);
  };

  const loadPurchasePromptToForm = () => {
    form.setFieldValue("purchasePrompt", getCurrentPurchasePrompt());
    setEditingPurchasePrompt(true);
  };

  // Reset to default prompt
  const resetFirstPromptToDefault = () => {
    form.setFieldValue("firstPrompt", "");
    message.success("First Prompt will use default after saving");
  };

  const resetPurchasePromptToDefault = () => {
    form.setFieldValue("purchasePrompt", "");
    message.success("Purchase Prompt will use default after saving");
  };

  async function handleSubmit(values: SettingsFormValues) {
    try {
      await axios.post("/api/settings", values);
      message.success("Settings saved successfully");
      setEditingFirstPrompt(false);
      setEditingPurchasePrompt(false);
      mutate(); // Refresh data
    } catch (error) {
      console.error(error);
      message.error("Failed to save settings");
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Settings</h1>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          channelId: config?.channelId,
          syncDays: config?.syncDays ?? 14,
          maxSyncDays: config?.maxSyncDays ?? 30,
          aiTranscriptFallback: Boolean(
            (config as { aiTranscriptFallback?: boolean } | undefined)
              ?.aiTranscriptFallback
          ),
          firstPrompt: config?.firstPrompt || "",
          purchasePrompt: config?.purchasePrompt || "",
          commentReplyModel: config?.commentReplyModel || "gpt-5-mini",
          transcriptSummaryModel:
            config?.transcriptSummaryModel || "gpt-5-mini",
          productEmbeddingModel: config?.productEmbeddingModel || "gpt-5-mini",
        }}
        onFinish={handleSubmit}
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          {/* General Settings Tab */}
          <TabPane tab="General" key="1">
            <div style={{ maxWidth: 600 }}>
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
              <Form.Item
                name="aiTranscriptFallback"
                label="AI Transcript Fallback"
                valuePropName="checked"
                tooltip="เมื่อไม่มีคำบรรยายจาก YouTube จะเรียก AI API เพื่อช่วยประมวลผลวิดีโอ"
              >
                <Checkbox>
                  ส่งวิดีโอให้ AI ถอดคำบรรยายเมื่อไม่มี transcript
                </Checkbox>
              </Form.Item>
            </div>
          </TabPane>

          {/* Prompts & Models Tab */}
          <TabPane tab="Prompts & Models" key="2">
            <div style={{ maxWidth: 900 }}>
              <h3 style={{ marginBottom: 16 }}>AI Prompts</h3>

              <Form.Item
                name="firstPrompt"
                label={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <span>
                      First Prompt (Stage 1: Classification & Intent Analysis)
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!editingFirstPrompt ? (
                        <>
                          <Button
                            size="small"
                            type="default"
                            onClick={loadFirstPromptToForm}
                          >
                            Edit
                          </Button>
                          {config?.firstPrompt && (
                            <Button
                              size="small"
                              type="default"
                              onClick={resetFirstPromptToDefault}
                            >
                              Use Default
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="small"
                          type="default"
                          onClick={() => {
                            form.setFieldValue(
                              "firstPrompt",
                              config?.firstPrompt || ""
                            );
                            setEditingFirstPrompt(false);
                          }}
                        >
                          Cancel Edit
                        </Button>
                      )}
                    </div>
                  </div>
                }
                tooltip="Prompt สำหรับ AI ขั้นตอนแรกในการวิเคราะห์เจตนาของคำถาม"
                extra={
                  <small style={{ color: "#666" }}>
                    {config?.firstPrompt
                      ? "🔧 Using custom prompt"
                      : "✓ Using default prompt"}{" "}
                    {editingFirstPrompt && "(Editing...)"}
                  </small>
                }
              >
                <TextArea
                  rows={12}
                  disabled={!editingFirstPrompt}
                  placeholder={
                    editingFirstPrompt
                      ? ""
                      : "Click 'Edit' to modify the prompt"
                  }
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </Form.Item>

              <Form.Item
                name="purchasePrompt"
                label={
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <span>
                      Purchase Prompt (Stage 2: Purchase Recommendation)
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!editingPurchasePrompt ? (
                        <>
                          <Button
                            size="small"
                            type="default"
                            onClick={loadPurchasePromptToForm}
                          >
                            Edit
                          </Button>
                          {config?.purchasePrompt && (
                            <Button
                              size="small"
                              type="default"
                              onClick={resetPurchasePromptToDefault}
                            >
                              Use Default
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          size="small"
                          type="default"
                          onClick={() => {
                            form.setFieldValue(
                              "purchasePrompt",
                              config?.purchasePrompt || ""
                            );
                            setEditingPurchasePrompt(false);
                          }}
                        >
                          Cancel Edit
                        </Button>
                      )}
                    </div>
                  </div>
                }
                tooltip="Prompt สำหรับ AI ขั้นตอนที่สองในการแนะนำสินค้า"
                extra={
                  <small style={{ color: "#666" }}>
                    {config?.purchasePrompt
                      ? "🔧 Using custom prompt"
                      : "✓ Using default prompt"}{" "}
                    {editingPurchasePrompt && "(Editing...)"}
                  </small>
                }
              >
                <TextArea
                  rows={12}
                  disabled={!editingPurchasePrompt}
                  placeholder={
                    editingPurchasePrompt
                      ? ""
                      : "Click 'Edit' to modify the prompt"
                  }
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </Form.Item>

              <h3 style={{ marginTop: 32, marginBottom: 16 }}>
                Model Selection
              </h3>

              <Form.Item
                name="commentReplyModel"
                label="1. การตอบ Comment"
                tooltip="Model ที่ใช้สำหรับการตอบคอมเมนต์ (Stage 1 & Stage 2)"
              >
                <Select options={MODEL_OPTIONS} style={{ width: 300 }} />
              </Form.Item>

              <Form.Item
                name="transcriptSummaryModel"
                label="2. การสรุป Transcript"
                tooltip="Model ที่ใช้สำหรับสรุปเนื้อหาจากวิดีโอ"
              >
                <Select options={MODEL_OPTIONS} style={{ width: 300 }} />
              </Form.Item>

              <Form.Item
                name="productEmbeddingModel"
                label="3. การ Embedding Product"
                tooltip="Model ที่ใช้สำหรับสร้าง embeddings ของข้อมูลสินค้า"
              >
                <Select options={MODEL_OPTIONS} style={{ width: 300 }} />
              </Form.Item>
            </div>
          </TabPane>
        </Tabs>

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large">
            Save Settings
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
