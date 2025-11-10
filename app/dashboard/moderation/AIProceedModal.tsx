"use client";

import { useState, useEffect } from "react";
import { Modal, Checkbox, List, Typography, Progress, Space, Tag, Alert, Button } from "antd";
import { VideoCameraOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import axios from "axios";
import type { Draft, Comment } from "@prisma/client";

const { Text } = Typography;

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

type VideoProcessStatus = {
  videoId: string;
  status: ProcessStatus;
  message?: string;
  commentsCount?: number;
};

interface AIProceedModalProps {
  visible: boolean;
  groups: VideoGroup[];
  onClose: () => void;
  onComplete: () => void;
}

export default function AIProceedModal({ visible, groups, onClose, onComplete }: AIProceedModalProps) {
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoStatuses, setVideoStatuses] = useState<Map<string, VideoProcessStatus>>(new Map());

  // Filter videos that have comments without drafts and have transcript
  const eligibleVideos = groups.filter((group) => {
    const commentsWithoutDrafts = group.comments.filter((c) => !c.draft);
    return group.hasTranscript && commentsWithoutDrafts.length > 0;
  });

  useEffect(() => {
    if (visible) {
      // Reset state when modal opens
      setSelectedVideoIds([]);
      setProcessing(false);
      setCurrentIndex(0);
      setVideoStatuses(new Map());
    }
  }, [visible]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVideoIds(eligibleVideos.map((v) => v.videoId));
    } else {
      setSelectedVideoIds([]);
    }
  };

  const handleToggleVideo = (videoId: string, checked: boolean) => {
    if (checked) {
      setSelectedVideoIds([...selectedVideoIds, videoId]);
    } else {
      setSelectedVideoIds(selectedVideoIds.filter((id) => id !== videoId));
    }
  };

  const handleProcess = async () => {
    if (selectedVideoIds.length === 0) return;

    setProcessing(true);
    const newStatuses = new Map<string, VideoProcessStatus>();

    // Initialize all selected videos as pending
    selectedVideoIds.forEach((videoId) => {
      newStatuses.set(videoId, { videoId, status: "pending" });
    });
    setVideoStatuses(new Map(newStatuses));

    // Process videos one by one
    for (let i = 0; i < selectedVideoIds.length; i++) {
      const videoId = selectedVideoIds[i];
      setCurrentIndex(i);

      // Update status to processing
      newStatuses.set(videoId, { videoId, status: "processing" });
      setVideoStatuses(new Map(newStatuses));

      try {
        const response = await axios.post("/api/drafts/generate-video", { videoId });

        // Update status to success
        newStatuses.set(videoId, {
          videoId,
          status: "success",
          message: response.data.message,
          commentsCount: response.data.generatedDrafts,
        });
        setVideoStatuses(new Map(newStatuses));
      } catch (error: any) {
        // Update status to error
        const errorMsg = error.response?.data?.error || "Failed to process";
        newStatuses.set(videoId, {
          videoId,
          status: "error",
          message: errorMsg,
        });
        setVideoStatuses(new Map(newStatuses));
      }
    }

    setProcessing(false);
    setCurrentIndex(selectedVideoIds.length);

    // Refresh the parent component data
    onComplete();
  };

  const handleClose = () => {
    if (!processing) {
      onClose();
    }
  };

  const progressPercent = selectedVideoIds.length > 0
    ? Math.round(((currentIndex + (processing ? 0 : 0)) / selectedVideoIds.length) * 100)
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

  return (
    <Modal
      title="AI Proceed - Generate Drafts for Multiple Videos"
      open={visible}
      onCancel={handleClose}
      width={700}
      footer={
        processing ? null : (
          <Space>
            <Button onClick={handleClose}>Close</Button>
            <Button
              type="primary"
              onClick={handleProcess}
              disabled={selectedVideoIds.length === 0 || processing}
            >
              Process {selectedVideoIds.length > 0 ? `${selectedVideoIds.length} Video(s)` : ""}
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
          message={`Found ${eligibleVideos.length} video(s) with comments that need draft replies`}
          type="info"
          showIcon
        />

        {/* Progress Bar (shown when processing) */}
        {processing && (
          <Space direction="vertical" style={{ width: "100%" }} size={8}>
            <Text strong>
              Processing: {currentIndex + 1} / {selectedVideoIds.length}
            </Text>
            <Progress percent={progressPercent} status={processing ? "active" : "success"} />
          </Space>
        )}

        {/* Select All */}
        {!processing && eligibleVideos.length > 0 && (
          <Checkbox
            checked={selectedVideoIds.length === eligibleVideos.length}
            indeterminate={selectedVideoIds.length > 0 && selectedVideoIds.length < eligibleVideos.length}
            onChange={(e) => handleSelectAll(e.target.checked)}
          >
            <Text strong>Select All ({eligibleVideos.length})</Text>
          </Checkbox>
        )}

        {/* Video List */}
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {eligibleVideos.length === 0 ? (
            <Alert
              message="No videos available"
              description="All videos either don't have transcripts or don't have comments without drafts."
              type="warning"
              showIcon
            />
          ) : (
            <List
              dataSource={eligibleVideos}
              renderItem={(group) => {
                const commentsWithoutDrafts = group.comments.filter((c) => !c.draft);
                const isSelected = selectedVideoIds.includes(group.videoId);
                const videoStatus = videoStatuses.get(group.videoId);

                return (
                  <List.Item
                    style={{
                      padding: "12px",
                      background: isSelected ? "#f0f5ff" : "white",
                      borderRadius: 4,
                      marginBottom: 8,
                      border: isSelected ? "1px solid #1890ff" : "1px solid #f0f0f0",
                    }}
                  >
                    <Space direction="vertical" style={{ width: "100%" }} size={4}>
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space>
                          {!processing && (
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => handleToggleVideo(group.videoId, e.target.checked)}
                            />
                          )}
                          <VideoCameraOutlined />
                          <Text strong style={{ fontSize: 13 }}>
                            {group.videoTitle}
                          </Text>
                        </Space>
                        {videoStatus && getStatusIcon(videoStatus.status)}
                      </Space>

                      <Space size={8} style={{ paddingLeft: processing ? 0 : 22 }}>
                        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>
                          {commentsWithoutDrafts.length} comment(s) without draft
                        </Tag>
                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
                          Has Transcript
                        </Tag>
                      </Space>

                      {videoStatus && videoStatus.message && (
                        <div style={{ paddingLeft: processing ? 0 : 22 }}>
                          <Text
                            type={videoStatus.status === "error" ? "danger" : "secondary"}
                            style={{ fontSize: 12 }}
                          >
                            {videoStatus.message}
                            {videoStatus.commentsCount !== undefined &&
                              ` (${videoStatus.commentsCount} draft(s) generated)`}
                          </Text>
                        </div>
                      )}
                    </Space>
                  </List.Item>
                );
              }}
            />
          )}
        </div>

        {/* Summary (shown after processing) */}
        {!processing && videoStatuses.size > 0 && (
          <Alert
            message="Processing Complete"
            description={
              <Space direction="vertical" size={4}>
                <Text>
                  ✅ Success:{" "}
                  {Array.from(videoStatuses.values()).filter((s) => s.status === "success").length}
                </Text>
                <Text>
                  ❌ Failed:{" "}
                  {Array.from(videoStatuses.values()).filter((s) => s.status === "error").length}
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
