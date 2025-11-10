"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Button, Space } from "antd";
import { RocketOutlined, SendOutlined } from "@ant-design/icons";
import type { Draft, Comment } from "@prisma/client";
import VideoList from "./VideoList.client";
import CommentDetail from "./CommentDetail.client";
import AIProceedModal from "./AIProceedModal";
import PostAllReplyModal from "./PostAllReplyModal";

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

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export default function ModerationLayout() {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [aiProceedModalVisible, setAiProceedModalVisible] = useState(false);
  const [postAllReplyModalVisible, setPostAllReplyModalVisible] = useState(false);

  const { data: groups = [], mutate } = useSWR<VideoGroup[]>("/api/comments/grouped", fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const selectedGroup = selectedVideoId ? groups.find((g) => g.videoId === selectedVideoId) || null : null;

  // Auto-select first video if none selected
  if (!selectedVideoId && groups.length > 0) {
    setSelectedVideoId(groups[0].videoId);
  }

  const eligibleVideosCount = groups.filter((group) => {
    const commentsWithoutDrafts = group.comments.filter((c) => !c.draft);
    return group.hasTranscript && commentsWithoutDrafts.length > 0;
  }).length;

  const pendingCommentsCount = groups.reduce((count, group) => {
    return count + group.comments.filter((c) => c.draft && c.draft.status === "PENDING").length;
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%", overflow: "hidden" }}>
      {/* Top Bar with AI Proceed Button */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #f0f0f0",
        background: "#fafafa",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>
          Comment Moderation
        </div>
        <Space>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={() => setAiProceedModalVisible(true)}
            disabled={eligibleVideosCount === 0}
          >
            AI Proceed ({eligibleVideosCount})
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => setPostAllReplyModalVisible(true)}
            disabled={pendingCommentsCount === 0}
            style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
          >
            Post All Reply ({pendingCommentsCount})
          </Button>
        </Space>
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Column 1: Sidebar (managed by parent layout) */}

        {/* Column 2: Video List */}
        <div style={{ width: "400px", flexShrink: 0 }}>
          <VideoList groups={groups} selectedVideoId={selectedVideoId} onSelectVideo={setSelectedVideoId} />
        </div>

        {/* Column 3: Comment Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommentDetail group={selectedGroup} onRefresh={mutate} />
        </div>
      </div>

      {/* AI Proceed Modal */}
      <AIProceedModal
        visible={aiProceedModalVisible}
        groups={groups}
        onClose={() => setAiProceedModalVisible(false)}
        onComplete={() => {
          mutate(); // Refresh data after processing
        }}
      />

      {/* Post All Reply Modal */}
      <PostAllReplyModal
        visible={postAllReplyModalVisible}
        groups={groups}
        onClose={() => setPostAllReplyModalVisible(false)}
        onComplete={() => {
          mutate(); // Refresh data after processing
        }}
      />
    </div>
  );
}
