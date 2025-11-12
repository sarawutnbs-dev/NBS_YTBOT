"use client";

import { useState, useMemo } from "react";
import { List, Tag, Typography, Space, Select, Checkbox, Dropdown, Button } from "antd";
import { FilterOutlined, SortAscendingOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, SendOutlined, FileTextOutlined, MinusCircleOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { format } from "date-fns";
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

type SortOption = "latest-comment" | "latest-video" | "video-name";
type CommentStatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "POSTED" | "NO_DRAFT";
type VideoStatusFilter = "ALL" | "READY" | "FAILED";

interface VideoListProps {
  groups: VideoGroup[];
  selectedVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
}

export default function VideoList({ groups, selectedVideoId, onSelectVideo }: VideoListProps) {
  const [sortBy, setSortBy] = useState<SortOption>("latest-comment");
  const [commentStatusFilters, setCommentStatusFilters] = useState<CommentStatusFilter[]>(["ALL"]);
  const [videoStatusFilters, setVideoStatusFilters] = useState<VideoStatusFilter[]>(["ALL"]);

  // Filter and sort groups
  const filteredAndSortedGroups = useMemo(() => {
    let filtered = [...groups];

    // Filter by video status
    if (!videoStatusFilters.includes("ALL")) {
      filtered = filtered.filter((group) => {
        if (videoStatusFilters.includes("READY") && group.hasTranscript) return true;
        if (videoStatusFilters.includes("FAILED") && !group.hasTranscript) return true;
        return false;
      });
    }

    // Filter by comment status
    if (!commentStatusFilters.includes("ALL")) {
      filtered = filtered.filter((group) => {
        return group.comments.some((comment) => {
          if (commentStatusFilters.includes("NO_DRAFT") && !comment.draft) return true;
          if (comment.draft && commentStatusFilters.includes(comment.draft.status as CommentStatusFilter)) return true;
          return false;
        });
      });
    }

    // Hide videos with both noDraft = 0 and pending = 0
    filtered = filtered.filter((group) => {
      const noDraft = group.comments.filter((c) => !c.draft).length;
      const pending = group.comments.filter((c) => c.draft?.status === "PENDING").length;
      return noDraft > 0 || pending > 0;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "latest-comment":
          return new Date(b.latestCommentDate).getTime() - new Date(a.latestCommentDate).getTime();
        case "latest-video":
          if (!a.videoPublishedAt || !b.videoPublishedAt) return 0;
          return new Date(b.videoPublishedAt).getTime() - new Date(a.videoPublishedAt).getTime();
        case "video-name":
          return a.videoTitle.localeCompare(b.videoTitle, "th");
        default:
          return 0;
      }
    });

    return filtered;
  }, [groups, sortBy, commentStatusFilters, videoStatusFilters]);

  const commentStatusOptions = [
    { label: "ทั้งหมด", value: "ALL" },
    { label: "รอดำเนินการ", value: "PENDING" },
    { label: "อนุมัติแล้ว", value: "APPROVED" },
    { label: "ปฏิเสธ", value: "REJECTED" },
    { label: "โพสต์แล้ว", value: "POSTED" },
    { label: "ยังไม่มีร่าง", value: "NO_DRAFT" },
  ];

  const videoStatusOptions = [
    { label: "ทั้งหมด", value: "ALL" },
    { label: "พร้อมใช้งาน", value: "READY" },
    { label: "ไม่พร้อม", value: "FAILED" },
  ];

  const getCommentStatusCounts = (group: VideoGroup) => {
    const pending = group.comments.filter((c) => c.draft?.status === "PENDING").length;
    const noDraft = group.comments.filter((c) => !c.draft).length;
    const posted = group.comments.filter((c) => c.draft?.status === "POSTED").length;
    return { pending, noDraft, posted, total: group.comments.length };
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", borderRight: "1px solid #f0f0f0" }}>
      {/* Header with filters */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" }}>
        <Space size={8} style={{ width: "100%" }}>
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ flex: 1, minWidth: 120 }}
            size="small"
            bordered={false}
            suffixIcon={<SortAscendingOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />}
            options={[
              { label: "Comment ล่าสุด", value: "latest-comment" },
              { label: "VDO ล่าสุด", value: "latest-video" },
              { label: "ชื่อ VDO", value: "video-name" },
            ]}
          />

          <Dropdown
            trigger={["click"]}
            dropdownRender={() => (
              <div style={{ background: "white", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", padding: 8 }}>
                <Checkbox.Group
                  value={commentStatusFilters}
                  onChange={(values) => {
                    const checkedValues = values as CommentStatusFilter[];

                    // ถ้าไม่มีค่าใดๆ ให้กลับไปเป็น ALL
                    if (checkedValues.length === 0) {
                      setCommentStatusFilters(["ALL"]);
                      return;
                    }

                    // ถ้า ALL เพิ่งถูกเลือก (ไม่อยู่ใน state เก่า แต่อยู่ใน values ใหม่)
                    const wasAllSelected = commentStatusFilters.includes("ALL");
                    const isAllSelected = checkedValues.includes("ALL");

                    if (isAllSelected && !wasAllSelected) {
                      // User เพิ่งกด ALL -> เลือก ALL อย่างเดียว
                      setCommentStatusFilters(["ALL"]);
                    } else if (isAllSelected && checkedValues.length > 1) {
                      // User กด checkbox อื่นขณะที่ ALL ถูกเลือกอยู่ -> ยกเลิก ALL
                      setCommentStatusFilters(checkedValues.filter((v) => v !== "ALL"));
                    } else {
                      // กรณีปกติ
                      setCommentStatusFilters(checkedValues);
                    }
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {commentStatusOptions.map((opt) => (
                    <Checkbox key={opt.value} value={opt.value} style={{ fontSize: 12 }}>
                      {opt.label}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              icon={<FilterOutlined style={{ fontSize: 12 }} />}
              style={{ fontSize: 12, padding: "0 8px" }}
            >
              Comment{commentStatusFilters.includes("ALL") ? "" : `: ${commentStatusFilters.length}`}
            </Button>
          </Dropdown>

          <Dropdown
            trigger={["click"]}
            dropdownRender={() => (
              <div style={{ background: "white", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", padding: 8 }}>
                <Checkbox.Group
                  value={videoStatusFilters}
                  onChange={(values) => {
                    const checkedValues = values as VideoStatusFilter[];

                    // ถ้าไม่มีค่าใดๆ ให้กลับไปเป็น ALL
                    if (checkedValues.length === 0) {
                      setVideoStatusFilters(["ALL"]);
                      return;
                    }

                    // ถ้า ALL เพิ่งถูกเลือก (ไม่อยู่ใน state เก่า แต่อยู่ใน values ใหม่)
                    const wasAllSelected = videoStatusFilters.includes("ALL");
                    const isAllSelected = checkedValues.includes("ALL");

                    if (isAllSelected && !wasAllSelected) {
                      // User เพิ่งกด ALL -> เลือก ALL อย่างเดียว
                      setVideoStatusFilters(["ALL"]);
                    } else if (isAllSelected && checkedValues.length > 1) {
                      // User กด checkbox อื่นขณะที่ ALL ถูกเลือกอยู่ -> ยกเลิก ALL
                      setVideoStatusFilters(checkedValues.filter((v) => v !== "ALL"));
                    } else {
                      // กรณีปกติ
                      setVideoStatusFilters(checkedValues);
                    }
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {videoStatusOptions.map((opt) => (
                    <Checkbox key={opt.value} value={opt.value} style={{ fontSize: 12 }}>
                      {opt.label}
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </div>
            )}
          >
            <Button
              size="small"
              type="text"
              icon={<FilterOutlined style={{ fontSize: 12 }} />}
              style={{ fontSize: 12, padding: "0 8px" }}
            >
              VDO{videoStatusFilters.includes("ALL") ? "" : `: ${videoStatusFilters.length}`}
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* Video List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <List
          dataSource={filteredAndSortedGroups}
          renderItem={(group) => {
            const counts = getCommentStatusCounts(group);
            const isSelected = selectedVideoId === group.videoId;

            // Background color based on transcript status
            const bgColor = isSelected
              ? "#e6f7ff"
              : !group.hasTranscript
              ? "#f5f5f5"
              : "white";

            return (
              <List.Item
                onClick={() => onSelectVideo(group.videoId)}
                style={{
                  cursor: "pointer",
                  background: bgColor,
                  borderLeft: isSelected ? "3px solid #1890ff" : "3px solid transparent",
                  padding: "12px 16px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = !group.hasTranscript ? "#e8e8e8" : "#fafafa";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = bgColor;
                  }
                }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Text style={{ fontWeight: 500, fontSize: 14 }}>
                    {group.videoTitle}
                  </Text>

                  {/* Single line: Date / Video Status / Comment Statuses (Draft & Pending only) */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <Space size={8} style={{ fontSize: 11 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        📅 {group.videoPublishedAt ? format(new Date(group.videoPublishedAt), "dd/MM/yy") : "N/A"}
                      </Text>

                      {group.hasTranscript ? (
                        <Space size={4}>
                          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 12 }} />
                          <Text style={{ fontSize: 11, color: "#52c41a" }}>พร้อม</Text>
                        </Space>
                      ) : (
                        <Space size={4}>
                          <MinusCircleOutlined style={{ color: "#fa8c16", fontSize: 12 }} />
                          <Text style={{ fontSize: 11, color: "#fa8c16" }}>ไม่มี Script</Text>
                        </Space>
                      )}
                    </Space>

                    <Space size={8} style={{ fontSize: 11 }}>
                      {counts.noDraft > 0 && (
                        <Space size={4}>
                          <FileTextOutlined style={{ color: "#8c8c8c", fontSize: 12 }} />
                          <Text style={{ fontSize: 11, color: "#8c8c8c" }}>{counts.noDraft}</Text>
                        </Space>
                      )}

                      {counts.pending > 0 && (
                        <Space size={4}>
                          <ClockCircleOutlined style={{ color: "#fa8c16", fontSize: 12 }} />
                          <Text style={{ fontSize: 11, color: "#fa8c16" }}>{counts.pending}</Text>
                        </Space>
                      )}
                    </Space>
                  </div>
                </Space>
              </List.Item>
            );
          }}
        />
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #f0f0f0", background: "#fafafa" }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {filteredAndSortedGroups.length} วิดีโอ
        </Text>
      </div>
    </div>
  );
}
