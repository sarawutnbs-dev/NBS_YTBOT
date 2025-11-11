"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Button, Space } from "antd";
import { CheckOutlined, SendOutlined } from "@ant-design/icons";
import type { Draft, Comment } from "@prisma/client";
import VideoList from "./VideoList.client";
import CommentDetail from "./CommentDetail.client";
import PostAllReplyModal from "./PostAllReplyModal";
import AIProceedBatchModal from "./AIProceedBatchModal";

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
  const [showPostAllModal, setShowPostAllModal] = useState(false);
  const [showAIProceedBatchModal, setShowAIProceedBatchModal] = useState(false);

  const { data: groups = [], mutate } = useSWR<VideoGroup[]>("/api/comments/grouped", fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const selectedGroup = selectedVideoId ? groups.find((g) => g.videoId === selectedVideoId) || null : null;

  // Auto-select first video if none selected
  if (!selectedVideoId && groups.length > 0) {
    setSelectedVideoId(groups[0].videoId);
  }

  // Count pending drafts across all videos
  const pendingDraftsCount = groups.reduce((count, group) => {
    return count + group.comments.filter((c) => c.draft?.status === "PENDING").length;
  }, 0);

  // Count comments without drafts across all videos with transcripts
  const commentsWithoutDraftsCount = groups.reduce((count, group) => {
    if (!group.hasTranscript) return count;
    return count + group.comments.filter((c) => !c.draft).length;
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%", overflow: "hidden" }}>
      {/* Top Header Bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", background: "#fafafa", display: "flex", justifyContent: "flex-end" }}>
        <Space>
          <Button
            type="text"
            icon={<SendOutlined />}
            onClick={() => setShowAIProceedBatchModal(true)}
            disabled={commentsWithoutDraftsCount === 0}
            size="small"
            style={{
              color: commentsWithoutDraftsCount === 0 ? undefined : '#1890ff',
              fontWeight: 500,
              fontSize: '13px'
            }}
          >
            AI Proceed Batch ({commentsWithoutDraftsCount})
          </Button>
          <Button
            type="text"
            icon={<CheckOutlined />}
            onClick={() => setShowPostAllModal(true)}
            disabled={pendingDraftsCount === 0}
            size="small"
            style={{
              color: pendingDraftsCount === 0 ? undefined : '#52c41a',
              fontWeight: 500,
              fontSize: '13px'
            }}
          >
            Post All Reply ({pendingDraftsCount})
          </Button>
        </Space>
      </div>

      {/* Main Content: Column 2 & 3 */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Column 2: Video List */}
        <div style={{ width: "400px", flexShrink: 0 }}>
          <VideoList groups={groups} selectedVideoId={selectedVideoId} onSelectVideo={setSelectedVideoId} />
        </div>

        {/* Column 3: Comment Detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommentDetail group={selectedGroup} onRefresh={mutate} />
        </div>
      </div>

      {/* AI Proceed Batch Modal */}
      <AIProceedBatchModal
        visible={showAIProceedBatchModal}
        groups={groups}
        onClose={() => setShowAIProceedBatchModal(false)}
        onComplete={() => {
          setShowAIProceedBatchModal(false);
          mutate();
        }}
      />

      {/* Post All Reply Modal */}
      <PostAllReplyModal
        visible={showPostAllModal}
        groups={groups}
        onClose={() => setShowPostAllModal(false)}
        onComplete={() => {
          setShowPostAllModal(false);
          mutate();
        }}
      />
    </div>
  );
}
