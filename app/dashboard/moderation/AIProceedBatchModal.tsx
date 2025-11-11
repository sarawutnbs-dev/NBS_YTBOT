"use client";

import { useState, useEffect } from "react";
import { Modal, Checkbox, List, Typography, Progress, Space, Alert, Button, Card } from "antd";
import { MessageOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { format } from "date-fns";
import axios from "axios";
import type { Draft, Comment } from "@prisma/client";

const { Text, Paragraph } = Typography;

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
  commentsProcessed?: number;
};

interface AIProceedBatchModalProps {
  visible: boolean;
  groups: VideoGroup[];
  onClose: () => void;
  onComplete: () => void;
}

export default function AIProceedBatchModal({ visible, groups, onClose, onComplete }: AIProceedBatchModalProps) {
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoStatuses, setVideoStatuses] = useState<Map<string, VideoProcessStatus>>(new Map());

  // Filter videos that have transcript and comments without drafts
  const eligibleVideos = groups.filter((group) =>
    group.hasTranscript && group.comments.some((c) => !c.draft)
  );

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
      const video = eligibleVideos.find((v) => v.videoId === videoId);
      if (!video) continue;

      const commentsWithoutDrafts = video.comments.filter((c) => !c.draft).length;

      setCurrentIndex(i);

      // Update status to processing
      newStatuses.set(videoId, { videoId, status: "processing", commentsProcessed: commentsWithoutDrafts });
      setVideoStatuses(new Map(newStatuses));

      try {
        // Call API to generate drafts for this video
        const response = await axios.post("/api/drafts/generate-video", { videoId });

        // Update status to success
        newStatuses.set(videoId, {
          videoId,
          status: "success",
          message: response.data.message || "Generated drafts successfully",
          commentsProcessed: commentsWithoutDrafts,
        });
        setVideoStatuses(new Map(newStatuses));
      } catch (error: any) {
        // Update status to error
        const errorMsg = error.response?.data?.error || "Failed to generate drafts";
        newStatuses.set(videoId, {
          videoId,
          status: "error",
          message: errorMsg,
          commentsProcessed: commentsWithoutDrafts,
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
      title="AI Proceed Batch - Generate Drafts for Multiple Videos"
      open={visible}
      onCancel={handleClose}
      width={900}
      footer={
        processing ? null : (
          <Space>
            <Button onClick={handleClose}>Close</Button>
            <Button
              type="primary"
              onClick={handleProcess}
              disabled={selectedVideoIds.length === 0 || processing}
            >
              Generate Drafts {selectedVideoIds.length > 0 ? `for ${selectedVideoIds.length} Video(s)` : ""}
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
          message={`Found ${eligibleVideos.length} video(s) with transcripts and comments without drafts`}
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
        <div style={{ maxHeight: "500px", overflowY: "auto" }}>
          {eligibleVideos.length === 0 ? (
            <Alert
              message="No eligible videos"
              description="All videos either don't have transcripts or all comments already have drafts."
              type="warning"
              showIcon
            />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {eligibleVideos.map((video) => {
                const isSelected = selectedVideoIds.includes(video.videoId);
                const videoStatus = videoStatuses.get(video.videoId);
                const commentsWithoutDrafts = video.comments.filter((c) => !c.draft).length;

                return (
                  <Card
                    key={video.videoId}
                    size="small"
                    style={{
                      background: isSelected ? "#fafafa" : "white",
                      border: isSelected ? "2px solid #1890ff" : "1px solid #e8e8e8",
                      borderRadius: 8,
                    }}
                  >
                    <Space direction="vertical" style={{ width: "100%" }} size={12}>
                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Space>
                          {!processing && (
                            <Checkbox
                              checked={isSelected}
                              onChange={(e) => handleToggleVideo(video.videoId, e.target.checked)}
                            />
                          )}
                          <VideoCameraOutlined style={{ fontSize: 16, color: "#1890ff" }} />
                          <Text strong style={{ fontSize: 13 }}>
                            {video.videoTitle}
                          </Text>
                        </Space>
                        <Space size={8}>
                          {videoStatus && getStatusIcon(videoStatus.status)}
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {commentsWithoutDrafts} comment(s) without draft
                          </Text>
                        </Space>
                      </div>

                      {/* Status Message */}
                      {videoStatus && videoStatus.message && (
                        <Text
                          type={videoStatus.status === "error" ? "danger" : "success"}
                          style={{ fontSize: 11 }}
                        >
                          {videoStatus.status === "error" ? "❌" : "✅"} {videoStatus.message}
                        </Text>
                      )}
                    </Space>
                  </Card>
                );
              })}
            </Space>
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
