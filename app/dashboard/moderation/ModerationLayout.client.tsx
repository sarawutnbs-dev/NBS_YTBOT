"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import type { Draft, Comment } from "@prisma/client";
import VideoList from "./VideoList.client";
import CommentDetail from "./CommentDetail.client";

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

  const { data: groups = [], mutate } = useSWR<VideoGroup[]>("/api/comments/grouped", fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const selectedGroup = selectedVideoId ? groups.find((g) => g.videoId === selectedVideoId) || null : null;

  // Auto-select first video if none selected
  if (!selectedVideoId && groups.length > 0) {
    setSelectedVideoId(groups[0].videoId);
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden" }}>
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
  );
}
